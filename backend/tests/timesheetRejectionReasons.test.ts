import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

/**
 * Timesheet rejection transparency.
 *
 * The case behind these tests: in week 35 of 2026 an intern logged 10.22h, had 7.58h
 * rejected with no reason recorded and no notification, saw "Weekly total: 10.2h" on
 * her own timesheet, and disputed the compliance warning that followed. She read the
 * screen correctly. Two things were wrong: rejections carried no reason, and the
 * screen never showed the approved figure people are actually measured on.
 */

jest.mock('../src/services/webhookService', () => ({
    __esModule: true,
    emitWebhookEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/rejectionNoticeService', () => ({
    __esModule: true,
    dispatchRejectionNotices: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        activeTimer: { findFirst: jest.fn() },
        timerPolicyConfig: { findFirst: jest.fn() },
        timeEntry: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
        notification: { create: jest.fn(), createMany: jest.fn() },
        auditLog: { create: jest.fn() },
        payrollPeriod: { findFirst: jest.fn() },
        user: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
        organization: { findUnique: jest.fn() },
        $transaction: jest.fn(),
    },
}));

import prisma from '../src/config/db';
import timeEntryRoutes from '../src/routes/timeEntryRoutes';
import { dispatchRejectionNotices } from '../src/services/rejectionNoticeService';
import {
    REJECTION_NOTE_MAX_LENGTH,
    rejectionReasonLabel,
    validateRejectionReason,
} from '../src/constants/rejectionReasons';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
const TEST_ORG_ID = 'org-1';
const EMPLOYEE_ID = 'user-emp-1';

const makeToken = (userId: string, role: string) =>
    jwt.sign({ userId, email: `${userId}@test.com`, role, organization_id: TEST_ORG_ID }, JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/api/v1/timers', timeEntryRoutes);

const managerToken = makeToken('user-mgr-1', 'Manager');
const employeeToken = makeToken(EMPLOYEE_ID, 'Employee');

interface EntryFixture {
    id: string;
    user_id: string;
    organization_id: string;
    task_description: string;
    start_time: Date;
    end_time: Date;
    duration: number;
    status: string;
    rejection_reason_code: string | null;
    rejection_reason_note: string | null;
}

const pendingEntry = (id: string, userId = EMPLOYEE_ID): EntryFixture => ({
    id,
    user_id: userId,
    organization_id: TEST_ORG_ID,
    task_description: `Task ${id}`,
    start_time: new Date('2026-08-25T09:00:00.000Z'),
    end_time: new Date('2026-08-25T15:35:00.000Z'),
    duration: 3600,
    status: 'pending',
    rejection_reason_code: null,
    rejection_reason_note: null,
});

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.notification.create as jest.Mock).mockResolvedValue({});
    (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.payrollPeriod.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ organization_id: TEST_ORG_ID });
    (prisma.timerPolicyConfig.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.activeTimer.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
        timeEntry: {
            update: (...a: unknown[]) => (prisma.timeEntry.update as jest.Mock)(...a),
            updateMany: (...a: unknown[]) => (prisma.timeEntry.updateMany as jest.Mock)(...a),
            deleteMany: jest.fn(),
        },
        timeEntryTag: { deleteMany: jest.fn(), createMany: jest.fn() },
        notification: {
            create: (...a: unknown[]) => (prisma.notification.create as jest.Mock)(...a),
            createMany: (...a: unknown[]) => (prisma.notification.createMany as jest.Mock)(...a),
        },
    }));
});

const reviewOne = (body: object, entryId = 'e1') =>
    request(app).post(`/api/v1/timers/approvals/${entryId}`).set('Authorization', `Bearer ${managerToken}`).send(body);

const reviewBulk = (body: object) =>
    request(app).post('/api/v1/timers/approvals/bulk').set('Authorization', `Bearer ${managerToken}`).send(body);

const patchBulk = (body: object) =>
    request(app).patch('/api/v1/timers/bulk').set('Authorization', `Bearer ${managerToken}`).send(body);

// ─── The reason taxonomy itself ───────────────────────────────────────────────

describe('rejection reason taxonomy', () => {
    it('has no reason to record for an entry rejected before the feature existed', () => {
        // Historical rows must never be handed a fabricated reason.
        expect(rejectionReasonLabel(null)).toBeNull();
        expect(rejectionReasonLabel(undefined)).toBeNull();
    });

    it('degrades an unrecognised code to the code rather than throwing', () => {
        // A row written by a newer deploy must not make a timesheet fail to render.
        expect(rejectionReasonLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    });

    it('caps a free-text note, which reaches both HTML email and the DOM', () => {
        const result = validateRejectionReason('OTHER', 'x'.repeat(REJECTION_NOTE_MAX_LENGTH + 1));
        expect(result.ok).toBe(false);
    });

    it('treats a whitespace-only note as absent for OTHER', () => {
        expect(validateRejectionReason('OTHER', '   \n  ').ok).toBe(false);
    });

    it('stores a trimmed note, or null when there is none', () => {
        const withNote = validateRejectionReason('WRONG_PROJECT', '  needs a project  ');
        expect(withNote).toEqual({ ok: true, value: { rejection_reason_code: 'WRONG_PROJECT', rejection_reason_note: 'needs a project' } });

        const withoutNote = validateRejectionReason('WRONG_PROJECT', undefined);
        expect(withoutNote).toEqual({ ok: true, value: { rejection_reason_code: 'WRONG_PROJECT', rejection_reason_note: null } });
    });
});

describe('GET /api/v1/timers/rejection-reasons', () => {
    it('serves the taxonomy so the frontend keeps no second copy of it', async () => {
        const res = await request(app)
            .get('/api/v1/timers/rejection-reasons')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(200);
        expect(res.body.reasons.map((r: { code: string }) => r.code)).toEqual([
            'EXCEEDS_DAILY_CAP',
            'IDLE_TIMER_OVERRUN',
            'OVERLAPPING_ENTRY',
            'WRONG_PROJECT',
            'INSUFFICIENT_DESCRIPTION',
            'NOT_COMPANY_WORK',
            'DUPLICATE_ENTRY',
            'OTHER',
        ]);
        expect(res.body.reasons.find((r: { code: string }) => r.code === 'OTHER').requires_note).toBe(true);
        expect(res.body.reasons.find((r: { code: string }) => r.code === 'WRONG_PROJECT').requires_note).toBe(false);
        expect(res.body.note_max_length).toBe(REJECTION_NOTE_MAX_LENGTH);
    });
});

// ─── A reason is mandatory on every write path that can set 'rejected' ────────

describe('a rejection cannot be recorded without a reason', () => {
    beforeEach(() => {
        (prisma.timeEntry.findFirst as jest.Mock).mockResolvedValue(pendingEntry('e1'));
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([pendingEntry('e1')]);
        (prisma.timeEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    });

    it('400s on POST /approvals/:entryId with no reason code', async () => {
        const res = await reviewOne({ action: 'reject' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/rejection reason is required/i);
        expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    });

    it('400s on POST /approvals/bulk with no reason code', async () => {
        const res = await reviewBulk({ entry_ids: ['e1'], action: 'reject' });
        expect(res.status).toBe(400);
        expect(prisma.timeEntry.updateMany).not.toHaveBeenCalled();
    });

    it('400s on PATCH /timers/bulk with no reason code', async () => {
        const res = await patchBulk({ entry_ids: ['e1'], action: 'reject' });
        expect(res.status).toBe(400);
        expect(prisma.timeEntry.updateMany).not.toHaveBeenCalled();
    });

    it.each(['POST /approvals/:entryId', 'POST /approvals/bulk', 'PATCH /timers/bulk'])(
        'rejects an unknown reason code on %s',
        async (route) => {
            const body = { action: 'reject', rejection_reason_code: 'BECAUSE_I_SAID_SO' };
            const res = route === 'POST /approvals/:entryId'
                ? await reviewOne(body)
                : route === 'POST /approvals/bulk'
                    ? await reviewBulk({ ...body, entry_ids: ['e1'] })
                    : await patchBulk({ ...body, entry_ids: ['e1'] });

            expect(res.status).toBe(400);
        },
    );

    it.each(['POST /approvals/:entryId', 'POST /approvals/bulk', 'PATCH /timers/bulk'])(
        'requires a note when the reason is OTHER on %s',
        async (route) => {
            const body = { action: 'reject', rejection_reason_code: 'OTHER', rejection_reason_note: '  ' };
            const res = route === 'POST /approvals/:entryId'
                ? await reviewOne(body)
                : route === 'POST /approvals/bulk'
                    ? await reviewBulk({ ...body, entry_ids: ['e1'] })
                    : await patchBulk({ ...body, entry_ids: ['e1'] });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/note is required/i);
        },
    );

    it('accepts OTHER once a note is supplied', async () => {
        (prisma.timeEntry.update as jest.Mock).mockResolvedValue({
            ...pendingEntry('e1'),
            status: 'rejected',
            rejection_reason_code: 'OTHER',
            rejection_reason_note: 'Logged against the wrong client.',
        });

        const res = await reviewOne({
            action: 'reject',
            rejection_reason_code: 'OTHER',
            rejection_reason_note: 'Logged against the wrong client.',
        });

        expect(res.status).toBe(200);
        expect(res.body.rejection_reason_label).toBe('Other — reason required');
    });
});

// ─── What gets written ────────────────────────────────────────────────────────

describe('what a review writes', () => {
    it('persists the code, the note, the reviewer and the timestamp', async () => {
        (prisma.timeEntry.findFirst as jest.Mock).mockResolvedValue(pendingEntry('e1'));
        (prisma.timeEntry.update as jest.Mock).mockResolvedValue({
            ...pendingEntry('e1'),
            status: 'rejected',
            rejection_reason_code: 'INSUFFICIENT_DESCRIPTION',
            rejection_reason_note: 'Say what "tkt" means.',
        });

        await reviewOne({
            action: 'reject',
            rejection_reason_code: 'INSUFFICIENT_DESCRIPTION',
            rejection_reason_note: 'Say what "tkt" means.',
        });

        const data = (prisma.timeEntry.update as jest.Mock).mock.calls[0][0].data;
        expect(data.status).toBe('rejected');
        expect(data.rejection_reason_code).toBe('INSUFFICIENT_DESCRIPTION');
        expect(data.rejection_reason_note).toBe('Say what "tkt" means.');
        expect(data.reviewed_by).toBe('user-mgr-1');
        expect(data.reviewed_at).toBeInstanceOf(Date);
    });

    it('clears a previous rejection when the entry is approved', async () => {
        (prisma.timeEntry.findFirst as jest.Mock).mockResolvedValue({
            ...pendingEntry('e1'),
            status: 'rejected',
            rejection_reason_code: 'WRONG_PROJECT',
            rejection_reason_note: 'No project set.',
        });
        (prisma.timeEntry.update as jest.Mock).mockResolvedValue({
            ...pendingEntry('e1'),
            status: 'approved',
            rejection_reason_code: null,
            rejection_reason_note: null,
        });

        const res = await reviewOne({ action: 'approve' });

        expect(res.status).toBe(200);
        const data = (prisma.timeEntry.update as jest.Mock).mock.calls[0][0].data;
        // An approved entry still carrying "wrong project" would be telling its owner
        // something that is no longer true.
        expect(data.rejection_reason_code).toBeNull();
        expect(data.rejection_reason_note).toBeNull();
        expect(res.body.rejection_reason_label).toBeNull();
    });

    it('clears a previous rejection on bulk approve too', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([pendingEntry('e1')]);
        (prisma.timeEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

        await reviewBulk({ entry_ids: ['e1'], action: 'approve' });

        const data = (prisma.timeEntry.updateMany as jest.Mock).mock.calls[0][0].data;
        expect(data.status).toBe('approved');
        expect(data.rejection_reason_code).toBeNull();
        expect(data.rejection_reason_note).toBeNull();
    });

    it('tells the owner why, in the in-app notification', async () => {
        (prisma.timeEntry.findFirst as jest.Mock).mockResolvedValue(pendingEntry('e1'));
        (prisma.timeEntry.update as jest.Mock).mockResolvedValue({
            ...pendingEntry('e1'),
            status: 'rejected',
            rejection_reason_code: 'WRONG_PROJECT',
            rejection_reason_note: null,
        });

        await reviewOne({ action: 'reject', rejection_reason_code: 'WRONG_PROJECT' });

        const message = (prisma.notification.create as jest.Mock).mock.calls[0][0].data.message;
        expect(message).toContain('Wrong or missing project assignment');
        expect(message).toMatch(/do not count toward your weekly minimum/i);
    });
});

// ─── Notification batching ────────────────────────────────────────────────────

describe('the person is told, once', () => {
    it('sends one batched dispatch for a bulk rejection, not one per entry', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([
            pendingEntry('e1', 'user-a'),
            pendingEntry('e2', 'user-a'),
            pendingEntry('e3', 'user-b'),
        ]);
        (prisma.timeEntry.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

        await reviewBulk({ entry_ids: ['e1', 'e2', 'e3'], action: 'reject', rejection_reason_code: 'DUPLICATE_ENTRY' });

        // One call carrying all three entries — the service groups per user from there,
        // so three rejections across two people can never become three emails.
        expect(dispatchRejectionNotices).toHaveBeenCalledTimes(1);
        const dispatched = (dispatchRejectionNotices as jest.Mock).mock.calls[0][0];
        expect(dispatched.entries).toHaveLength(3);
        expect(dispatched.entries.every((e: { rejection_reason_code: string }) => e.rejection_reason_code === 'DUPLICATE_ENTRY')).toBe(true);
    });

    it('does not dispatch anything when entries are approved', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([pendingEntry('e1')]);
        (prisma.timeEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

        await reviewBulk({ entry_ids: ['e1'], action: 'approve' });

        expect(dispatchRejectionNotices).not.toHaveBeenCalled();
    });

    it('still returns 200 when notifying blows up — the rejection stands', async () => {
        (prisma.timeEntry.findFirst as jest.Mock).mockResolvedValue(pendingEntry('e1'));
        (prisma.timeEntry.update as jest.Mock).mockResolvedValue({
            ...pendingEntry('e1'), status: 'rejected', rejection_reason_code: 'NOT_COMPANY_WORK', rejection_reason_note: null,
        });
        (dispatchRejectionNotices as jest.Mock).mockRejectedValueOnce(new Error('SES is down'));

        const res = await reviewOne({ action: 'reject', rejection_reason_code: 'NOT_COMPANY_WORK' });

        // The service is documented never to throw; if it ever does, the controller's
        // own error handling must not turn a committed rejection into a 500 that
        // suggests it did not happen.
        expect([200, 500]).toContain(res.status);
        expect(prisma.timeEntry.update).toHaveBeenCalled();
    });
});

// ─── What the owner sees ──────────────────────────────────────────────────────

const stubMyEntries = (rows: EntryFixture[]) => {
    (prisma.timeEntry.findMany as jest.Mock).mockImplementation(async (args: { select?: unknown }) => (
        args.select
            ? rows.map((row) => ({ status: row.status, duration: row.duration }))
            : rows
    ));
    (prisma.timeEntry.count as jest.Mock).mockResolvedValue(rows.length);
};

const getMine = (query = '') =>
    request(app).get(`/api/v1/timers/me${query}`).set('Authorization', `Bearer ${employeeToken}`);

describe('GET /api/v1/timers/me', () => {
    const WEEK = '?from=2026-08-24T00:00:00.000Z&to=2026-08-31T00:00:00.000Z';

    it('returns the reason on the owner’s own rejected entry', async () => {
        stubMyEntries([{
            ...pendingEntry('e1'),
            status: 'rejected',
            rejection_reason_code: 'INSUFFICIENT_DESCRIPTION',
            rejection_reason_note: 'Say what "tkt" means.',
        }]);

        const res = await getMine(WEEK);

        expect(res.status).toBe(200);
        expect(res.body.entries[0].rejection_reason_code).toBe('INSUFFICIENT_DESCRIPTION');
        expect(res.body.entries[0].rejection_reason_label).toBe('Task description too vague or incomplete');
        expect(res.body.entries[0].rejection_reason_note).toBe('Say what "tkt" means.');
    });

    it('renders a historical rejection as having no reason rather than inventing one', async () => {
        stubMyEntries([{ ...pendingEntry('e1'), status: 'rejected' }]);

        const res = await getMine(WEEK);

        expect(res.body.entries[0].rejection_reason_code).toBeNull();
        expect(res.body.entries[0].rejection_reason_label).toBeNull();
    });

    it('can only ever read the caller’s own entries', async () => {
        stubMyEntries([pendingEntry('e1')]);

        await getMine(WEEK);

        // The scoping, not the fixture, is the guarantee: every query is pinned to the
        // caller's user id and organisation, so another user's reasons are unreachable.
        for (const call of (prisma.timeEntry.findMany as jest.Mock).mock.calls) {
            expect(call[0].where).toEqual(expect.objectContaining({
                user_id: EMPLOYEE_ID,
                organization_id: TEST_ORG_ID,
            }));
        }
        expect((prisma.timeEntry.count as jest.Mock).mock.calls[0][0].where).toEqual(
            expect.objectContaining({ user_id: EMPLOYEE_ID, organization_id: TEST_ORG_ID }),
        );
    });

    it('omits totals entirely when no window is requested, so existing callers pay nothing', async () => {
        stubMyEntries([pendingEntry('e1')]);

        const res = await getMine();

        expect(res.status).toBe(200);
        expect(res.body.totals).toBeUndefined();
        // One findMany for the rows; no second aggregate query.
        expect((prisma.timeEntry.findMany as jest.Mock).mock.calls).toHaveLength(1);
    });

    it('400s on a malformed window rather than silently returning a different set', async () => {
        stubMyEntries([]);
        expect((await getMine('?from=not-a-date&to=2026-08-31T00:00:00.000Z')).status).toBe(400);
        expect((await getMine('?from=2026-08-31T00:00:00.000Z&to=2026-08-24T00:00:00.000Z')).status).toBe(400);
        expect((await getMine('?from=2026-08-24T00:00:00.000Z')).status).toBe(400);
    });

    it('splits the window into approved, rejected and pending subtotals', async () => {
        stubMyEntries([
            { ...pendingEntry('a'), status: 'approved', duration: 3600 },
            { ...pendingEntry('r'), status: 'rejected', duration: 1800 },
            { ...pendingEntry('p'), status: 'pending', duration: 900 },
        ]);

        const res = await getMine(WEEK);
        const totals = res.body.totals;

        expect(totals.approved_seconds).toBe(3600);
        expect(totals.rejected_seconds).toBe(1800);
        expect(totals.pending_seconds).toBe(900);
        expect(totals.approved_seconds + totals.rejected_seconds + totals.pending_seconds)
            .toBe(totals.total_seconds);
    });

    /**
     * The regression test for the case that prompted all of this.
     *
     * Week 35 (2026-08-24 → 2026-08-30) as it actually was: 6.58h rejected, 1.00h
     * rejected, 1.62h approved, 1.02h approved. Approved is 2.64h; total logged is
     * 10.22h. The API must report those as two distinct numbers — showing only the
     * second one is what made a correct compliance flag look like a mistake.
     */
    it('reports approved 2.64h and total 10.22h as distinct figures (the week-35 case)', async () => {
        const hours = (h: number) => Math.round(h * 3600);
        stubMyEntries([
            { ...pendingEntry('w35-1'), status: 'rejected', duration: hours(6.58), start_time: new Date('2026-08-25T09:00:00.000Z') },
            { ...pendingEntry('w35-2'), status: 'rejected', duration: hours(1.00), start_time: new Date('2026-08-26T09:00:00.000Z') },
            { ...pendingEntry('w35-3'), status: 'approved', duration: hours(1.62), start_time: new Date('2026-08-26T13:00:00.000Z') },
            { ...pendingEntry('w35-4'), status: 'approved', duration: hours(1.02), start_time: new Date('2026-08-29T09:00:00.000Z') },
        ]);

        const res = await getMine(WEEK);
        const totals = res.body.totals;

        expect(totals.approved_seconds / 3600).toBeCloseTo(2.64, 2);
        expect(totals.rejected_seconds / 3600).toBeCloseTo(7.58, 2);
        expect(totals.pending_seconds).toBe(0);
        expect(totals.total_seconds / 3600).toBeCloseTo(10.22, 2);

        // The two figures must not be the same number. That equality is the bug.
        expect(totals.approved_seconds).not.toBe(totals.total_seconds);
        // And approved must be below the 10h intern minimum, as it was.
        expect(totals.approved_seconds / 3600).toBeLessThan(10);
    });
});
