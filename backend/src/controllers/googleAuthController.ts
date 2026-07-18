import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../config/db';
import { env } from '../config/env';
import { logAuthEvent } from '../services/authEventService';
import { issueMfaChallengeToken, generateSessionTokens } from '../services/tokenService';

/**
 * POST /auth/google
 * Body: { credential: string }  — Google One-Tap / Sign-In button ID token
 *
 * Verifies the Google ID token, looks up the user by email, and issues a
 * session token. Does NOT auto-create accounts; the user must already exist
 * in the organisation (invite-first model).
 */
export const googleSignIn = async (req: Request, res: Response): Promise<void> => {
    const { credential } = req.body as { credential?: string };

    if (!credential) {
        res.status(400).json({ message: 'Google credential token is required' });
        return;
    }

    if (!env.googleClientId) {
        res.status(503).json({ message: 'Google SSO is not configured on this server' });
        return;
    }

    let email: string;
    let googleName: { given: string; family: string };

    try {
        const client = new OAuth2Client(env.googleClientId);
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: env.googleClientId,
        });
        const payload = ticket.getPayload();
        if (!payload?.email) throw new Error('No email in Google token payload');
        email = payload.email.toLowerCase();
        googleName = {
            given: payload.given_name || '',
            family: payload.family_name || '',
        };
    } catch (err) {
        console.error('Google ID token verification failed:', err);
        await logAuthEvent(req, {
            email: null,
            eventType: 'login_attempt',
            outcome: 'failure',
            reason: 'invalid_google_token',
            metadata: { provider: 'google' },
        });
        res.status(401).json({ message: 'Invalid or expired Google credential' });
        return;
    }

    const user = await prisma.user.findFirst({
        where: { email, is_active: true },
        include: { role: true },
    });

    if (!user) {
        await logAuthEvent(req, {
            email,
            eventType: 'login_attempt',
            outcome: 'failure',
            reason: 'user_not_found',
            metadata: { provider: 'google' },
        });
        res.status(403).json({
            message: `No active account found for ${email}. Ask your administrator to invite you first.`,
        });
        return;
    }

    await logAuthEvent(req, {
        email: user.email,
        userId: user.id,
        organizationId: user.organization_id,
        eventType: user.mfa_enabled ? 'login_attempt' : 'login_success',
        outcome: 'success',
        metadata: { provider: 'google', name: `${googleName.given} ${googleName.family}`.trim() },
    });

    if (user.mfa_enabled) {
        res.status(200).json({ mfa_required: true, mfa_challenge_token: await issueMfaChallengeToken(user.id) });
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
};
