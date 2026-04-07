import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import adminRoutes from '../src/routes/adminRoutes';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        auditLog: {
            findMany: jest.fn(),
        },
        authEvent: {
            findMany: jest.fn(),
        },
        notification: {
            findMany: jest.fn(),
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
