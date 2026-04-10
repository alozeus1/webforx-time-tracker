import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import reportRoutes from '../src/routes/reportRoutes';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        user: {
            findMany: jest.fn(),
        },
        timeEntry: {
            findMany: jest.fn(),
            groupBy: jest.fn(),
        },
        notification: {
            findMany: jest.fn(),
        },
        project: {
            findMany: jest.fn(),
        },
        auditLog: {
            findMany: jest.fn(),
        },
    },
}));

import prisma from '../src/config/db';

const JWT_SECRET = 'test-jwt-secret';
const makeToken = (userId: string, role: string) =>
    jwt.sign({ userId, email: `${userId}@test.com`, role }, JWT_SECRET);

const managerToken = makeToken('user-mgr-1', 'Manager');

const app = express();
app.use(express.json());
app.use('/api/v1/reports', reportRoutes);

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
        {
            id: 'user-1',
            first_name: 'Manager',
            last_name: 'One',
            weekly_hour_limit: 40,
            role: { name: 'Manager' },
        },
    ]);
    (prisma.timeEntry.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
    (prisma.timeEntry.groupBy as jest.Mock).mockResolvedValue([
        { user_id: 'user-1', _sum: { duration: 14_400 } },
    ]);
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.project.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
});

describe('GET /api/v1/reports/operations', () => {
    it('returns degraded operations data instead of failing when a dataset query errors', async () => {
        (prisma.notification.findMany as jest.Mock).mockRejectedValue(new Error('notification query failed'));

        const res = await request(app)
            .get('/api/v1/reports/operations')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.meta).toMatchObject({
            degraded: true,
        });
        expect(res.body.meta.warnings).toContain('notifications');
        expect(res.body.teamForecast.members).toHaveLength(1);
        expect(res.body.managerExceptions.pendingApprovals).toEqual([]);
    });

    it('tolerates users with a missing role payload in the operations forecast', async () => {
        (prisma.user.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'user-1',
                first_name: 'Manager',
                last_name: 'One',
                weekly_hour_limit: 40,
                role: null,
            },
        ]);

        const res = await request(app)
            .get('/api/v1/reports/operations')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.teamForecast.members[0].role).toBe('Employee');
    });
});
