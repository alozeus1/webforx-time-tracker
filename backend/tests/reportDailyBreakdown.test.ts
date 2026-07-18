import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import reportRoutes from '../src/routes/reportRoutes';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        user: {
            findFirst: jest.fn(),
        },
        timeEntry: {
            findMany: jest.fn(),
        },
    },
}));

import prisma from '../src/config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
// organization_id embedded directly so authenticateToken skips its DB lookup path.
const makeToken = (userId: string, role: string, organizationId = 'org-1') =>
    jwt.sign({ userId, email: `${userId}@test.com`, role, organization_id: organizationId }, JWT_SECRET);

const employeeToken = makeToken('user-1', 'Employee');
const managerToken = makeToken('user-mgr-1', 'Manager');

const app = express();
app.use(express.json());
app.use('/api/v1/reports', reportRoutes);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('GET /api/v1/reports/day', () => {
    it('rejects a malformed date', async () => {
        const res = await request(app)
            .get('/api/v1/reports/day?date=not-a-date')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(400);
        expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
    });

    it('returns 404 when the requested user is not in the caller\'s organization', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .get('/api/v1/reports/day?date=2026-04-06')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(404);
    });

    it('ignores queryUserId for a non-manager and always scopes to the caller', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue({
            id: 'user-1', first_name: 'Alice', last_name: 'Smith', email: 'alice@webforxtech.com',
        });
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);

        const res = await request(app)
            .get('/api/v1/reports/day?date=2026-04-06&queryUserId=someone-else')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(200);
        expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'user-1', organization_id: 'org-1' },
        }));
        expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ user_id: 'user-1', organization_id: 'org-1' }),
        }));
    });

    it('lets a manager inspect another user\'s day via queryUserId', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue({
            id: 'user-2', first_name: 'Bob', last_name: 'Jones', email: 'bob@webforxtech.com',
        });
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'entry-1',
                task_description: 'Platform work',
                duration: 7200,
                start_time: new Date('2026-04-06T09:00:00.000Z'),
                end_time: new Date('2026-04-06T11:00:00.000Z'),
                status: 'approved',
                is_billable: true,
                project: { id: 'proj-1', name: 'Platform Engineering' },
            },
        ]);

        const res = await request(app)
            .get('/api/v1/reports/day?date=2026-04-06&queryUserId=user-2')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            date: '2026-04-06',
            user: { id: 'user-2', first_name: 'Bob', last_name: 'Jones' },
            totalSeconds: 7200,
        });
        expect(res.body.entries).toHaveLength(1);
        expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'user-2', organization_id: 'org-1' },
        }));
    });

    it('returns a zero-hour day cleanly for a user who logged nothing that day', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue({
            id: 'user-2', first_name: 'Bob', last_name: 'Jones', email: 'bob@webforxtech.com',
        });
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);

        const res = await request(app)
            .get('/api/v1/reports/day?date=2026-04-06&queryUserId=user-2')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ entries: [], totalSeconds: 0 });
    });
});
