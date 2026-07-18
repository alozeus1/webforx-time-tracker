import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.GOOGLE_CLIENT_ID = 'google-client-id';

import authRoutes from '../src/routes/authRoutes';

const verifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
    OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken })),
}));

jest.mock('otplib', () => ({
    generateSecret: jest.fn(() => 'TESTTOTPSECRET'),
    verifySync: jest.fn(() => ({ valid: true })),
    generateURI: jest.fn(() => 'otpauth://totp/test'),
}));

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        user: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
        },
        mfaChallenge: {
            create: jest.fn(),
            findFirst: jest.fn(),
            updateMany: jest.fn(),
        },
        authEvent: {
            create: jest.fn(),
        },
    },
}));

import prisma from '../src/config/db';

const JWT_SECRET = 'test-jwt-secret';

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

const user = {
    id: 'user-1',
    email: 'alice@test.com',
    organization_id: 'org-1',
    first_name: 'Alice',
    last_name: 'Smith',
    is_active: true,
    mfa_secret: 'TESTTOTPSECRET',
    role: { name: 'Employee' },
};

describe('Google SSO MFA enforcement', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GOOGLE_CLIENT_ID = 'google-client-id';
        verifyIdToken.mockResolvedValue({
            getPayload: () => ({ email: 'alice@test.com', given_name: 'Alice', family_name: 'Smith' }),
        });
        (prisma.authEvent.create as jest.Mock).mockResolvedValue({});
        (prisma.mfaChallenge.create as jest.Mock).mockResolvedValue({ id: 'challenge-1' });
        (prisma.mfaChallenge.findFirst as jest.Mock).mockResolvedValue({ id: 'challenge-1' });
        (prisma.mfaChallenge.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    });

    it('issues a full SSO session when MFA is disabled', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue({ ...user, mfa_enabled: false });

        const res = await request(app)
            .post('/api/v1/auth/google')
            .send({ credential: 'google-id-token' });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(res.body.mfa_required).toBeUndefined();
        expect(prisma.mfaChallenge.create).not.toHaveBeenCalled();
    });

    it('returns only an MFA challenge when Google SSO user has MFA enabled', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue({ ...user, mfa_enabled: true });

        const res = await request(app)
            .post('/api/v1/auth/google')
            .send({ credential: 'google-id-token' });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ mfa_required: true });
        expect(res.body.token).toBeUndefined();
        expect(prisma.mfaChallenge.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ user_id: 'user-1', purpose: 'login_mfa' }),
        }));
    });

    it('consumes a valid MFA challenge before issuing a full session', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...user, mfa_enabled: true });
        const challenge = jwt.sign(
            { userId: 'user-1', type: 'mfa_challenge', purpose: 'login_mfa', challengeId: 'challenge-1' },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '5m' },
        );

        const res = await request(app)
            .post('/api/v1/auth/mfa/validate')
            .send({ mfa_challenge_token: challenge, totp_code: '123456' });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(prisma.mfaChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 'challenge-1', used_at: null }),
            data: { used_at: expect.any(Date) },
        }));
    });

    it('rejects reused or missing MFA challenges', async () => {
        (prisma.mfaChallenge.findFirst as jest.Mock).mockResolvedValue(null);
        const challenge = jwt.sign(
            { userId: 'user-1', type: 'mfa_challenge', purpose: 'login_mfa', challengeId: 'challenge-1' },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '5m' },
        );

        const res = await request(app)
            .post('/api/v1/auth/mfa/validate')
            .send({ mfa_challenge_token: challenge, totp_code: '123456' });

        expect(res.status).toBe(401);
        expect(res.body.message).toMatch(/invalid or expired/i);
        expect(prisma.mfaChallenge.updateMany).not.toHaveBeenCalled();
    });
});
