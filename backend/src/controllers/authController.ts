import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { env } from '../config/env';
import { logAuthEvent } from '../services/authEventService';
import { sendPasswordResetEmail } from '../services/emailService';
import { accessTokenCookieOptions, refreshTokenCookieOptions } from '../config/cookies';
import { loginSchema, passwordResetSchema, passwordResetConfirmSchema, formatZodIssues } from '../validation/schemas';

const generateTokens = (user: { id: string; email: string; organization_id: string; role: { name: string } }) => {
    const payload = {
        userId: user.id,
        email: user.email,
        role: user.role.name,
        organization_id: user.organization_id,
    };

    const accessToken = jwt.sign(payload, env.jwtSecret, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, env.jwtSecret, { expiresIn: '7d' });

    return { accessToken, refreshToken };
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';

        if (!rawEmail || !rawPassword) {
            await logAuthEvent(req, {
                email: rawEmail || null,
                eventType: 'login_attempt',
                outcome: 'failure',
                reason: 'missing_credentials',
                metadata: {
                    missing: [
                        !rawEmail ? 'email' : null,
                        !rawPassword ? 'password' : null,
                    ].filter(Boolean),
                },
            });
            res.status(400).json({ message: 'Email and password are required' });
            return;
        }

        const parseResult = loginSchema.safeParse(req.body);
        if (!parseResult.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: formatZodIssues(parseResult.error),
            });
            return;
        }

        const { email, password } = parseResult.data;

        const user = await prisma.user.findFirst({
            where: { email: email.toLowerCase() },
            include: { role: true },
            // mfa_enabled and mfa_secret are selected by default (scalar fields)
        });

        if (!user) {
            await logAuthEvent(req, {
                email: email.toLowerCase(),
                eventType: 'login_attempt',
                outcome: 'failure',
                reason: 'user_not_found',
            });
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }

        if (!user.is_active) {
            await logAuthEvent(req, {
                userId: user.id,
                email: user.email,
                organizationId: user.organization_id,
                eventType: 'login_attempt',
                outcome: 'failure',
                reason: 'account_disabled',
            });
            res.status(401).json({ message: 'Account disabled' });
            return;
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            await logAuthEvent(req, {
                userId: user.id,
                email: user.email,
                organizationId: user.organization_id,
                eventType: 'login_attempt',
                outcome: 'failure',
                reason: 'invalid_password',
            });
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }

        await logAuthEvent(req, {
            userId: user.id,
            email: user.email,
            organizationId: user.organization_id,
            eventType: 'login_attempt',
            outcome: 'success',
            metadata: { role: user.role.name },
        });

        // If MFA is enabled, return a short-lived challenge token instead of a full session
        if ((user as any).mfa_enabled) {
            const challengeToken = jwt.sign(
                { userId: user.id, type: 'mfa_challenge' },
                env.jwtSecret,
                { expiresIn: '5m' }
            );
            res.status(200).json({ mfa_required: true, mfa_challenge_token: challengeToken });
            return;
        }

        const { accessToken, refreshToken } = generateTokens(user);

        res.cookie('access_token', accessToken, accessTokenCookieOptions);
        res.cookie('refresh_token', refreshToken, refreshTokenCookieOptions);

        // NOTE: refreshToken is delivered ONLY via the httpOnly cookie set above.
        // Returning it in the JSON body would allow XSS to steal the 7-day token
        // and bypass cookie protections entirely.
        res.status(200).json({
            token: accessToken,
            user: {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                role: user.role.name,
                organization_id: user.organization_id,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const logout = async (_req: Request, res: Response): Promise<void> => {
    res.clearCookie('access_token', { path: '/', httpOnly: true });
    res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh', httpOnly: true });
    res.status(200).json({ message: 'Logged out successfully' });
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const parseResult = passwordResetSchema.safeParse(req.body);
        if (!parseResult.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: formatZodIssues(parseResult.error),
            });
            return;
        }

        const { email } = parseResult.data;
        const user = await prisma.user.findFirst({ where: { email: email.toLowerCase() }, include: { role: true } });

        if (!user) {
            await logAuthEvent(req, {
                email: email.toLowerCase(),
                eventType: 'password_reset_request',
                outcome: 'failure',
                reason: 'user_not_found',
            });
            res.status(200).json({ message: 'If that email exists, a reset code has been generated.' });
            return;
        }

        await prisma.passwordResetToken.updateMany({
            where: { user_id: user.id, used: false },
            data: { used: true },
        });

        // 6 bytes → 12 uppercase hex chars (281 trillion combinations vs the old 4-byte / 4.3B)
        const token = crypto.randomBytes(6).toString('hex').toUpperCase();
        const expires_at = new Date(Date.now() + 30 * 60 * 1000);

        await prisma.passwordResetToken.create({
            data: { user_id: user.id, token, expires_at },
        });

        await logAuthEvent(req, {
            userId: user.id,
            email: user.email,
            organizationId: user.organization_id,
            eventType: 'password_reset_request',
            outcome: 'success',
        });

        const resetUrl = `${env.frontendUrl}/reset-password?code=${token}`;
        try {
            await sendPasswordResetEmail({
                to: user.email,
                firstName: user.first_name,
                resetCode: token,
                resetUrl,
            });
        } catch (emailErr) {
            // Log but do not surface — avoids leaking user existence and keeps the
            // response consistent whether or not the email provider succeeds.
            console.error('Failed to send password reset email:', emailErr);
        }

        res.status(200).json({ message: 'If that email exists, a reset code has been sent.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const parseResult = passwordResetConfirmSchema.safeParse(req.body);
        if (!parseResult.success) {
            res.status(400).json({
                message: 'Validation failed',
                errors: formatZodIssues(parseResult.error),
            });
            return;
        }

        const { token: code, password: newPassword } = parseResult.data;

        const resetToken = await prisma.passwordResetToken.findUnique({
            where: { token: code.toUpperCase() },
            include: { user: true },
        });

        if (!resetToken || resetToken.used || resetToken.expires_at < new Date()) {
            await logAuthEvent(req, {
                userId: resetToken?.user_id,
                email: resetToken?.user?.email,
                organizationId: resetToken?.user?.organization_id,
                eventType: 'password_reset_completion',
                outcome: 'failure',
                reason: resetToken?.used ? 'used_reset_code' : 'invalid_or_expired',
            });
            res.status(400).json({ message: 'Invalid or expired reset code' });
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(newPassword, salt);

        await prisma.user.update({
            where: { id: resetToken.user_id },
            data: { password_hash },
        });

        await prisma.passwordResetToken.update({
            where: { id: resetToken.id },
            data: { used: true },
        });

        await logAuthEvent(req, {
            userId: resetToken.user_id,
            email: resetToken.user.email,
            organizationId: resetToken.user.organization_id,
            eventType: 'password_reset_completion',
            outcome: 'success',
        });

        res.status(200).json({ message: 'Password has been reset successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const refreshAccessToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
        if (typeof refreshToken !== 'string' || !refreshToken) {
            res.status(400).json({ message: 'Refresh token is required' });
            return;
        }

        const decoded = jwt.verify(refreshToken, env.jwtSecret) as { userId: string; type?: string };
        if (decoded.type !== 'refresh') {
            res.status(401).json({ message: 'Invalid token type' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            include: { role: true },
        });

        if (!user || !user.is_active) {
            res.status(401).json({ message: 'User not found or inactive' });
            return;
        }

        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

        res.cookie('access_token', accessToken, accessTokenCookieOptions);
        res.cookie('refresh_token', newRefreshToken, refreshTokenCookieOptions);

        // Refresh token is in the httpOnly cookie only — not returned in body.
        res.status(200).json({ token: accessToken });
    } catch {
        res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
};
