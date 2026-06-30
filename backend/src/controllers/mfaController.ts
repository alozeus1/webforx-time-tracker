import { Response } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TOTP } = require('otplib') as { TOTP: new () => { generate(s: string): string; verify(o: { token: string; secret: string }): boolean; generateSecret(l?: number): string; keyuri(u: string, s: string, secret: string): string } };
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { env } from '../config/env';
import { AuthRequest } from '../types/auth';

const totp = new TOTP();
const APP_NAME = 'Web Forx Time Tracker';

// Helper — Prisma user cast for new MFA fields (until prisma generate runs on deploy)
type UserWithMfa = { mfa_enabled: boolean; mfa_secret: string | null };

/**
 * POST /auth/mfa/setup
 * Generates a new TOTP secret, stores it temporarily (not enabled yet),
 * and returns a QR code data URL + the raw secret for manual entry.
 */
export const setupMfa = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

        const user = await (prisma.user as any).findUnique({ where: { id: userId } }) as UserWithMfa & { email: string } | null;
        if (!user) { res.status(404).json({ message: 'User not found' }); return; }

        if (user.mfa_enabled) {
            res.status(400).json({ message: 'MFA is already enabled. Disable it first to set up a new device.' });
            return;
        }

        const secret = totp.generateSecret(20);

        // Store pending secret (enabled only after /mfa/verify)
        await (prisma.user as any).update({
            where: { id: userId },
            data: { mfa_secret: secret },
        });

        const otpAuthUrl = totp.keyuri(user.email, APP_NAME, secret);
        const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

        res.status(200).json({
            secret,
            qr_code: qrCodeDataUrl,
            message: 'Scan the QR code with your authenticator app, then call /auth/mfa/verify to enable.',
        });
    } catch (error) {
        console.error('MFA setup error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * POST /auth/mfa/verify
 * Body: { totp_code }
 * Verifies the TOTP code against the pending secret and enables MFA.
 */
export const verifyMfa = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

        const { totp_code } = req.body as { totp_code?: string };
        if (!totp_code || typeof totp_code !== 'string') {
            res.status(400).json({ message: 'totp_code is required' });
            return;
        }

        const user = await (prisma.user as any).findUnique({ where: { id: userId } }) as UserWithMfa | null;
        if (!user || !user.mfa_secret) {
            res.status(400).json({ message: 'No pending MFA setup. Call /auth/mfa/setup first.' });
            return;
        }

        const isValid = totp.verify({ token: totp_code.replace(/\s/g, ''), secret: user.mfa_secret });
        if (!isValid) {
            res.status(400).json({ message: 'Invalid code. Try again.' });
            return;
        }

        await (prisma.user as any).update({
            where: { id: userId },
            data: { mfa_enabled: true },
        });

        res.status(200).json({ message: 'MFA enabled successfully.' });
    } catch (error) {
        console.error('MFA verify error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * POST /auth/mfa/disable
 * Body: { password, totp_code }
 * Requires current password + valid TOTP to disable.
 */
export const disableMfa = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

        const { password, totp_code } = req.body as { password?: string; totp_code?: string };
        if (!password || !totp_code) {
            res.status(400).json({ message: 'password and totp_code are required' });
            return;
        }

        const user = await (prisma.user as any).findUnique({ where: { id: userId } }) as (UserWithMfa & { password_hash: string }) | null;
        if (!user) { res.status(404).json({ message: 'User not found' }); return; }

        if (!user.mfa_enabled || !user.mfa_secret) {
            res.status(400).json({ message: 'MFA is not enabled.' });
            return;
        }

        const passwordOk = await bcrypt.compare(password, user.password_hash);
        if (!passwordOk) {
            res.status(401).json({ message: 'Incorrect password.' });
            return;
        }

        const totpOk = totp.verify({ token: totp_code.replace(/\s/g, ''), secret: user.mfa_secret });
        if (!totpOk) {
            res.status(400).json({ message: 'Invalid authenticator code.' });
            return;
        }

        await (prisma.user as any).update({
            where: { id: userId },
            data: { mfa_enabled: false, mfa_secret: null },
        });

        res.status(200).json({ message: 'MFA disabled successfully.' });
    } catch (error) {
        console.error('MFA disable error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * POST /auth/mfa/validate
 * Body: { mfa_challenge_token, totp_code }
 * Second step of login — validates TOTP, returns full JWT session.
 */
export const validateMfaLogin = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { mfa_challenge_token, totp_code } = req.body as {
            mfa_challenge_token?: string;
            totp_code?: string;
        };

        if (!mfa_challenge_token || !totp_code) {
            res.status(400).json({ message: 'mfa_challenge_token and totp_code are required' });
            return;
        }

        let decoded: { userId: string; type: string };
        try {
            decoded = jwt.verify(mfa_challenge_token, env.jwtSecret) as typeof decoded;
        } catch {
            res.status(401).json({ message: 'MFA challenge token is invalid or expired. Please log in again.' });
            return;
        }

        if (decoded.type !== 'mfa_challenge') {
            res.status(401).json({ message: 'Invalid token type.' });
            return;
        }

        const user = await (prisma.user as any).findUnique({
            where: { id: decoded.userId },
            include: { role: true },
        }) as (UserWithMfa & { id: string; email: string; first_name: string; last_name: string; organization_id: string; is_active: boolean; role: { name: string } }) | null;

        if (!user || !user.is_active || !user.mfa_enabled || !user.mfa_secret) {
            res.status(401).json({ message: 'User not found or MFA not configured.' });
            return;
        }

        const totpOk = totp.verify({ token: totp_code.replace(/\s/g, ''), secret: user.mfa_secret });
        if (!totpOk) {
            res.status(401).json({ message: 'Invalid authenticator code.' });
            return;
        }

        // Issue full session tokens
        const payload = {
            userId: user.id,
            email: user.email,
            role: user.role.name,
            organization_id: user.organization_id,
        };
        const accessToken = jwt.sign(payload, env.jwtSecret, { expiresIn: '15m' });
        const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, env.jwtSecret, { expiresIn: '7d' });

        const { accessTokenCookieOptions, refreshTokenCookieOptions } = await import('../config/cookies');
        res.cookie('access_token', accessToken, accessTokenCookieOptions);
        res.cookie('refresh_token', refreshToken, refreshTokenCookieOptions);

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
        console.error('MFA validate error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * GET /auth/mfa/status
 * Returns whether MFA is enabled for the current user.
 */
export const getMfaStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

        const user = await (prisma.user as any).findUnique({
            where: { id: userId },
            select: { mfa_enabled: true },
        }) as { mfa_enabled: boolean } | null;

        res.status(200).json({ mfa_enabled: user?.mfa_enabled ?? false });
    } catch (error) {
        console.error('MFA status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
