import prisma from '../config/db';
import { env } from '../config/env';

/**
 * Data retention.
 *
 * Purges operational logs and ephemera once they age past the retention window
 * (DATA_RETENTION_DAYS, default 90). This exists because the database is on a
 * metered plan: audit/auth/notification/location rows are the highest-churn tables
 * in the schema and they grow without bound, while nothing in the product reads
 * them beyond a short diagnostic window (Access Diagnostics itself only surfaces a
 * 30-day window).
 *
 * DELIBERATELY NOT PURGED — business records whose loss would corrupt reporting,
 * billing, payroll, or compliance history: TimeEntry, Invoice, InvoiceLineItem,
 * Expense, ExpenseAttachment, LeaveRequest, LeaveRequestHistory, PayrollPeriod,
 * ScheduleEntry, TimerCorrectionRequest. If a retention policy is ever wanted for
 * those, it needs an explicit product decision and almost certainly an export step
 * first — do not quietly add them to this list.
 */

// Rows are deleted in batches so a single run never holds a long transaction open
// or exceeds the serverless function timeout on a large backlog.
const BATCH_SIZE = 5_000;
const MAX_BATCHES_PER_TABLE = 40;

export interface RetentionResult {
    cutoff: string;
    retentionDays: number;
    deleted: Record<string, number>;
    totalDeleted: number;
    truncated: string[];
}

type BatchDeleter = (cutoff: Date, take: number) => Promise<number>;

/**
 * Deletes in batches keyed on the model's own id, which keeps each statement
 * bounded and index-driven regardless of how much backlog has accumulated.
 */
const deleteInBatches = async (label: string, deleter: BatchDeleter, cutoff: Date) => {
    let deleted = 0;

    for (let batch = 0; batch < MAX_BATCHES_PER_TABLE; batch += 1) {
        const removed = await deleter(cutoff, BATCH_SIZE);
        deleted += removed;

        if (removed < BATCH_SIZE) {
            return { deleted, truncated: false };
        }
    }

    // Hitting the cap is not an error — the next scheduled run continues from here —
    // but it must be surfaced rather than silently reported as a completed sweep.
    console.warn(`[retention] ${label}: hit the ${MAX_BATCHES_PER_TABLE}-batch cap; remaining rows will be purged on the next run`);
    return { deleted, truncated: true };
};

const deleteOldestBy = <T extends { findMany: Function; deleteMany: Function }>(
    model: T,
    dateField: string,
): BatchDeleter => async (cutoff, take) => {
    const rows = await model.findMany({
        where: { [dateField]: { lt: cutoff } },
        select: { id: true },
        orderBy: { [dateField]: 'asc' },
        take,
    }) as Array<{ id: string }>;

    if (rows.length === 0) {
        return 0;
    }

    const result = await model.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } }) as { count: number };
    return result.count;
};

export const runRetentionCleanup = async (): Promise<RetentionResult> => {
    const retentionDays = env.dataRetentionDays;
    const now = new Date();
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    // Single-use credentials are worthless the moment they expire, so they are pruned
    // on expiry rather than waiting out the full retention window.
    const targets: Array<{ label: string; deleter: BatchDeleter; cutoff: Date }> = [
        { label: 'authEvent', deleter: deleteOldestBy(prisma.authEvent, 'created_at'), cutoff },
        { label: 'auditLog', deleter: deleteOldestBy(prisma.auditLog, 'created_at'), cutoff },
        { label: 'notification', deleter: deleteOldestBy(prisma.notification, 'created_at'), cutoff },
        { label: 'timerLocationEvent', deleter: deleteOldestBy(prisma.timerLocationEvent, 'recorded_at'), cutoff },
        { label: 'reportCache', deleter: deleteOldestBy(prisma.reportCache, 'expires_at'), cutoff: now },
        { label: 'passwordResetToken', deleter: deleteOldestBy(prisma.passwordResetToken, 'expires_at'), cutoff: now },
        { label: 'mfaChallenge', deleter: deleteOldestBy(prisma.mfaChallenge, 'expires_at'), cutoff: now },
    ];

    const deleted: Record<string, number> = {};
    const truncated: string[] = [];

    for (const target of targets) {
        // One failing table must not abort the sweep — the rest still need purging,
        // and the failure is reported in the result rather than swallowed.
        try {
            const outcome = await deleteInBatches(target.label, target.deleter, target.cutoff);
            deleted[target.label] = outcome.deleted;
            if (outcome.truncated) {
                truncated.push(target.label);
            }
        } catch (error) {
            console.error(`[retention] Failed to purge ${target.label}:`, error);
            deleted[target.label] = -1;
        }
    }

    const totalDeleted = Object.values(deleted)
        .filter((count) => count > 0)
        .reduce((sum, count) => sum + count, 0);

    console.log(`[retention] Purged ${totalDeleted} rows older than ${cutoff.toISOString()} (${retentionDays}d)`);

    return {
        cutoff: cutoff.toISOString(),
        retentionDays,
        deleted,
        totalDeleted,
        truncated,
    };
};
