import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import authRoutes from '../src/routes/authRoutes';

jest.mock('bcryptjs', () => {
    const mocked = {
        compare: jest.fn(),
        genSalt: jest.fn(),
        hash: jest.fn(),
    };

    return {
        __esModule: true,
        default: mocked,
        ...mocked,
    };
});

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        user: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        passwordResetToken: {
            findUnique: jest.fn(),
            updateMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        authEvent: {
            create: jest.fn(),
        },
    },
}));

// Mock email service using jest.fn() directly inside the factory (avoids hoisting TDZ issue)
jest.mock('../src/services/emailService', () => ({
    __esModule: true,
    sendPasswordResetEmail: jest.fn(),
}));

import prisma from '../src/config/db';
import { sendPasswordResetEmail } from '../src/services/emailService';
const mockSendPasswordResetEmail = sendPasswordResetEmail as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

describe('Auth Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (prisma.authEvent.create as jest.Mock).mockResolvedValue({});
    });

    it('POST /api/v1/auth/login should fail without credentials and log the issue', async () => {
        const res = await request(app).post('/api/v1/auth/login').send({});

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Email and password are required');
        expect(prisma.authEvent.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                event_type: 'login_attempt',
                outcome: 'failure',
                reason: 'missing_credentials',
            }),
        }));
    });

    it('POST /api/v1/auth/login should fail with invalid credentials and log the reason', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

        const res = await request(app).post('/api/v1/auth/login').send({
            email: 'invalid@example.com',
            password: 'wrongpassword',
        });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Invalid credentials');
        expect(prisma.authEvent.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                email: 'invalid@example.com',
                event_type: 'login_attempt',
                outcome: 'failure',
                reason: 'user_not_found',
            }),
        }));
    });

    // ------------------------------------------------------------------
    // POST /api/v1/auth/forgot-password — email send fix regression tests
    // ------------------------------------------------------------------

    describe('POST /api/v1/auth/forgot-password', () => {
        const VALID_USER = {
            id: 'user-1',
            email: 'alice@test.com',
            first_name: 'Alice',
            last_name: 'Smith',
            is_active: true,
            role: { name: 'Employee' },
        };

        beforeEach(() => {
            mockSendPasswordResetEmail.mockReset();
        });

        it('returns 200 and sends email when user exists', async () => {
            // Controller uses findFirst (not findUnique) for forgot-password lookup
            (prisma.user.findFirst as jest.Mock).mockResolvedValue(VALID_USER);
            (prisma.passwordResetToken.updateMany as jest.Mock).mockResolvedValue({});
            (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
            mockSendPasswordResetEmail.mockResolvedValue({ id: 'email-123' });

            const res = await request(app)
                .post('/api/v1/auth/forgot-password')
                .send({ email: 'alice@test.com' });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('If that email exists, a reset code has been sent.');
            // Email must have been called (awaited — not fire-and-forget)
            expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(1);
            expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'alice@test.com',
                    firstName: 'Alice',
                })
            );
        });

        it('returns 200 even when user does not exist (prevents user enumeration)', async () => {
            (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

            const res = await request(app)
                .post('/api/v1/auth/forgot-password')
                .send({ email: 'nobody@test.com' });

            expect(res.status).toBe(200);
            // Different message for non-existent user (both are intentionally vague)
            expect(res.body.message).toBe('If that email exists, a reset code has been generated.');
            // Email must NOT be called when user doesn't exist
            expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
        });

        it('returns 200 and does NOT leak a 500 when email provider throws (swallowed in try/catch)', async () => {
            (prisma.user.findFirst as jest.Mock).mockResolvedValue(VALID_USER);
            (prisma.passwordResetToken.updateMany as jest.Mock).mockResolvedValue({});
            (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});
            // Simulate Resend API failure
            mockSendPasswordResetEmail.mockRejectedValue(new Error('Resend API timeout'));

            const res = await request(app)
                .post('/api/v1/auth/forgot-password')
                .send({ email: 'alice@test.com' });

            // Controller swallows the error — user still gets 200, not a 500
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('If that email exists, a reset code has been sent.');
        });

        it('email send is AWAITED — resolves before HTTP response is returned', async () => {
            (prisma.user.findFirst as jest.Mock).mockResolvedValue(VALID_USER);
            (prisma.passwordResetToken.updateMany as jest.Mock).mockResolvedValue({});
            (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});

            let emailResolvedAt = 0;
            let responseReceivedAt = 0;

            mockSendPasswordResetEmail.mockImplementation(() =>
                new Promise((resolve) =>
                    setTimeout(() => {
                        emailResolvedAt = Date.now();
                        resolve({ id: 'email-123' });
                    }, 50)
                )
            );

            const res = await request(app)
                .post('/api/v1/auth/forgot-password')
                .send({ email: 'alice@test.com' });

            responseReceivedAt = Date.now();

            expect(res.status).toBe(200);
            // If await is correct, email resolves BEFORE the HTTP response arrives
            expect(emailResolvedAt).toBeGreaterThan(0);
            expect(responseReceivedAt).toBeGreaterThanOrEqual(emailResolvedAt);
        });

        it('returns 400 when email field is missing', async () => {
            const res = await request(app)
                .post('/api/v1/auth/forgot-password')
                .send({});

            expect(res.status).toBe(400);
            expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
        });
    });

    // ------------------------------------------------------------------

    it('POST /api/v1/auth/login should log successful sign-ins', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue({
            id: 'user-1',
            email: 'alice@test.com',
            organization_id: 'org-1',
            first_name: 'Alice',
            last_name: 'Smith',
            password_hash: 'hashed-password',
            is_active: true,
            role: { name: 'Employee' },
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        const res = await request(app).post('/api/v1/auth/login').send({
            email: 'alice@test.com',
            password: 'correct-horse-battery-staple',
        });

        expect(res.status).toBe(200);
        expect(res.body.user.email).toBe('alice@test.com');
        expect(res.body.user.organization_id).toBe('org-1');
        expect(prisma.authEvent.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                user_id: 'user-1',
                email: 'alice@test.com',
                event_type: 'login_attempt',
                outcome: 'success',
            }),
        }));
    });
});
