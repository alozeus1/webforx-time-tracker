const PURGED_MODELS = [
    'authEvent',
    'auditLog',
    'notification',
    'timerLocationEvent',
    'reportCache',
    'passwordResetToken',
    'mfaChallenge',
] as const;

// Business-record models are mocked too, so the test can assert that retention
// never touches them — an accidental addition to the purge list fails here.
const PROTECTED_MODELS = [
    'timeEntry',
    'invoice',
    'invoiceLineItem',
    'expense',
    'leaveRequest',
    'payrollPeriod',
    'scheduleEntry',
] as const;

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: [...PURGED_MODELS, ...PROTECTED_MODELS].reduce((acc, model) => {
        acc[model] = { findMany: jest.fn(), deleteMany: jest.fn() };
        return acc;
    }, {} as Record<string, { findMany: jest.Mock; deleteMany: jest.Mock }>),
}));

import prisma from '../src/config/db';
import { runRetentionCleanup } from '../src/services/retentionService';

const db = prisma as unknown as Record<string, { findMany: jest.Mock; deleteMany: jest.Mock }>;

const DAY = 24 * 60 * 60 * 1000;

/** Makes a model return `count` rows on its first call, then none. */
const stubRows = (model: string, count: number) => {
    db[model].findMany
        .mockResolvedValueOnce(Array.from({ length: count }, (_, i) => ({ id: `${model}-${i}` })))
        .mockResolvedValue([]);
    db[model].deleteMany.mockResolvedValue({ count });
};

beforeEach(() => {
    jest.clearAllMocks();
    for (const model of [...PURGED_MODELS, ...PROTECTED_MODELS]) {
        db[model].findMany.mockResolvedValue([]);
        db[model].deleteMany.mockResolvedValue({ count: 0 });
    }
});

describe('runRetentionCleanup', () => {
    it('purges every operational log table and reports the totals', async () => {
        for (const model of PURGED_MODELS) {
            stubRows(model, 3);
        }

        const result = await runRetentionCleanup();

        expect(result.totalDeleted).toBe(PURGED_MODELS.length * 3);
        for (const model of PURGED_MODELS) {
            expect(result.deleted[model]).toBe(3);
            expect(db[model].deleteMany).toHaveBeenCalled();
        }
    });

    it('never deletes business records', async () => {
        await runRetentionCleanup();

        for (const model of PROTECTED_MODELS) {
            expect(db[model].deleteMany).not.toHaveBeenCalled();
            expect(db[model].findMany).not.toHaveBeenCalled();
        }
    });

    it('uses a 90-day cutoff by default for age-based tables', async () => {
        const before = Date.now();
        const result = await runRetentionCleanup();
        const after = Date.now();

        expect(result.retentionDays).toBe(90);

        const cutoff = new Date(result.cutoff).getTime();
        expect(cutoff).toBeGreaterThanOrEqual(before - 90 * DAY - 1000);
        expect(cutoff).toBeLessThanOrEqual(after - 90 * DAY + 1000);

        const authEventWhere = db.authEvent.findMany.mock.calls[0][0].where;
        expect(new Date(authEventWhere.created_at.lt).getTime()).toBe(cutoff);
    });

    it('prunes expiring credentials on expiry rather than at the retention cutoff', async () => {
        const result = await runRetentionCleanup();
        const retentionCutoff = new Date(result.cutoff).getTime();

        for (const model of ['passwordResetToken', 'mfaChallenge', 'reportCache']) {
            const where = db[model].findMany.mock.calls[0][0].where;
            // Expiry-driven tables use "now", which is far newer than the 90-day cutoff.
            expect(new Date(where.expires_at.lt).getTime()).toBeGreaterThan(retentionCutoff);
        }
    });

    it('keeps sweeping other tables when one fails, and flags a partial run', async () => {
        db.auditLog.findMany.mockRejectedValue(new Error('connection lost'));
        stubRows('authEvent', 5);

        const result = await runRetentionCleanup();

        expect(result.deleted.auditLog).toBe(-1);
        expect(result.deleted.authEvent).toBe(5);
        // The failed table must not be counted as deleted rows.
        expect(result.totalDeleted).toBe(5);
        expect(db.notification.findMany).toHaveBeenCalled();
    });

    it('stops at the batch cap and reports the table as truncated', async () => {
        // Always returns a full batch, so the loop can only end at the cap.
        db.notification.findMany.mockResolvedValue(
            Array.from({ length: 5_000 }, (_, i) => ({ id: `n-${i}` })),
        );
        db.notification.deleteMany.mockResolvedValue({ count: 5_000 });

        const result = await runRetentionCleanup();

        expect(result.truncated).toContain('notification');
        expect(result.deleted.notification).toBe(40 * 5_000);
    });
});
