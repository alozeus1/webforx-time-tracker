jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        timeEntry: { findMany: jest.fn() },
        timerCorrectionRequest: { findMany: jest.fn() },
    },
}));

import prisma from '../src/config/db';
import { findOverlaps, overlapConflictBody, TimeOverlapError } from '../src/services/timeOverlapService';

const base = { organizationId: 'org-1', userId: 'user-1' };
const start = new Date('2026-08-12T09:00:00.000Z');
const end = new Date('2026-08-12T11:00:00.000Z');

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.timerCorrectionRequest.findMany as jest.Mock).mockResolvedValue([]);
});

describe('findOverlaps query shape', () => {
    it('uses a half-open predicate so touching blocks do not clash', async () => {
        await findOverlaps({ ...base, start, end });

        expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                start_time: { lt: end },
                end_time: { gt: start },
            }),
        }));
    });

    // The original inline check only looked at approved entries, so a pending entry
    // could be double-booked.
    it('considers pending as well as approved entries, and ignores rejected ones', async () => {
        await findOverlaps({ ...base, start, end });

        const where = (prisma.timeEntry.findMany as jest.Mock).mock.calls[0][0].where;
        expect(where.status).toEqual({ in: ['pending', 'approved'] });
    });

    it('also checks other pending correction requests', async () => {
        await findOverlaps({ ...base, start, end });

        expect(prisma.timerCorrectionRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                status: 'PENDING',
                requested_start_time: { lt: end },
                requested_end_time: { gt: start },
            }),
        }));
    });

    it('can skip the correction side, as the approval path needs', async () => {
        await findOverlaps({ ...base, start, end, includeCorrections: false });

        expect(prisma.timerCorrectionRequest.findMany).not.toHaveBeenCalled();
    });

    it('excludes the row being edited so an entry never clashes with itself', async () => {
        await findOverlaps({ ...base, start, end, excludeEntryId: 'entry-1', excludeCorrectionId: 'corr-1' });

        expect((prisma.timeEntry.findMany as jest.Mock).mock.calls[0][0].where.id).toEqual({ not: 'entry-1' });
        expect((prisma.timerCorrectionRequest.findMany as jest.Mock).mock.calls[0][0].where.id).toEqual({ not: 'corr-1' });
    });

    it('scopes to the caller organization and user', async () => {
        await findOverlaps({ ...base, start, end });

        const where = (prisma.timeEntry.findMany as jest.Mock).mock.calls[0][0].where;
        expect(where.organization_id).toBe('org-1');
        expect(where.user_id).toBe('user-1');
    });
});

describe('findOverlaps results', () => {
    it('merges both sources and orders them by start time', async () => {
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([{
            id: 'entry-1',
            start_time: new Date('2026-08-12T10:00:00.000Z'),
            end_time: new Date('2026-08-12T12:00:00.000Z'),
            task_description: 'Ticket 1885',
            status: 'approved',
        }]);
        (prisma.timerCorrectionRequest.findMany as jest.Mock).mockResolvedValue([{
            id: 'corr-1',
            requested_start_time: new Date('2026-08-12T08:00:00.000Z'),
            requested_end_time: new Date('2026-08-12T09:30:00.000Z'),
            reason: 'Timer was paused',
            status: 'PENDING',
        }]);

        const conflicts = await findOverlaps({ ...base, start, end });

        expect(conflicts.map((c) => c.id)).toEqual(['corr-1', 'entry-1']);
        expect(conflicts[0]).toMatchObject({ kind: 'correction', label: 'Timer was paused' });
        expect(conflicts[1]).toMatchObject({ kind: 'entry', label: 'Ticket 1885' });
    });

    it('returns an empty array when the slot is free', async () => {
        expect(await findOverlaps({ ...base, start, end })).toEqual([]);
    });
});

describe('overlapConflictBody', () => {
    const entryHit = {
        id: 'entry-1', kind: 'entry' as const, start, end, label: 'Ticket 1885', status: 'approved',
    };

    it('carries a machine-readable code rather than a sniffable message', () => {
        const body = overlapConflictBody([entryHit]);

        expect(body.code).toBe('TIME_OVERLAP');
        expect(body.conflicts[0]).toEqual({
            id: 'entry-1',
            kind: 'entry',
            start: start.toISOString(),
            end: end.toISOString(),
            label: 'Ticket 1885',
            status: 'approved',
        });
    });

    it('mentions requests when a pending correction is involved', () => {
        const body = overlapConflictBody([
            { ...entryHit, id: 'corr-1', kind: 'correction', label: 'Missed time', status: 'PENDING' },
        ]);

        expect(body.message).toMatch(/request/i);
    });
});

describe('TimeOverlapError', () => {
    it('carries the conflicts so a transaction can rethrow without stringly-typed parsing', () => {
        const error = new TimeOverlapError([{
            id: 'entry-1', kind: 'entry', start, end, label: 'x', status: 'approved',
        }]);

        expect(error).toBeInstanceOf(Error);
        expect(error.conflicts).toHaveLength(1);
    });
});
