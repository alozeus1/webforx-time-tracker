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

import prisma from '../src/config/db';

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
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

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

    it('POST /api/v1/auth/login should log successful sign-ins', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({
            id: 'user-1',
            email: 'alice@test.com',
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
