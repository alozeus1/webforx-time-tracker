/**
 * Pre-generation validation gates for scheduled reports.
 *
 * These gates exist because a scheduled report is a compliance artefact: it drives
 * warning ladders and termination decisions. Silently emitting a report built on an
 * incomplete window is worse than emitting nothing, so generation halts loudly and
 * alerts an administrator rather than shipping data that looks authoritative but
 * is not.
 *
 * Gate 1 — Zero entry check
 *   Every required day in the export window must have at least one time entry
 *   across the organisation. Days are bucketed by the *reporting timezone's*
 *   calendar date, not UTC, so a window boundary never splits a working day.
 *
 * Gate 2 — Window integrity check
 *   The window must span exactly 7 calendar days and close on a Sunday.
 */

import prisma from '../config/db';
import {
    DAY_NAMES,
    ReportWindow,
    SUNDAY,
    getWindowDaySpan,
    getZonedParts,
    toLocalDateString,
} from '../utils/reportWindow';

export const ALL_WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export const WEEKDAYS_ONLY = [1, 2, 3, 4, 5] as const;

export type ValidationGateName = 'zero_entries' | 'window_integrity';

export type ValidationGateResult = {
    gate: ValidationGateName;
    passed: boolean;
    /** Populated only when `passed` is false. */
    message?: string;
    /** Structured context for logs and alert emails. */
    details: Record<string, unknown>;
};

export type ValidationOutcome = {
    passed: boolean;
    results: ValidationGateResult[];
    /** Messages for every failed gate, in evaluation order. */
    failures: string[];
};

export type ValidationGateConfig = {
    enabled: boolean;
    zeroEntries: boolean;
    windowIntegrity: boolean;
    /**
     * Weekday indices (0 = Sunday .. 6 = Saturday) that must contain at least one
     * entry. Defaults to all seven days — the strict reading of the requirement.
     * Organisations that legitimately do not log at weekends can narrow this
     * instead of switching the gate off entirely and losing the check on weekdays.
     */
    requiredDays: number[];
};

export const DEFAULT_VALIDATION_GATE_CONFIG: ValidationGateConfig = {
    enabled: true,
    zeroEntries: true,
    windowIntegrity: true,
    requiredDays: [...ALL_WEEK_DAYS],
};

export const normalizeRequiredDays = (value: unknown): number[] => {
    if (!Array.isArray(value)) return [...ALL_WEEK_DAYS];

    const days = Array.from(
        new Set(
            value
                .map((entry) => Number(entry))
                .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6),
        ),
    ).sort((a, b) => a - b);

    return days.length > 0 ? days : [...ALL_WEEK_DAYS];
};

/**
 * Counts time entries per local calendar date across the whole organisation.
 *
 * Only `start_time` is selected: bucketing happens in the reporting timezone, which
 * the database cannot do without a timezone-aware expression, and pulling one column
 * keeps the payload small even for a busy week.
 */
export const countEntriesPerLocalDay = async (
    window: ReportWindow,
    organizationId?: string,
): Promise<Map<string, number>> => {
    const entries = await prisma.timeEntry.findMany({
        where: {
            start_time: { gte: window.start, lt: window.endExclusive },
            ...(organizationId ? { organization_id: organizationId } : {}),
        },
        select: { start_time: true },
    });

    const counts = new Map<string, number>();
    for (const localDate of window.localDates) counts.set(localDate, 0);

    for (const entry of entries) {
        const localDate = toLocalDateString(new Date(entry.start_time), window.timeZone);
        counts.set(localDate, (counts.get(localDate) ?? 0) + 1);
    }

    return counts;
};

/** Gate 1 — halt if any required day in the window has zero org-wide entries. */
export const runZeroEntryGate = async (
    window: ReportWindow,
    requiredDays: number[],
    organizationId?: string,
): Promise<ValidationGateResult> => {
    const counts = await countEntriesPerLocalDay(window, organizationId);
    const required = new Set(requiredDays);

    const perDay = window.localDates.map((localDate, index) => {
        const weekday = getZonedParts(
            new Date(window.start.getTime() + index * 24 * 60 * 60 * 1000),
            window.timeZone,
        ).weekday;
        return {
            date: localDate,
            weekday,
            weekdayName: DAY_NAMES[weekday],
            entryCount: counts.get(localDate) ?? 0,
            required: required.has(weekday),
        };
    });

    const emptyRequiredDays = perDay.filter((day) => day.required && day.entryCount === 0);

    const details: Record<string, unknown> = {
        window: window.label,
        timeZone: window.timeZone,
        requiredDays: requiredDays.map((day) => DAY_NAMES[day]),
        entryCountsByDay: perDay.reduce<Record<string, number>>((acc, day) => {
            acc[day.date] = day.entryCount;
            return acc;
        }, {}),
        totalEntries: perDay.reduce((sum, day) => sum + day.entryCount, 0),
    };

    if (emptyRequiredDays.length === 0) {
        return { gate: 'zero_entries', passed: true, details };
    }

    // Message format is fixed by spec — one line per offending date.
    const message = emptyRequiredDays
        .map((day) => `Report generation failed: ${day.date} contains zero entries across the organization. Cannot proceed.`)
        .join(' ');

    return {
        gate: 'zero_entries',
        passed: false,
        message,
        details: { ...details, emptyDays: emptyRequiredDays.map((day) => day.date) },
    };
};

/** Gate 2 — halt unless the window spans exactly 7 days and ends on a Sunday. */
export const runWindowIntegrityGate = (window: ReportWindow): ValidationGateResult => {
    const daySpan = getWindowDaySpan(window);
    const endWeekday = getZonedParts(window.end, window.timeZone).weekday;
    const startWeekday = getZonedParts(window.start, window.timeZone).weekday;

    const details: Record<string, unknown> = {
        window: window.label,
        timeZone: window.timeZone,
        daySpan,
        startLocalDate: window.startLocalDate,
        startWeekday: DAY_NAMES[startWeekday],
        endLocalDate: window.endLocalDate,
        endWeekday: DAY_NAMES[endWeekday],
        startUtc: window.start.toISOString(),
        endUtc: window.end.toISOString(),
    };

    const problems: string[] = [];
    if (daySpan !== 7) problems.push(`${daySpan} days`);
    if (endWeekday !== SUNDAY) problems.push(`window ends on ${DAY_NAMES[endWeekday]} (${window.endLocalDate})`);

    if (problems.length === 0) {
        return { gate: 'window_integrity', passed: true, details };
    }

    return {
        gate: 'window_integrity',
        passed: false,
        message: `Report generation failed: Export window integrity check failed. Expected 7 days ending Sunday, got ${problems.join(', ')}.`,
        details,
    };
};

/**
 * Runs every enabled gate and logs each outcome.
 *
 * Both gates always run when enabled — the first failure does not short-circuit the
 * second, because an operator debugging a blocked report wants the complete picture
 * in one pass rather than fixing one problem only to hit the next next week.
 */
export const runValidationGates = async ({
    window,
    config,
    organizationId,
    reportId,
}: {
    window: ReportWindow;
    config: ValidationGateConfig;
    organizationId?: string;
    reportId?: string;
}): Promise<ValidationOutcome> => {
    const label = reportId ? `report ${reportId}` : 'daily report';

    if (!config.enabled) {
        console.warn(`[ReportValidation] Gates DISABLED for ${label} (window ${window.label}). Proceeding without checks.`);
        return { passed: true, results: [], failures: [] };
    }

    const results: ValidationGateResult[] = [];

    if (config.windowIntegrity) results.push(runWindowIntegrityGate(window));
    if (config.zeroEntries) results.push(await runZeroEntryGate(window, config.requiredDays, organizationId));

    for (const result of results) {
        const payload = JSON.stringify(result.details);
        if (result.passed) {
            console.log(`[ReportValidation] PASS ${result.gate} for ${label} — ${payload}`);
        } else {
            console.error(`[ReportValidation] FAIL ${result.gate} for ${label} — ${result.message} | ${payload}`);
        }
    }

    const failures = results.filter((result) => !result.passed).map((result) => result.message!);
    return { passed: failures.length === 0, results, failures };
};

export class ValidationGateError extends Error {
    constructor(
        message: string,
        public readonly outcome: ValidationOutcome,
        public readonly window: ReportWindow,
    ) {
        super(message);
        this.name = 'ValidationGateError';
    }
}
