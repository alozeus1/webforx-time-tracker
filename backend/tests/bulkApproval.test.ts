import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

jest.mock('../src/services/webhookService', () => ({
    __esModule: true,
    emitWebhookEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        activeTimer: { findFirst: jest.fn() },
        timerPolicyConfig: { findFirst: jest.fn() },
        timeEntry: { findMany: jest.fn(), updateMany: jest.fn() },
        notification: { createMany: jest.fn() },
        auditLog: { create: jest.fn() },
        payrollPeriod: { findFirst: jest.fn() },
        user: { findFirst: jest.fn(), findUnique: jest.fn() },
        organization: { findUnique: jest.fn() },
        $transaction: jest.fn(),
    },
}));

import prisma from '../src/config/db';
import timeEntryRoutes from '../src/routes/timeEntryRoutes';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
const TEST_ORG_ID = 'org-1';

const makeToken = (userId: string, role: string) =>
    jwt.sign({ userId, email: `${userId}@test.com`, role, organization_id: TEST_ORG_ID }, JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/api/v1/timers', timeEntryRoutes);

const managerToken = makeToken('user-mgr-1', 'Manager');
const employeeToken = makeToken('user-emp-1', 'Employee');

const pendingEntry = (id: string, userId = 'user-emp-1') => ({
    id,
    user_id: userId,
    task_description: `Task ${id}`,
    start_time: new Date('2026-08-12T09:00:00.000Z'),
    status: 'pending',
});

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.payrollPeriod.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ organization_id: TEST_ORG_ID });
    (prisma.timerPolicyConfig.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
        timeEntry: { updateMany: (...a: unknown[]) => (prisma.timeEntry.updateMany as jest.Mock)(...a) },
        notification: { createMany: (...a: unknown[]) => (prisma.notification.createMany as jest.Mock)(...a) },
    }));
});

const post = (token: string, body: object) =>
    request(app).post('/api/v1/timers/approvals/bulk').set('Authorization', `Bearer ${token}`).send(body);

describe('POST /api/v1/timers/approvals/bulk', () => {
    it('is closed to employees', async () => {
        const res = await post(employeeToken, { entry_ids: ['e1'], action: 'approve' });
        expect(res.status).toBe(403);
    });

    // "bulk" must not be swallowed by the /approvals/:entryId route.
    it('routes to the bulk handler rather than being read as an entry id', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([pendingEntry('e1')]);
        (prisma.timeEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

        const res = await post(managerToken, { entry_ids: ['e1'], action: 'approve' });

        expect(res.status).toBe(200);
        expect(res.body.updated).toBe(1);
    });

    it.each<[string, object]>([
        ['a non-review action', { entry_ids: ['e1'], action: 'delete' }],
        ['an empty selection', { entry_ids: [], action: 'approve' }],
        ['a missing selection', { action: 'approve' }],
    ])('rejects %s', async (_label, body) => {
        const res = await post(managerToken, body);
        expect(res.status).toBe(400);
    });

    it('refuses more than 200 entries in one request', async () => {
        const res = await post(managerToken, {
            entry_ids: Array.from({ length: 201 }, (_, i) => `e${i}`),
            action: 'approve',
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/200/);
    });

    it('approves only pending entries and reports the rest', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([
            pendingEntry('e1'),
            { ...pendingEntry('e2'), status: 'approved' },
        ]);
        (prisma.timeEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

        const res = await post(managerToken, { entry_ids: ['e1', 'e2', 'missing'], action: 'approve' });

        expect(res.status).toBe(200);
        expect(res.body.skipped_not_pending).toEqual(['e2']);
        expect(res.body.not_found).toEqual(['missing']);
        expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                id: { in: ['e1'] },
                organization_id: TEST_ORG_ID,
                status: 'pending',
            }),
            // Reason fields are nulled on approve, which clears any earlier rejection.
            data: expect.objectContaining({
                status: 'approved',
                rejection_reason_code: null,
                rejection_reason_note: null,
            }),
        }));
    });

    it('notifies every affected user, which the older bulk endpoint never did', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([
            pendingEntry('e1', 'user-a'),
            pendingEntry('e2', 'user-b'),
        ]);
        (prisma.timeEntry.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

        await post(managerToken, { entry_ids: ['e1', 'e2'], action: 'approve' });

        const rows = (prisma.notification.createMany as jest.Mock).mock.calls[0][0].data;
        expect(rows).toHaveLength(2);
        expect(rows.map((r: { user_id: string }) => r.user_id)).toEqual(['user-a', 'user-b']);
        expect(rows[0].type).toBe('approval_status');
    });

    it('skips entries inside a locked payroll period instead of failing the batch', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([
            pendingEntry('e1'),
            { ...pendingEntry('e2'), start_time: new Date('2026-07-01T09:00:00.000Z') },
        ]);
        (prisma.payrollPeriod.findFirst as jest.Mock).mockImplementation(async ({ where }) => (
            where.start_date?.lte?.toISOString?.() === '2026-07-01T09:00:00.000Z'
                ? { id: 'period-1', name: 'June', is_locked: true }
                : null
        ));
        (prisma.timeEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

        const res = await post(managerToken, { entry_ids: ['e1', 'e2'], action: 'approve' });

        expect(res.status).toBe(200);
        expect(res.body.skipped_locked).toEqual(['e2']);
    });

    it('returns 423 when every selected entry is locked', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([pendingEntry('e1')]);
        (prisma.payrollPeriod.findFirst as jest.Mock).mockResolvedValue({
            id: 'period-1', name: 'June', is_locked: true,
        });

        const res = await post(managerToken, { entry_ids: ['e1'], action: 'approve' });

        expect(res.status).toBe(423);
        expect(res.body.updated).toBe(0);
    });

    // Bulk rejection now carries a reason for the whole selection — see
    // tests/timesheetRejectionReasons.test.ts for the validation rules.
    it('rejects as well as approves, recording one reason across the selection', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([pendingEntry('e1')]);
        (prisma.timeEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

        await post(managerToken, { entry_ids: ['e1'], action: 'reject', rejection_reason_code: 'WRONG_PROJECT' });

        expect(prisma.timeEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                status: 'rejected',
                rejection_reason_code: 'WRONG_PROJECT',
            }),
        }));
    });

    it('writes one audit row describing the whole batch', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([pendingEntry('e1')]);
        (prisma.timeEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

        await post(managerToken, { entry_ids: ['e1'], action: 'approve' });

        expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                action: 'bulk_approve',
                resource: 'time_entry',
                metadata: expect.objectContaining({ updated_count: 1, entry_ids: ['e1'] }),
            }),
        }));
    });

    it('de-duplicates repeated ids so one entry is not counted twice', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([pendingEntry('e1')]);
        (prisma.timeEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

        await post(managerToken, { entry_ids: ['e1', 'e1', 'e1'], action: 'approve' });

        expect((prisma.timeEntry.findMany as jest.Mock).mock.calls[0][0].where.id).toEqual({ in: ['e1'] });
    });
});
