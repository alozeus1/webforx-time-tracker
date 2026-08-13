import type { Prisma } from '@prisma/client/index';
import prisma from '../config/db';

/**
 * Clash detection for anything that writes time.
 *
 * Before this module the only overlap check lived inline in the correction path and
 * considered `status: 'approved'` entries only, which left three holes:
 *   - `manualEntry`, `updateEntry` and `duplicateEntry` were entirely unguarded, and
 *     the Workday "recovered suggestions" copilot posts through `manualEntry`;
 *   - a pending entry could be double-booked because only approved ones were seen;
 *   - two overlapping PENDING correction requests could both be created, and both
 *     approved, because corrections were never compared against each other.
 *
 * Enforced in the application layer rather than with a Postgres EXCLUDE constraint:
 * production already contains overlapping rows written by the unguarded paths, so
 * building such an index would fail, and the rule spans two tables.
 */

/** Half-open intersection: touching boundaries (09:00–10:00 and 10:00–11:00) do NOT clash. */
const intersects = (start: Date, end: Date) => ({
    start_time: { lt: end },
    end_time: { gt: start },
});

export type OverlapKind = 'entry' | 'correction';

export type OverlapHit = {
    id: string;
    kind: OverlapKind;
    start: Date;
    end: Date;
    label: string;
    status: string;
};

export type FindOverlapsOptions = {
    client?: typeof prisma | Prisma.TransactionClient;
    organizationId: string;
    userId: string;
    start: Date;
    end: Date;
    excludeEntryId?: string;
    excludeCorrectionId?: string;
    /**
     * Skip the correction-request side of the check. Used when approving a
     * correction, where the request being approved is the only one that matters and
     * other pending requests are not yet real time.
     */
    includeCorrections?: boolean;
};

export const findOverlaps = async (options: FindOverlapsOptions): Promise<OverlapHit[]> => {
    const {
        client = prisma, organizationId, userId, start, end,
        excludeEntryId, excludeCorrectionId, includeCorrections = true,
    } = options;

    const range = intersects(start, end);

    const [entries, corrections] = await Promise.all([
        client.timeEntry.findMany({
            where: {
                organization_id: organizationId,
                user_id: userId,
                // Rejected entries are not real time and must not block a resubmission.
                status: { in: ['pending', 'approved'] },
                ...range,
                ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
            },
            select: { id: true, start_time: true, end_time: true, task_description: true, status: true },
            orderBy: { start_time: 'asc' },
            take: 10,
        }),
        includeCorrections
            ? client.timerCorrectionRequest.findMany({
                where: {
                    organization_id: organizationId,
                    user_id: userId,
                    status: 'PENDING',
                    requested_start_time: { lt: end },
                    requested_end_time: { gt: start },
                    ...(excludeCorrectionId ? { id: { not: excludeCorrectionId } } : {}),
                },
                select: {
                    id: true, requested_start_time: true, requested_end_time: true,
                    reason: true, status: true,
                },
                orderBy: { requested_start_time: 'asc' },
                take: 10,
            })
            : Promise.resolve([]),
    ]);

    return [
        ...entries.map((entry): OverlapHit => ({
            id: entry.id,
            kind: 'entry',
            start: entry.start_time,
            end: entry.end_time,
            label: entry.task_description,
            status: entry.status,
        })),
        ...corrections.map((correction): OverlapHit => ({
            id: correction.id,
            kind: 'correction',
            start: correction.requested_start_time,
            end: correction.requested_end_time,
            label: correction.reason,
            status: correction.status,
        })),
    ].sort((a, b) => a.start.getTime() - b.start.getTime());
};

/**
 * Thrown from inside a transaction (where a `res.status(...)` is not available) so
 * the controller can map it to a 409 without sniffing an error message string.
 */
export class TimeOverlapError extends Error {
    readonly conflicts: OverlapHit[];

    constructor(conflicts: OverlapHit[]) {
        super('Requested time overlaps an existing entry.');
        this.name = 'TimeOverlapError';
        this.conflicts = conflicts;
    }
}

/** Response body for a 409, shared by every write path. */
export const overlapConflictBody = (conflicts: OverlapHit[]) => ({
    code: 'TIME_OVERLAP' as const,
    message: conflicts.some((c) => c.kind === 'correction')
        ? 'This time clashes with another request or entry already on your timeline.'
        : 'This time clashes with an entry already on your timeline.',
    conflicts: conflicts.map((conflict) => ({
        id: conflict.id,
        kind: conflict.kind,
        start: conflict.start.toISOString(),
        end: conflict.end.toISOString(),
        label: conflict.label,
        status: conflict.status,
    })),
});
