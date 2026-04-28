import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import adminRoutes from '../src/routes/adminRoutes';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        auditLog: {
            findMany: jest.fn(),
            create: jest.fn(),
        },
        authEvent: {
            findMany: jest.fn(),
        },
        notification: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        timerPolicyConfig: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
    },
}));

import prisma from '../src/config/db';

const JWT_SECRET = 'test-jwt-secret';
const makeToken = (userId: string, role: string) =>
    jwt.sign({ userId, email: `${userId}@test.com`, role }, JWT_SECRET);

const adminToken = makeToken('user-admin-1', 'Admin');
const managerToken = makeToken('user-mgr-1', 'Manager');

const app = express();
app.use(express.json());
app.use('/api/v1/admin', adminRoutes);

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.authEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.notification.update as jest.Mock).mockResolvedValue({});
    (prisma.timerPolicyConfig.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.timerPolicyConfig.create as jest.Mock).mockResolvedValue({ id: 'policy-1' });
    (prisma.timerPolicyConfig.update as jest.Mock).mockResolvedValue({ id: 'policy-1' });
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
});

describe('PUT /api/v1/admin/timer-policy', () => {
    it('allows admins to update safe timer policy values', async () => {
        const res = await request(app)
            .put('/api/v1/admin/timer-policy')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                heartbeatIntervalSeconds: 180,
                missedHeartbeatWarningThreshold: 3,
                missedHeartbeatPauseThreshold: 4,
                idleWarningAfterMinutes: 5,
                idlePauseAfterMinutes: 12,
                maxSessionDurationHours: 8,
                allowResumeAfterIdlePause: true,
                requireNoteOnResumeAfterMinutes: 30,
            });

        expect(res.status).toBe(200);
        expect(prisma.timerPolicyConfig.create).toHaveBeenCalled();
        expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ action: 'timer_policy_updated' }),
        }));
    });

    it('rejects non-admin timer policy updates', async () => {
        const res = await request(app)
            .put('/api/v1/admin/timer-policy')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ idlePauseAfterMinutes: 15 });

        expect(res.status).toBe(403);
        expect(prisma.timerPolicyConfig.create).not.toHaveBeenCalled();
    });

    it('rejects unsafe timer policy values', async () => {
        const res = await request(app)
            .put('/api/v1/admin/timer-policy')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                idleWarningAfterMinutes: 0,
                idlePauseAfterMinutes: 0,
                maxSessionDurationHours: 24,
            });

        expect(res.status).toBe(400);
        expect(res.body.errors.length).toBeGreaterThan(0);
        expect(prisma.timerPolicyConfig.create).not.toHaveBeenCalled();
    });
});

describe('GET /api/v1/admin/audit-logs', () => {
    it('returns a combined audit feed with auth events sorted newest first', async () => {
        (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'audit-1',
                action: 'project_archive',
                resource: 'project',
                metadata: {},
                created_at: new Date('2026-04-07T08:00:00.000Z'),
                user: {
                    email: 'admin@webforxtech.com',
                    first_name: 'Admin',
                    last_name: 'User',
                },
            },
        ]);

        (prisma.authEvent.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'auth-1',
                email: 'alice@webforxtech.com',
                event_type: 'login_attempt',
                outcome: 'failure',
                reason: 'invalid_password',
                metadata: {},
                created_at: new Date('2026-04-07T09:00:00.000Z'),
                user: {
                    email: 'alice@webforxtech.com',
                    first_name: 'Alice',
                    last_name: 'Johnson',
                },
            },
        ]);

        const res = await request(app)
            .get('/api/v1/admin/audit-logs')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.logs).toHaveLength(2);
        expect(res.body.logs[0]).toMatchObject({
            id: 'auth-1',
            source: 'auth',
            action: 'login_attempt',
            resource: 'authentication',
            email: 'alice@webforxtech.com',
            outcome: 'failure',
            reason: 'invalid_password',
        });
        expect(res.body.logs[1]).toMatchObject({
            id: 'audit-1',
            source: 'audit',
            action: 'project_archive',
            resource: 'project',
            email: 'admin@webforxtech.com',
        });
    });

    it('returns 403 for non-admin users', async () => {
        const res = await request(app)
            .get('/api/v1/admin/audit-logs')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(403);
    });
});

describe('DELETE /api/v1/admin/notifications/:notificationId', () => {
    it('soft deletes a system notification for admin views', async () => {
        (prisma.notification.findFirst as jest.Mock).mockResolvedValue({
            id: 'notif-1',
            is_read: false,
            read_at: null,
            deleted_at: null,
        });

        const res = await request(app)
            .delete('/api/v1/admin/notifications/notif-1')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'notif-1' },
            data: expect.objectContaining({
                deleted_at: expect.any(Date),
                is_read: true,
            }),
        }));
    });

    it('returns 403 for users without admin notification access', async () => {
        const employeeToken = makeToken('user-emp-1', 'Employee');

        const res = await request(app)
            .delete('/api/v1/admin/notifications/notif-1')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
    });
});
