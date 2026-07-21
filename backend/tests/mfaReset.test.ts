import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import userRoutes from '../src/routes/userRoutes';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        user: {
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        mfaChallenge: {
            deleteMany: jest.fn(),
        },
        auditLog: {
            create: jest.fn(),
        },
    },
}));

jest.mock('../src/services/emailService', () => ({
    __esModule: true,
    sendMfaResetNotificationEmail: jest.fn(),
}));

import prisma from '../src/config/db';
import { sendMfaResetNotificationEmail } from '../src/services/emailService';
const mockSendMfaResetEmail = sendMfaResetNotificationEmail as jest.Mock;

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
const makeToken = (userId: string, role: string, organizationId = 'org-1') =>
    jwt.sign({ userId, email: `${userId}@test.com`, role, organization_id: organizationId }, JWT_SECRET);

const adminToken = makeToken('user-admin-1', 'Admin');
const managerToken = makeToken('user-mgr-1', 'Manager');
const employeeToken = makeToken('user-emp-1', 'Employee');

const app = express();
app.use(express.json());
app.use('/api/v1/users', userRoutes);

const mfaEnabledUser = {
    id: 'user-target-1',
    email: 'target@test.com',
    first_name: 'Target',
    last_name: 'User',
    organization_id: 'org-1',
    mfa_enabled: true,
    mfa_secret: 'encrypted-secret',
};

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.mfaChallenge.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    mockSendMfaResetEmail.mockResolvedValue(undefined);
});

describe('POST /api/v1/users/:id/mfa/reset', () => {
    it('Admin can reset MFA for a user in their org', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(mfaEnabledUser);
        (prisma.user.update as jest.Mock).mockResolvedValue({ ...mfaEnabledUser, mfa_enabled: false, mfa_secret: null });

        const res = await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.mfa_enabled).toBe(false);
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: 'user-target-1' },
            data: { mfa_enabled: false, mfa_secret: null },
        });
        expect(prisma.mfaChallenge.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'user-target-1' } });
    });

    it('Manager can reset MFA for any user in their org (org-wide, not team-scoped)', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(mfaEnabledUser);
        (prisma.user.update as jest.Mock).mockResolvedValue({ ...mfaEnabledUser, mfa_enabled: false, mfa_secret: null });

        const res = await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
    });

    it('returns 403 for Employee role', async () => {
        const res = await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
        expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('returns 404 when the target user is in a different organization', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
        expect(prisma.user.findFirst).toHaveBeenCalledWith({
            where: { id: 'user-target-1', organization_id: 'org-1' },
        });
    });

    it('is idempotent when MFA is already disabled', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue({ ...mfaEnabledUser, mfa_enabled: false, mfa_secret: null });

        const res = await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.mfa_enabled).toBe(false);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('still returns 200 when the notification email fails to send', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(mfaEnabledUser);
        (prisma.user.update as jest.Mock).mockResolvedValue({ ...mfaEnabledUser, mfa_enabled: false, mfa_secret: null });
        mockSendMfaResetEmail.mockRejectedValue(new Error('Resend down'));

        const res = await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
    });

    it('writes an audit log entry for the reset', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(mfaEnabledUser);
        (prisma.user.update as jest.Mock).mockResolvedValue({ ...mfaEnabledUser, mfa_enabled: false, mfa_secret: null });

        await request(app)
            .post('/api/v1/users/user-target-1/mfa/reset')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(prisma.auditLog.create).toHaveBeenCalledWith({
            data: {
                user_id: 'user-admin-1',
                organization_id: 'org-1',
                action: 'user_mfa_reset',
                resource: 'user',
                metadata: {
                    target_user_id: 'user-target-1',
                    target_email: 'target@test.com',
                },
            },
        });
    });
});
