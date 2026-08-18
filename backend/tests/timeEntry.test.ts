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
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
            update: jest.fn(),
        },
        timerPolicyConfig: {
            findFirst: jest.fn(),
        },
        timerCorrectionRequest: {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            deleteMany: jest.fn(),
            count: jest.fn(),
        },
        timeEntry: {
            create: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            count: jest.fn(),
            aggregate: jest.fn(),
        },
        recoveryOverrideGrant: {
            aggregate: jest.fn(),
            create: jest.fn(),
        },
        timeEntryTag: {
            createMany: jest.fn(),
        },
        auditLog: {
            create: jest.fn(),
        },
        notification: {
            create: jest.fn(),
            createMany: jest.fn(),
        },
        organization: {
            findUnique: jest.fn(),
        },
        geofenceZone: {
            findMany: jest.fn(),
        },
        timerLocationEvent: {
            create: jest.fn(),
        },
        payrollPeriod: {
            findFirst: jest.fn(),
        },
        project: {
            findFirst: jest.fn(),
        },
        tag: {
            findMany: jest.fn(),
        },
        webhookSubscription: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        user: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
        // $transaction executes the callback synchronously with a tx object
        $transaction: jest.fn(),
    },
}));

import prisma from '../src/config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const TEST_ORG_ID = 'org-1';

const makeToken = (userId: string, role: string, organizationId = TEST_ORG_ID) =>
    jwt.sign({ userId, email: `${userId}@test.com`, role, organization_id: organizationId }, JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/api/v1/timers', timeEntryRoutes);

const employeeToken = makeToken('user-emp-1', 'Employee');
const managerToken = makeToken('user-mgr-1', 'Manager');
const adminToken = makeToken('user-admin-1', 'Admin');

const mockActiveTimer = {
    id: 'timer-1',
    user_id: 'user-emp-1',
    organization_id: TEST_ORG_ID,
    project_id: 'proj-1',
    task_description: 'Working on feature',
    start_time: new Date(Date.now() - 3600_000), // 1 hour ago
    last_active_ping: new Date(),
    last_heartbeat_at: new Date(),
    last_client_activity_at: new Date(),
    client_visibility: 'visible',
    client_has_focus: true,
    heartbeat_state: {},
    persisted_state: {},
};

const mockTimeEntry = {
    id: 'entry-1',
    user_id: 'user-emp-1',
    organization_id: TEST_ORG_ID,
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
    (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.geofenceZone.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.timerLocationEvent.create as jest.Mock).mockResolvedValue({});
    (prisma.payrollPeriod.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'proj-1' });
    (prisma.tag.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.timerPolicyConfig.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ organization_id: TEST_ORG_ID });
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
    // Guardrail defaults: a classified-as-employee user, an empty day, an empty
    // timeline and an unused recovery allowance — i.e. nothing blocks. Tests that
    // exercise a guardrail override the relevant mock explicitly.
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: 'user-emp-1', organization_id: TEST_ORG_ID, timezone: 'UTC', employment_type: 'employee',
    });
    (prisma.timeEntry.aggregate as jest.Mock).mockResolvedValue({ _sum: { duration: 0 } });
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.timerCorrectionRequest.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.timerCorrectionRequest.count as jest.Mock).mockResolvedValue(0);
    (prisma.recoveryOverrideGrant.aggregate as jest.Mock).mockResolvedValue({ _sum: { extra_requests: 0 } });
    (prisma.timeEntry.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
            activeTimer: {
                delete: (...args: unknown[]) => (prisma.activeTimer.delete as jest.Mock)(...args),
                update: (...args: unknown[]) => (prisma.activeTimer.update as jest.Mock)(...args),
            },
            notification: {
                create: (...args: unknown[]) => (prisma.notification.create as jest.Mock)(...args),
            },
            timeEntry: {
                create: (...args: unknown[]) => (prisma.timeEntry.create as jest.Mock)(...args),
                update: (...args: unknown[]) => (prisma.timeEntry.update as jest.Mock)(...args),
            },
            timeEntryTag: {
                createMany: (...args: unknown[]) => (prisma.timeEntryTag.createMany as jest.Mock)(...args),
                deleteMany: jest.fn(),
            },
            tag: {
                findMany: (...args: unknown[]) => (prisma.tag.findMany as jest.Mock)(...args),
            },
            timerCorrectionRequest: {
                update: (...args: unknown[]) => (prisma.timerCorrectionRequest.update as jest.Mock)(...args),
                findMany: (...args: unknown[]) => (prisma.timerCorrectionRequest.findMany as jest.Mock)(...args),
            },
        };
        return fn(tx);
    });
});

// ─── startTimer ────────────────────────────────────────────────────────────

describe('POST /api/v1/timers/start', () => {
    it('returns 201 with new timer on success', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(null);
        (prisma.activeTimer.create as jest.Mock).mockResolvedValue(mockActiveTimer);

        const res = await request(app)
            .post('/api/v1/timers/start')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ project_id: 'proj-1', task_description: 'Working on feature' });

        expect(res.status).toBe(201);
        expect(res.body.id).toBe('timer-1');
        expect(res.body.task_description).toBe('Working on feature');
        expect(prisma.activeTimer.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ organization_id: TEST_ORG_ID }),
        }));
    });

    it('returns 400 when timer already running', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(mockActiveTimer);

        const res = await request(app)
            .post('/api/v1/timers/start')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ project_id: 'proj-1', task_description: 'Another task' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already running/i);
    });

    it('returns 400 when task_description is missing', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post('/api/v1/timers/start')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ project_id: 'proj-1' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/task description/i);
    });

    it('returns 404 when project_id is not owned by the caller organization', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(null);
        (prisma.project.findFirst as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post('/api/v1/timers/start')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ project_id: 'foreign-project', task_description: 'Cross tenant attempt' });

        expect(res.status).toBe(404);
        expect(res.body.message).toBe('Project not found');
        expect(prisma.project.findFirst).toHaveBeenCalledWith({
            where: { id: 'foreign-project', organization_id: TEST_ORG_ID, is_active: true },
            select: { id: true },
        });
        expect(prisma.activeTimer.create).not.toHaveBeenCalled();
    });

    it('allows clock-in inside an enabled allow zone and records the decision', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(null);
        (prisma.activeTimer.create as jest.Mock).mockResolvedValue(mockActiveTimer);
        (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ settings: { geofencing: { enabled: true, enforce_on_clock_in: true, max_accuracy_meters: 500 } } });
        (prisma.geofenceZone.findMany as jest.Mock).mockResolvedValue([{ id: 'zone-1', name: 'Office', rule_type: 'allow', latitude: 29.7604, longitude: -95.3698, radius_meters: 500 }]);

        const res = await request(app)
            .post('/api/v1/timers/start')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ project_id: 'proj-1', task_description: 'On-site work', location: { latitude: 29.7604, longitude: -95.3698, accuracy_meters: 25 } });

        expect(res.status).toBe(201);
        expect(prisma.timerLocationEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ decision: 'allowed', zone_id: 'zone-1' }) }));
    });

    it('rejects clock-in outside enabled allow zones without creating a timer', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(null);
        (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ settings: { geofencing: { enabled: true, enforce_on_clock_in: true, max_accuracy_meters: 500 } } });
        (prisma.geofenceZone.findMany as jest.Mock).mockResolvedValue([{ id: 'zone-1', name: 'Office', rule_type: 'allow', latitude: 29.7604, longitude: -95.3698, radius_meters: 100 }]);

        const res = await request(app)
            .post('/api/v1/timers/start')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ project_id: 'proj-1', task_description: 'Remote attempt', location: { latitude: 30.2672, longitude: -97.7431, accuracy_meters: 25 } });

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('GEOFENCE_RESTRICTED');
        expect(prisma.activeTimer.create).not.toHaveBeenCalled();
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
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(mockActiveTimer);
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
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(null);

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

    it('returns 404 when tag_ids include another organization tag', async () => {
        (prisma.tag.findMany as jest.Mock).mockResolvedValue([{ id: 'tag-a' }]);

        const res = await request(app)
            .post('/api/v1/timers/manual')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                project_id: 'proj-1',
                tag_ids: ['tag-a', 'foreign-tag'],
                task_description: 'Manual task',
                start_time: oneHourAgo.toISOString(),
                end_time: now.toISOString(),
            });

        expect(res.status).toBe(404);
        expect(res.body.message).toBe('One or more tags not found');
        expect(prisma.tag.findMany).toHaveBeenCalledWith({
            where: { id: { in: ['tag-a', 'foreign-tag'] }, organization_id: TEST_ORG_ID },
            select: { id: true },
        });
        expect(prisma.timeEntry.create).not.toHaveBeenCalled();
    });
});

// ─── getMyEntries ────────────────────────────────────────────────────────────

describe('GET /api/v1/timers/me', () => {
    it('returns 200 with entries array', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([mockTimeEntry]);
        (prisma.timeEntry.count as jest.Mock).mockResolvedValue(1);
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(null);

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
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(null);

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
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(mockActiveTimer);
        (prisma.activeTimer.update as jest.Mock).mockResolvedValue({
            ...mockActiveTimer,
            last_active_ping: new Date(),
        });

        const res = await request(app)
            .post('/api/v1/timers/ping')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                active_timer_id: 'timer-1',
                last_activity_at: new Date().toISOString(), // fresh timestamp — within validation window
                visibility_state: 'visible',
                has_focus: true,
            });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/ping successful/i);
        expect(prisma.activeTimer.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                last_heartbeat_at: expect.any(Date),
                last_client_activity_at: expect.any(Date),
                client_visibility: 'visible',
                client_has_focus: true,
            }),
        }));
    });

    it('returns 404 when no active timer to ping', async () => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post('/api/v1/timers/ping')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({});

        expect(res.status).toBe(404);
        expect(res.body.message).toMatch(/no active timer/i);
    });

    it('returns 200 and pauses stale unattended timers', async () => {
        const staleTimer = {
            ...mockActiveTimer,
            last_heartbeat_at: new Date(Date.now() - 11 * 60_000),
            last_client_activity_at: new Date(Date.now() - 11 * 60_000),
            client_visibility: 'visible',
            client_has_focus: true,
            paused_duration_seconds: 0,
            is_paused: false,
            paused_at: null,
            persisted_state: {},
        };

        (prisma.activeTimer.findFirst as jest.Mock)
            .mockResolvedValueOnce(staleTimer) // pingTimer lookup
            .mockResolvedValueOnce(staleTimer); // stopActiveTimerWithReason lookup

        const res = await request(app)
            .post('/api/v1/timers/ping')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                active_timer_id: 'timer-1',
                last_activity_at: new Date(Date.now() - 20 * 60_000).toISOString(),
                visibility_state: 'visible',
                has_focus: true,
            });

        expect(res.status).toBe(200);
        expect(res.body.state).toBe('paused');
        expect(prisma.activeTimer.update).toHaveBeenCalled();
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
        (prisma.timeEntry.findFirst as jest.Mock).mockResolvedValue(mockTimeEntry);
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
        (prisma.timeEntry.findFirst as jest.Mock).mockResolvedValue(mockTimeEntry);
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

    it('fails closed for unauthenticated, lower-role, and foreign-org approval attempts', async () => {
        const unauthenticated = await request(app).post('/api/v1/timers/approvals/foreign-entry').send({ action: 'approve' });
        const employee = await request(app).post('/api/v1/timers/approvals/foreign-entry').set('Authorization', `Bearer ${employeeToken}`).send({ action: 'approve' });
        (prisma.timeEntry.findFirst as jest.Mock).mockResolvedValue(null);
        const foreign = await request(app).post('/api/v1/timers/approvals/foreign-entry')
            .set('Authorization', `Bearer ${makeToken('manager-2', 'Manager', 'org-2')}`)
            .set('X-Organization-Id', TEST_ORG_ID).set('X-Role', 'Admin')
            .send({ action: 'approve' });
        expect(unauthenticated.status).toBe(401);
        expect(employee.status).toBe(403);
        expect(foreign.status).toBe(404);
        expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign-entry', organization_id: 'org-2' } });
        expect(prisma.timeEntry.update).not.toHaveBeenCalled();
        expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
});

// ─── pauseBeacon ────────────────────────────────────────────────────────────

describe('POST /api/v1/timers/pause-beacon', () => {
    it('pauses the active timer when a valid token is provided in the body', async () => {
        // pauseBeacon calls pauseActiveTimer which: user lookup → timer lookup → update → notification.create → auditLog.create
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({ organization_id: TEST_ORG_ID });
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(mockActiveTimer);
        (prisma.activeTimer.update as jest.Mock).mockResolvedValue({ ...mockActiveTimer, is_paused: true });

        const validToken = makeToken('user-emp-1', 'Employee');

        const res = await request(app)
            .post('/api/v1/timers/pause-beacon')
            .send({ token: validToken });

        expect(res.status).toBe(200);
        expect(prisma.activeTimer.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'timer-1' },
            data: expect.objectContaining({ is_paused: true }),
        }));
        expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                action: 'timer_paused',
                metadata: expect.objectContaining({ reason: 'tab_closed' }),
            }),
        }));
    });

    it('returns 200 even when the token is invalid (beacon always gets 200)', async () => {
        const res = await request(app)
            .post('/api/v1/timers/pause-beacon')
            .send({ token: 'not-a-valid-jwt' });

        expect(res.status).toBe(200);
        expect(prisma.activeTimer.update).not.toHaveBeenCalled();
    });

    it('returns 200 when no token is provided in the body', async () => {
        const res = await request(app)
            .post('/api/v1/timers/pause-beacon')
            .send({});

        expect(res.status).toBe(200);
        expect(prisma.activeTimer.update).not.toHaveBeenCalled();
    });
});

// ─── pingTimer timestamp validation ─────────────────────────────────────────

describe('POST /api/v1/timers/ping — timestamp validation', () => {
    beforeEach(() => {
        (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(mockActiveTimer);
        (prisma.activeTimer.update as jest.Mock).mockResolvedValue({ ...mockActiveTimer });
    });

    it('stores null for last_client_activity_at when last_activity_at is older than 2× heartbeat interval', async () => {
        // Default heartbeatIntervalMinutes=3, so threshold=6min. 10min is clearly stale.
        const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();

        const res = await request(app)
            .post('/api/v1/timers/ping')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                active_timer_id: 'timer-1',
                last_activity_at: tenMinutesAgo,
                visibility_state: 'visible',
                has_focus: true,
            });

        expect(res.status).toBe(200);
        expect(prisma.activeTimer.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ last_client_activity_at: null }),
        }));
    });

    it('stores null for last_client_activity_at when last_activity_at is in the future (clock skew)', async () => {
        const twoMinutesAhead = new Date(Date.now() + 2 * 60_000).toISOString();

        const res = await request(app)
            .post('/api/v1/timers/ping')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                active_timer_id: 'timer-1',
                last_activity_at: twoMinutesAhead,
                visibility_state: 'visible',
                has_focus: true,
            });

        expect(res.status).toBe(200);
        expect(prisma.activeTimer.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ last_client_activity_at: null }),
        }));
    });
});

// ─── correction requests ─────────────────────────────────────────────────────

describe('Timer correction requests', () => {
    const requestedStart = new Date(Date.now() - 40 * 60_000);
    const requestedEnd = new Date(Date.now() - 10 * 60_000);

    beforeEach(() => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.timeEntry.findFirst as jest.Mock).mockResolvedValue(null);
        (prisma.timerCorrectionRequest.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.timerCorrectionRequest.create as jest.Mock).mockResolvedValue({
            id: 'correction-1',
            user_id: 'user-emp-1',
            requested_start_time: requestedStart,
            requested_end_time: requestedEnd,
            requested_duration_seconds: 1800,
            reason: 'Timer paused while working',
            status: 'PENDING',
        });
    });

    it('allows a user to create a correction request without mutating time entries', async () => {
        const res = await request(app)
            .post('/api/v1/timers/corrections')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                requested_start_time: requestedStart.toISOString(),
                requested_end_time: requestedEnd.toISOString(),
                reason: 'Timer paused while working',
                work_note: 'Worked in AWS Console',
            });

        expect(res.status).toBe(201);
        expect(prisma.timerCorrectionRequest.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                user_id: 'user-emp-1',
                reason: 'Timer paused while working',
            }),
        }));
        expect(prisma.timeEntry.create).not.toHaveBeenCalled();
        expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ action: 'correction_request_created' }),
        }));
    });

    it('does not register the removed singular correction route', async () => {
        const res = await request(app)
            .post('/api/v1/timers/correction')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({
                requested_start_time: requestedStart.toISOString(),
                requested_end_time: requestedEnd.toISOString(),
                reason: 'Timer paused while working',
            });

        expect(res.status).toBe(404);
        expect(prisma.timerCorrectionRequest.create).not.toHaveBeenCalled();
    });

    it('allows a user to view only their correction requests', async () => {
        (prisma.timerCorrectionRequest.findMany as jest.Mock).mockResolvedValue([{ id: 'correction-1' }]);

        const res = await request(app)
            .get('/api/v1/timers/corrections')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(200);
        expect(prisma.timerCorrectionRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { organization_id: TEST_ORG_ID, user_id: 'user-emp-1' },
        }));
    });

    it('allows admins to view all correction requests', async () => {
        const res = await request(app)
            .get('/api/v1/timers/corrections/review')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(prisma.timerCorrectionRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
            include: expect.objectContaining({ user: expect.any(Object) }),
        }));
    });

    it('prevents regular users from viewing all correction requests', async () => {
        const res = await request(app)
            .get('/api/v1/timers/corrections/review')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
    });

    it('allows admins to approve correction requests through an audited adjustment entry', async () => {
        const correction = {
            id: 'correction-1',
            user_id: 'user-emp-1',
            requested_start_time: requestedStart,
            requested_end_time: requestedEnd,
            requested_duration_seconds: 1800,
            reason: 'Timer paused while working',
            work_note: 'Reviewed note',
            status: 'PENDING',
        };
        const txTimeEntryCreate = jest.fn().mockResolvedValue({ id: 'entry-correction-1' });
        const txCorrectionUpdate = jest.fn().mockResolvedValue({ ...correction, status: 'APPROVED' });

        (prisma.timerCorrectionRequest.findFirst as jest.Mock).mockResolvedValue(correction);
        (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
            timerCorrectionRequest: { update: txCorrectionUpdate },
            timeEntry: {
                // findOverlaps reads with findMany; an empty array means "no clash".
                findMany: jest.fn().mockResolvedValue([]),
                create: txTimeEntryCreate,
            },
        }));

        const res = await request(app)
            .post('/api/v1/timers/corrections/correction-1/review')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ action: 'approve', reviewer_note: 'Approved' });

        expect(res.status).toBe(200);
        expect(txTimeEntryCreate).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                entry_type: 'manual',
                status: 'approved',
                duration: 1800,
            }),
        }));
        expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ action: 'correction_request_approved' }),
        }));
    });

    it('allows admins to reject correction requests without creating time entries', async () => {
        const correction = {
            id: 'correction-1',
            user_id: 'user-emp-1',
            requested_start_time: requestedStart,
            requested_end_time: requestedEnd,
            requested_duration_seconds: 1800,
            reason: 'Timer paused while working',
            work_note: null,
            status: 'PENDING',
        };
        const txTimeEntryCreate = jest.fn();

        (prisma.timerCorrectionRequest.findFirst as jest.Mock).mockResolvedValue(correction);
        (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
            timerCorrectionRequest: { update: jest.fn().mockResolvedValue({ ...correction, status: 'REJECTED' }) },
            timeEntry: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: txTimeEntryCreate,
            },
        }));

        const res = await request(app)
            .post('/api/v1/timers/corrections/correction-1/review')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ action: 'reject', reviewer_note: 'Not enough detail' });

        expect(res.status).toBe(200);
        expect(txTimeEntryCreate).not.toHaveBeenCalled();
        expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                action: 'correction_request_rejected',
                metadata: expect.objectContaining({ reviewer_note: 'Not enough detail' }),
            }),
        }));
    });
});

// ─── correction review query filtering ───────────────────────────────────────

describe('GET /api/v1/timers/corrections/review', () => {
    beforeEach(() => {
        (prisma.timerCorrectionRequest.findMany as jest.Mock).mockResolvedValue([]);
    });

    it('defaults to returning all corrections for backward compatibility', async () => {
        const res = await request(app)
            .get('/api/v1/timers/corrections/review')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(prisma.timerCorrectionRequest.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organization_id: TEST_ORG_ID } })
        );
    });

    it('filters by single status', async () => {
        await request(app)
            .get('/api/v1/timers/corrections/review?status=PENDING')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(prisma.timerCorrectionRequest.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organization_id: TEST_ORG_ID, status: { in: ['PENDING'] } } })
        );
    });

    it('filters by comma-separated statuses', async () => {
        await request(app)
            .get('/api/v1/timers/corrections/review?status=APPROVED,REJECTED')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(prisma.timerCorrectionRequest.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organization_id: TEST_ORG_ID, status: { in: ['APPROVED', 'REJECTED'] } } })
        );
    });

    it('applies lookbackDays for resolved statuses', async () => {
        await request(app)
            .get('/api/v1/timers/corrections/review?status=APPROVED,REJECTED,CANCELLED&lookbackDays=30')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(prisma.timerCorrectionRequest.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    organization_id: TEST_ORG_ID,
                    status: { in: ['APPROVED', 'REJECTED', 'CANCELLED'] },
                    created_at: expect.objectContaining({ gte: expect.any(Date) }),
                }),
            })
        );
    });

    it('does not apply lookbackDays to pending requests', async () => {
        await request(app)
            .get('/api/v1/timers/corrections/review?status=PENDING&lookbackDays=30')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(prisma.timerCorrectionRequest.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { organization_id: TEST_ORG_ID, status: { in: ['PENDING'] } },
            })
        );
    });
});

// ─── correction retention purge ───────────────────────────────────────────────

describe('POST /api/v1/timers/corrections/purge-resolved', () => {
    beforeEach(() => {
        (prisma.timerCorrectionRequest.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.timerCorrectionRequest.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    });

    it('allows admins to purge old resolved corrections', async () => {
        (prisma.timerCorrectionRequest.findMany as jest.Mock).mockResolvedValue([{ id: 'old-1' }]);
        (prisma.timerCorrectionRequest.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

        const res = await request(app)
            .post('/api/v1/timers/corrections/purge-resolved')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.deleted).toBe(1);
        expect(prisma.timerCorrectionRequest.deleteMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: { in: ['old-1'] } } })
        );
    });

    it('prevents employees from purging corrections', async () => {
        const res = await request(app)
            .post('/api/v1/timers/corrections/purge-resolved')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
    });
});
