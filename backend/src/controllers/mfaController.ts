import { Response } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
// otplib v13: the top-level functional API ships pre-wired with the noble
// crypto + scure base32 plugins. The bare TOTP class does NOT (constructing
// it without plugins throws CryptoPluginMissingError on first use — this is
// what broke "Enable MFA" in production with a 500).
const { generateSecret, verifySync, generateURI } = require('otplib') as {
    generateSecret: (bytes?: number) => string;
    verifySync: (opts: { token: string; secret: string }) => { valid: boolean };
    generateURI: (opts: { issuer: string; label: string; secret: string }) => string;
};
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { generateSessionTokens, verifyToken } from '../services/tokenService';
import { decryptSecret, encryptSecret } from '../utils/crypto';
import { sendMfaResetNotificationEmail } from '../services/emailService';

const APP_NAME = 'Web Forx Time Tracker';

/**
 * POST /auth/mfa/setup
 * Generates a new TOTP secret, stores it temporarily (not enabled yet),
 * and returns a QR code data URL + the raw secret for manual entry.
 */
export const setupMfa = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) { res.status(404).json({ message: 'User not found' }); return; }

        if (user.mfa_enabled) {
            res.status(400).json({ message: 'MFA is already enabled. Disable it first to set up a new device.' });
            return;
        }

        const secret = generateSecret(20);

        // Store pending secret (enabled only after /mfa/verify)
        await prisma.user.update({
            where: { id: userId },
            data: { mfa_secret: encryptSecret(secret) },
        });

        const otpAuthUrl = generateURI({ issuer: APP_NAME, label: user.email, secret });
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

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.mfa_secret) {
            res.status(400).json({ message: 'No pending MFA setup. Call /auth/mfa/setup first.' });
            return;
        }

        const isValid = verifySync({ token: totp_code.replace(/\s/g, ''), secret: decryptSecret(user.mfa_secret) }).valid;
        if (!isValid) {
            res.status(400).json({ message: 'Invalid code. Try again.' });
            return;
        }

        await prisma.user.update({
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

        const user = await prisma.user.findUnique({ where: { id: userId } });
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

        const totpOk = verifySync({ token: totp_code.replace(/\s/g, ''), secret: decryptSecret(user.mfa_secret) }).valid;
        if (!totpOk) {
            res.status(400).json({ message: 'Invalid authenticator code.' });
            return;
        }

        await prisma.user.update({
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

        let decoded: { userId: string; type: string; purpose?: string; challengeId?: string };
        try {
            decoded = verifyToken<typeof decoded>(mfa_challenge_token);
        } catch {
            res.status(401).json({ message: 'MFA challenge token is invalid or expired. Please log in again.' });
            return;
        }

        if (decoded.type !== 'mfa_challenge' || decoded.purpose !== 'login_mfa' || !decoded.challengeId) {
            res.status(401).json({ message: 'Invalid token type.' });
            return;
        }

        const challenge = await prisma.mfaChallenge.findFirst({
            where: {
                id: decoded.challengeId,
                user_id: decoded.userId,
                purpose: 'login_mfa',
                used_at: null,
                expires_at: { gt: new Date() },
            },
            select: { id: true },
        });

        if (!challenge) {
            res.status(401).json({ message: 'MFA challenge token is invalid or expired. Please log in again.' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            include: { role: true },
        });

        if (!user || !user.is_active || !user.mfa_enabled || !user.mfa_secret) {
            res.status(401).json({ message: 'User not found or MFA not configured.' });
            return;
        }

        const totpOk = verifySync({ token: totp_code.replace(/\s/g, ''), secret: decryptSecret(user.mfa_secret) }).valid;
        if (!totpOk) {
            res.status(401).json({ message: 'Invalid authenticator code.' });
            return;
        }

        const consumed = await prisma.mfaChallenge.updateMany({
            where: {
                id: challenge.id,
                user_id: decoded.userId,
                purpose: 'login_mfa',
                used_at: null,
                expires_at: { gt: new Date() },
            },
            data: { used_at: new Date() },
        });
        if (consumed.count !== 1) {
            res.status(401).json({ message: 'MFA challenge token is invalid or expired. Please log in again.' });
            return;
        }

        const { accessToken, refreshToken } = generateSessionTokens(user);

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

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { mfa_enabled: true },
        });

        res.status(200).json({ mfa_enabled: user?.mfa_enabled ?? false });
    } catch (error) {
        console.error('MFA status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * POST /users/:id/mfa/reset
 * Admin/Manager-initiated MFA reset. Bypasses the TOTP requirement in
 * disableMfa() above — that's the point: this exists for the case where
 * the user has lost the device that would produce a valid code.
 * Ends in the same state as self-service disable; the user re-enrolls
 * via /auth/mfa/setup + /auth/mfa/verify whenever they're ready.
 */
export const resetUserMfa = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const targetIdParam = req.params.id;
        const targetId = Array.isArray(targetIdParam) ? targetIdParam[0] : targetIdParam;
        const user = await prisma.user.findFirst({
            where: { id: targetId, organization_id: req.user!.organization_id },
        });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (!user.mfa_enabled) {
            res.status(200).json({ message: 'MFA was already disabled for this user.', mfa_enabled: false });
            return;
        }

        await prisma.user.update({
            where: { id: targetId },
            data: { mfa_enabled: false, mfa_secret: null },
        });

        await prisma.mfaChallenge.deleteMany({ where: { user_id: targetId } });

        try {
            await prisma.auditLog.create({
                data: {
                    user_id: req.user!.userId,
                    organization_id: req.user!.organization_id,
                    action: 'user_mfa_reset',
                    resource: 'user',
                    metadata: {
                        target_user_id: user.id,
                        target_email: user.email,
                    },
                },
            });
        } catch (error) {
            console.error('Failed to write MFA reset audit log:', error);
        }

        sendMfaResetNotificationEmail({
            to: user.email,
            firstName: user.first_name,
        }).catch((err) => console.error('Failed to send MFA reset notification email:', err));

        res.status(200).json({
            message: 'MFA has been reset. The user can set up a new device from their account settings.',
            mfa_enabled: false,
        });
    } catch (error) {
        console.error('MFA reset error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
