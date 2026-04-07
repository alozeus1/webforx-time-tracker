import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { env } from '../config/env';
import { logAuthEvent } from '../services/authEventService';
import { sendPasswordResetEmail } from '../services/emailService';

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const password = typeof req.body?.password === 'string' ? req.body.password : '';

        if (!email || !password) {
            await logAuthEvent(req, {
                email: email || null,
                eventType: 'login_attempt',
                outcome: 'failure',
                reason: 'missing_credentials',
                metadata: {
                    missing: [
                        !email ? 'email' : null,
                        !password ? 'password' : null,
                    ].filter(Boolean),
                },
            });
            res.status(400).json({ message: 'Email and password are required' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { email },
            include: { role: true }
        });

        if (!user) {
            await logAuthEvent(req, {
                email,
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
            eventType: 'login_attempt',
            outcome: 'success',
            metadata: {
                role: user.role.name,
            },
        });

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role.name },
            env.jwtSecret,
            { expiresIn: '1h' }
        );

        const refreshToken = jwt.sign(
            { userId: user.id, type: 'refresh' },
            env.jwtSecret,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            token,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                role: user.role.name
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({ message: 'Logged out successfully' });
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

        if (!email) {
            await logAuthEvent(req, {
                eventType: 'password_reset_request',
                outcome: 'failure',
                reason: 'missing_email',
            });
            res.status(400).json({ message: 'Email is required' });
            return;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        // Always return success to prevent email enumeration
        if (!user) {
            await logAuthEvent(req, {
                email,
                eventType: 'password_reset_request',
                outcome: 'failure',
                reason: 'user_not_found',
            });
            res.status(200).json({ message: 'If that email exists, a reset code has been generated.' });
            return;
        }

        // Invalidate any existing tokens for this user
        await prisma.passwordResetToken.updateMany({
            where: { user_id: user.id, used: false },
            data: { used: true },
        });

        const token = crypto.randomBytes(4).toString('hex').toUpperCase();
        const expires_at = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        await prisma.passwordResetToken.create({
            data: { user_id: user.id, token, expires_at },
        });

        await logAuthEvent(req, {
            userId: user.id,
            email: user.email,
            eventType: 'password_reset_request',
            outcome: 'success',
        });

        // Send password reset email (fire-and-forget — response already committed to anti-enum message)
        const resetUrl = `${env.frontendUrl}/reset-password?code=${token}`;
        sendPasswordResetEmail({
            to: user.email,
            firstName: user.first_name,
            resetCode: token,
            resetUrl,
        }).catch((err) => console.error('Failed to send password reset email:', err));

        res.status(200).json({
            message: 'If that email exists, a reset code has been sent.',
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
        const newPassword = typeof req.body?.password === 'string' ? req.body.password : '';

        if (!code || !newPassword) {
            await logAuthEvent(req, {
                eventType: 'password_reset_completion',
                outcome: 'failure',
                reason: 'missing_reset_details',
                metadata: {
                    has_code: Boolean(code),
                    has_password: Boolean(newPassword),
                },
            });
            res.status(400).json({ message: 'Reset code and new password are required' });
            return;
        }

        if (newPassword.length < 6) {
            await logAuthEvent(req, {
                eventType: 'password_reset_completion',
                outcome: 'failure',
                reason: 'password_too_short',
                metadata: {
                    code_length: code.length,
                },
            });
            res.status(400).json({ message: 'Password must be at least 6 characters' });
            return;
        }

        const resetToken = await prisma.passwordResetToken.findUnique({
            where: { token: code },
            include: { user: true },
        });

        if (!resetToken) {
            await logAuthEvent(req, {
                eventType: 'password_reset_completion',
                outcome: 'failure',
                reason: 'invalid_reset_code',
                metadata: {
                    code_length: code.length,
                },
            });
            res.status(400).json({ message: 'Invalid or expired reset code' });
            return;
        }

        if (resetToken.used) {
            await logAuthEvent(req, {
                userId: resetToken.user_id,
                email: resetToken.user.email,
                eventType: 'password_reset_completion',
                outcome: 'failure',
                reason: 'used_reset_code',
            });
            res.status(400).json({ message: 'Invalid or expired reset code' });
            return;
        }

        if (resetToken.expires_at < new Date()) {
            await logAuthEvent(req, {
                userId: resetToken.user_id,
                email: resetToken.user.email,
                eventType: 'password_reset_completion',
                outcome: 'failure',
                reason: 'expired_reset_code',
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
        const { refreshToken } = req.body ?? {};
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

        const newAccessToken = jwt.sign(
            { userId: user.id, email: user.email, role: user.role.name },
            env.jwtSecret,
            { expiresIn: '1h' }
        );

        const newRefreshToken = jwt.sign(
            { userId: user.id, type: 'refresh' },
            env.jwtSecret,
            { expiresIn: '7d' }
        );

        res.status(200).json({ token: newAccessToken, refreshToken: newRefreshToken });
    } catch {
        res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
};
