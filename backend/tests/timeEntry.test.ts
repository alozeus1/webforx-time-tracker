import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import timeEntryRoutes from '../src/routes/timeEntryRoutes';

// Mock webhookService before prisma so imports resolve cleanly
jest.mock('../src/services/webhookService', () => ({
    emitWebhookEvent: jest.fn().mockResolvedValue(undefined),
}));

// Mock prisma
jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        activeTimer: {
            findUnique: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
            update: jest.fn(),
        },
        timeEntry: {
            create: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
        timeEntryTag: {
            createMany: jest.fn(),
        },
        auditLog: {
            create: jest.fn(),
        },
        notification: {
            create: jest.fn(),
        },
        webhookSubscription: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        user: {
            findUnique: jest.fn(),
        },
        // $transaction executes the callback synchronously with a tx object
        $transaction: jest.fn(),
    },
}));

import prisma from '../src/config/db';

const JWT_SECRET = 'test-jwt-secret';

const makeToken = (userId: string, role: string) =>
    jwt.sign({ userId, email: `${userId}@test.com`, role }, JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/api/v1/timers', timeEntryRoutes);

const employeeToken = makeToken('user-emp-1', 'Employee');
const managerToken = makeToken('user-mgr-1', 'Manager');

const mockActiveTimer = {
    id: 'timer-1',
    user_id: 'user-emp-1',
    project_id: 'proj-1',
    task_description: 'Working on feature',
    start_time: new Date(Date.now() - 3600_000), // 1 hour ago
    last_active_ping: new Date(),
};

const mockTimeEntry = {
    id: 'entry-1',
    user_id: 'user-emp-1',
    project_id: 'proj-1',
    task_description: 'Working on feature',
    start_time: new Date(Date.now() - 3600_000),
    end_time: new Date(),
    duration: 3600,
    entry_type: 'timer',
    status: 'pending',
    notes: null,
    created_at: new Date(),
};

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.notification.create as jest.Mock).mockResolvedValue({});
});

// ─── startTimer ────────────────────────────────────────────────────────────

describe('POST /api/v1/timers/start', () => {
    it('returns 201 with new timer on success', async () => {
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(null);
        (prisma.activeTimer.create as jest.Mock).mockResolvedValue(mockActiveTimer);

        const res = await request(app)
            .post('/api/v1/timers/start')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ project_id: 'proj-1', task_description: 'Working on feature' });

        expect(res.status).toBe(201);
        expect(res.body.id).toBe('timer-1');
        expect(res.body.task_description).toBe('Working on feature');
    });

    it('returns 400 when timer already running', async () => {
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(mockActiveTimer);

        const res = await request(app)
            .post('/api/v1/timers/start')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ project_id: 'proj-1', task_description: 'Another task' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already running/i);
    });

    it('returns 400 when task_description is missing', async () => {
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post('/api/v1/timers/start')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ project_id: 'proj-1' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/task description/i);
    });

    it('returns 401 when no token is provided', async () => {
        const res = await request(app)
            .post('/api/v1/timers/start')
            .send({ project_id: 'proj-1', task_description: 'Task' });

        expect(res.status).toBe(401);
    });
});

// ─── stopTimer ─────────────────────────────────────────────────────────────

describe('POST /api/v1/timers/stop', () => {
    it('returns 200 with time entry on success', async () => {
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(mockActiveTimer);
        // $transaction receives a callback (tx => ...) — execute it with a mock tx object
        (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
            const tx = {
                timeEntry: { create: jest.fn().mockResolvedValue(mockTimeEntry) },
                activeTimer: { delete: jest.fn().mockResolvedValue(mockActiveTimer) },
                timeEntryTag: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
            };
            return fn(tx);
        });

        const res = await request(app)
            .post('/api/v1/timers/stop')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.id).toBe('entry-1');
        expect(res.body.duration).toBe(3600);
    });

    it('returns 404 when no active timer exists', async () => {
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post('/api/v1/timers/stop')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({});

        expect(res.status).toBe(404);
        expect(res.body.message).toMatch(/no active timer/i);
    });
});

// ─── manualEntry ────────────────────────────────────────────────────────────

describe('POST /api/v1/timers/manual', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600_000);

    it('returns 201 on valid manual entry', async () => {
        (prisma.timeEntry.create as jest.Mock).mockResolvedValue({
            ...mockTimeEntry,
            entry_type: 'manual',
        });

        const res = await request(app)
            .post('/api/v1/timers/manual')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                project_id: 'proj-1',
                task_description: 'Manual task',
                start_time: oneHourAgo.toISOString(),
                end_time: now.toISOString(),
            });

        expect(res.status).toBe(201);
        expect(res.body.entry_type).toBe('manual');
    });

    it('returns 400 when duration would be invalid (end before start)', async () => {
        const res = await request(app)
            .post('/api/v1/timers/manual')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                task_description: 'Bad timing',
                start_time: now.toISOString(),
                end_time: oneHourAgo.toISOString(), // end before start
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/invalid/i);
    });

    it('returns 400 when task_description is missing', async () => {
        const res = await request(app)
            .post('/api/v1/timers/manual')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                start_time: oneHourAgo.toISOString(),
                end_time: now.toISOString(),
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/task description/i);
    });
});

// ─── getMyEntries ────────────────────────────────────────────────────────────

describe('GET /api/v1/timers/me', () => {
    it('returns 200 with entries array', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([mockTimeEntry]);
        (prisma.timeEntry.count as jest.Mock).mockResolvedValue(1);
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .get('/api/v1/timers/me')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.entries)).toBe(true);
        expect(res.body.entries).toHaveLength(1);
        expect(res.body.activeTimer).toBeNull();
    });

    it('returns 200 with empty entries array when no entries exist', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.timeEntry.count as jest.Mock).mockResolvedValue(0);
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .get('/api/v1/timers/me')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(200);
        expect(res.body.entries).toEqual([]);
    });
});

// ─── pingTimer ────────────────────────────────────────────────────────────

describe('POST /api/v1/timers/ping', () => {
    it('returns 200 on successful ping', async () => {
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(mockActiveTimer);
        (prisma.activeTimer.update as jest.Mock).mockResolvedValue({
            ...mockActiveTimer,
            last_active_ping: new Date(),
        });

        const res = await request(app)
            .post('/api/v1/timers/ping')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/ping successful/i);
    });

    it('returns 404 when no active timer to ping', async () => {
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post('/api/v1/timers/ping')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({});

        expect(res.status).toBe(404);
        expect(res.body.message).toMatch(/no active timer/i);
    });
});

// ─── getPendingTimesheets ────────────────────────────────────────────────────

describe('GET /api/v1/timers/approvals', () => {
    it('returns 200 with pending list for Manager', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([
            {
                ...mockTimeEntry,
                status: 'pending',
                user: { id: 'user-emp-1', first_name: 'Alice', last_name: 'Smith', email: 'alice@test.com' },
                project: { name: 'EDUSUC' },
            },
        ]);

        const res = await request(app)
            .get('/api/v1/timers/approvals')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.entries)).toBe(true);
        expect(res.body.entries[0].status).toBe('pending');
    });

    it('returns 403 for Employee role', async () => {
        const res = await request(app)
            .get('/api/v1/timers/approvals')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
    });
});

// ─── reviewTimesheet ────────────────────────────────────────────────────────

describe('POST /api/v1/timers/approvals/:entryId', () => {
    it('returns 200 when approving a timesheet', async () => {
        const approvedEntry = { ...mockTimeEntry, status: 'approved' };
        (prisma.timeEntry.update as jest.Mock).mockResolvedValue(approvedEntry);

        const res = await request(app)
            .post('/api/v1/timers/approvals/entry-1')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ action: 'approve' });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('approved');
    });

    it('returns 200 when rejecting a timesheet', async () => {
        const rejectedEntry = { ...mockTimeEntry, status: 'rejected' };
        (prisma.timeEntry.update as jest.Mock).mockResolvedValue(rejectedEntry);

        const res = await request(app)
            .post('/api/v1/timers/approvals/entry-1')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ action: 'reject' });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('rejected');
    });

    it('returns 400 for invalid action', async () => {
        const res = await request(app)
            .post('/api/v1/timers/approvals/entry-1')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ action: 'delete' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/invalid action/i);
    });
});
