import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import prisma from '../config/db';

const JWT_ALGORITHM = 'HS256' as const;

export type SessionUser = {
    id: string;
    email: string;
    organization_id: string;
    role: { name: string };
};

export type AccessTokenPayload = {
    userId: string;
    email: string;
    role: string;
    organization_id: string;
    type: 'access';
};

export type RefreshTokenPayload = {
    userId: string;
    type: 'refresh';
};

export type MfaChallengePayload = {
    userId: string;
    type: 'mfa_challenge';
    purpose: 'login_mfa';
    challengeId: string;
};

const sign = (payload: object, options: SignOptions) =>
    jwt.sign(payload, env.jwtSecret, { ...options, algorithm: JWT_ALGORITHM });

export const generateSessionTokens = (user: SessionUser) => {
    const accessPayload: AccessTokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role.name,
        organization_id: user.organization_id,
        type: 'access',
    };

    const accessToken = sign(accessPayload, { expiresIn: '15m' });
    const refreshToken = sign({ userId: user.id, type: 'refresh' } satisfies RefreshTokenPayload, { expiresIn: '7d' });

    return { accessToken, refreshToken };
};

export const issueMfaChallengeToken = async (userId: string) => {
    const challenge = await prisma.mfaChallenge.create({
        data: {
            user_id: userId,
            purpose: 'login_mfa',
            expires_at: new Date(Date.now() + 5 * 60 * 1000),
        },
        select: { id: true },
    });

    return sign(
        {
            userId,
            type: 'mfa_challenge',
            purpose: 'login_mfa',
            challengeId: challenge.id,
        } satisfies MfaChallengePayload,
        { expiresIn: '5m' },
    );
};

export const verifyToken = <T extends JwtPayload>(token: string): T =>
    jwt.verify(token, env.jwtSecret, { algorithms: [JWT_ALGORITHM] }) as T;
