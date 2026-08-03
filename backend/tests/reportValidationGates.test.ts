jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        timeEntry: { findMany: jest.fn() },
    },
}));

import prisma from '../src/config/db';
import { getPreviousCompleteWeek, ReportWindow } from '../src/utils/reportWindow';
import {
    ALL_WEEK_DAYS,
    WEEKDAYS_ONLY,
    normalizeRequiredDays,
    runValidationGates,
    runWindowIntegrityGate,
    runZeroEntryGate,
} from '../src/services/reportValidationService';

const GENERATION_INSTANT = new Date('2026-08-03T11:00:00.000Z'); // Mon 06:00 America/Chicago
const ZONE = 'America/Chicago';

const window = (): ReportWindow => getPreviousCompleteWeek(GENERATION_INSTANT, ZONE);

/** Build one entry at local noon on each supplied local date. */
const entriesForDates = (dates: string[]) =>
    dates.map((date) => ({ start_time: new Date(`${date}T17:00:00.000Z`) })); // 12:00 CDT

beforeEach(() => {
    jest.clearAllMocks();
});

describe('Gate 1 — zero entry check', () => {
    it('passes when every day in the window has at least one entry', async () => {
        const w = window();
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(entriesForDates(w.localDates));

        const result = await runZeroEntryGate(w, [...ALL_WEEK_DAYS], 'org-1');

        expect(result.passed).toBe(true);
        expect(result.details.totalEntries).toBe(7);
    });

    it('fails with the exact specified message when a day is empty', async () => {
        const w = window();
        const withoutMonday = w.localDates.filter((date) => date !== '2026-07-27');
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(entriesForDates(withoutMonday));

        const result = await runZeroEntryGate(w, [...ALL_WEEK_DAYS], 'org-1');

        expect(result.passed).toBe(false);
        expect(result.message).toBe(
            'Report generation failed: 2026-07-27 contains zero entries across the organization. Cannot proceed.',
        );
        expect(result.details.emptyDays).toEqual(['2026-07-27']);
    });

    it('reports every empty day, not just the first', async () => {
        const w = window();
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(
            entriesForDates(w.localDates.filter((d) => !['2026-08-01', '2026-08-02'].includes(d))),
        );

        const result = await runZeroEntryGate(w, [...ALL_WEEK_DAYS], 'org-1');

        expect(result.passed).toBe(false);
        expect(result.details.emptyDays).toEqual(['2026-08-01', '2026-08-02']);
        expect(result.message).toContain('2026-08-01');
        expect(result.message).toContain('2026-08-02');
    });

    it('detects an empty day on every day of the week', async () => {
        const w = window();
        for (const missing of w.localDates) {
            (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(
                entriesForDates(w.localDates.filter((date) => date !== missing)),
            );
            const result = await runZeroEntryGate(w, [...ALL_WEEK_DAYS], 'org-1');
            expect(result.passed).toBe(false);
            expect(result.details.emptyDays).toEqual([missing]);
        }
    });

    it('ignores days that are not in the required set', async () => {
        const w = window();
        // Saturday 2026-08-01 and Sunday 2026-08-02 are empty, but only weekdays are required.
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(
            entriesForDates(w.localDates.filter((d) => !['2026-08-01', '2026-08-02'].includes(d))),
        );

        const result = await runZeroEntryGate(w, [...WEEKDAYS_ONLY], 'org-1');

        expect(result.passed).toBe(true);
    });

    it('buckets entries by the reporting timezone, not UTC', async () => {
        const w = window();
        // 2026-07-28T02:00Z is still Monday 2026-07-27 21:00 in America/Chicago.
        // Bucketing in UTC would credit Tuesday and leave Monday empty.
        const entries = [
            { start_time: new Date('2026-07-28T02:00:00.000Z') },
            ...entriesForDates(w.localDates.filter((d) => d !== '2026-07-27')),
        ];
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(entries);

        const result = await runZeroEntryGate(w, [...ALL_WEEK_DAYS], 'org-1');

        expect(result.passed).toBe(true);
        expect((result.details.entryCountsByDay as Record<string, number>)['2026-07-27']).toBe(1);
    });

    it('queries the window with a half-open range scoped to the organization', async () => {
        const w = window();
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(entriesForDates(w.localDates));

        await runZeroEntryGate(w, [...ALL_WEEK_DAYS], 'org-42');

        expect(prisma.timeEntry.findMany).toHaveBeenCalledWith({
            where: {
                start_time: { gte: w.start, lt: w.endExclusive },
                organization_id: 'org-42',
            },
            select: { start_time: true },
        });
    });
});

describe('Gate 2 — window integrity check', () => {
    it('passes for a genuine 7-day window ending Sunday', () => {
        const result = runWindowIntegrityGate(window());
        expect(result.passed).toBe(true);
        expect(result.details.daySpan).toBe(7);
        expect(result.details.endWeekday).toBe('Sunday');
    });

    it('fails with the specified message when the window is not 7 days', () => {
        const w = window();
        const broken: ReportWindow = { ...w, localDates: w.localDates.slice(0, 6) };

        const result = runWindowIntegrityGate(broken);

        expect(result.passed).toBe(false);
        expect(result.message).toBe(
            'Report generation failed: Export window integrity check failed. Expected 7 days ending Sunday, got 6 days.',
        );
    });

    it('fails when the window does not end on a Sunday', () => {
        const w = window();
        // Shift the close to Monday — exactly the shape of the original defect.
        const broken: ReportWindow = {
            ...w,
            end: new Date(w.end.getTime() + 24 * 60 * 60 * 1000),
            endLocalDate: '2026-08-03',
        };

        const result = runWindowIntegrityGate(broken);

        expect(result.passed).toBe(false);
        expect(result.message).toContain('Expected 7 days ending Sunday');
        expect(result.message).toContain('window ends on Monday');
    });

    it('reports both problems together when the window is wrong in two ways', () => {
        const w = window();
        const broken: ReportWindow = {
            ...w,
            localDates: w.localDates.slice(0, 5),
            end: new Date(w.end.getTime() + 24 * 60 * 60 * 1000),
            endLocalDate: '2026-08-03',
        };

        const result = runWindowIntegrityGate(broken);

        expect(result.message).toBe(
            'Report generation failed: Export window integrity check failed. Expected 7 days ending Sunday, got 5 days, window ends on Monday (2026-08-03).',
        );
    });
});

describe('runValidationGates', () => {
    it('runs both gates and passes when the data is complete', async () => {
        const w = window();
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(entriesForDates(w.localDates));

        const outcome = await runValidationGates({
            window: w,
            config: { enabled: true, zeroEntries: true, windowIntegrity: true, requiredDays: [...ALL_WEEK_DAYS] },
            organizationId: 'org-1',
            reportId: 'report-1',
        });

        expect(outcome.passed).toBe(true);
        expect(outcome.results.map((r) => r.gate)).toEqual(['window_integrity', 'zero_entries']);
    });

    it('does not short-circuit — a failing first gate still allows the second to report', async () => {
        const w = window();
        const broken: ReportWindow = { ...w, localDates: w.localDates.slice(0, 6) };
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);

        const outcome = await runValidationGates({
            window: broken,
            config: { enabled: true, zeroEntries: true, windowIntegrity: true, requiredDays: [...ALL_WEEK_DAYS] },
            organizationId: 'org-1',
        });

        expect(outcome.passed).toBe(false);
        expect(outcome.failures).toHaveLength(2);
    });

    it('skips all checks when gates are disabled', async () => {
        const outcome = await runValidationGates({
            window: window(),
            config: { enabled: false, zeroEntries: true, windowIntegrity: true, requiredDays: [...ALL_WEEK_DAYS] },
            organizationId: 'org-1',
        });

        expect(outcome.passed).toBe(true);
        expect(outcome.results).toHaveLength(0);
        expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
    });

    it('honours individually disabled gates', async () => {
        const w = window();
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);

        const outcome = await runValidationGates({
            window: w,
            config: { enabled: true, zeroEntries: false, windowIntegrity: true, requiredDays: [...ALL_WEEK_DAYS] },
            organizationId: 'org-1',
        });

        expect(outcome.passed).toBe(true);
        expect(outcome.results.map((r) => r.gate)).toEqual(['window_integrity']);
        expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
    });
});

describe('normalizeRequiredDays', () => {
    it('defaults to all seven days for missing or unusable input', () => {
        expect(normalizeRequiredDays(undefined)).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(normalizeRequiredDays('nonsense')).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(normalizeRequiredDays([])).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(normalizeRequiredDays([99, -3])).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('sorts, de-duplicates and drops out-of-range values', () => {
        expect(normalizeRequiredDays([5, 1, 1, 3, 9])).toEqual([1, 3, 5]);
    });
});
