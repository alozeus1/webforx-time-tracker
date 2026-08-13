import {
    DEFAULT_REPORTING_TIMEZONE,
    getZonedParts,
    isValidTimeZone,
    toLocalDateString,
    zonedTimeToUtc,
} from '../utils/reportWindow';

/**
 * Day and week windows expressed in an individual user's timezone.
 *
 * The app previously had four disagreeing definitions of "a day": DST-correct
 * windows for scheduled reports, server-local (i.e. UTC on Vercel) for the daily
 * breakdown and the weekly-overtime check, and browser-local on the frontend. The
 * daily cap and the weekly recovery quota are user-facing limits, so they must use
 * the user's own day — otherwise someone in America/Chicago sees their cap reset at
 * 19:00. This module is the single source of that boundary; it delegates every piece
 * of timezone arithmetic to `utils/reportWindow`, which already handles DST.
 */

export type TimeWindow = {
    /** Inclusive lower bound, as a UTC instant. */
    start: Date;
    /** Exclusive upper bound, as a UTC instant. Use `gte: start, lt: endExclusive`. */
    endExclusive: Date;
    /** Local calendar date of `start` ("YYYY-MM-DD"). */
    localDate: string;
};

export type TimezoneCarrier = { timezone?: string | null };

/**
 * Resolve the timezone to use for a user. Unknown or invalid values fall back to
 * UTC rather than throwing: a bad stored value must never be able to stop someone
 * from tracking time.
 */
export const resolveUserTimezone = (user: TimezoneCarrier | null | undefined): string => {
    const candidate = typeof user?.timezone === 'string' ? user.timezone.trim() : '';
    return isValidTimeZone(candidate) ? candidate : DEFAULT_REPORTING_TIMEZONE;
};

/** Midnight-to-midnight in `timeZone`, containing the instant `at`. */
export const getUserDayWindow = (timeZone: string, at: Date = new Date()): TimeWindow => {
    const parts = getZonedParts(at, timeZone);
    const start = zonedTimeToUtc(parts.year, parts.month, parts.day, 0, 0, 0, 0, timeZone);
    // Solve the next day's midnight from the civil date rather than adding 24h, so
    // DST transition days are 23 or 25 hours long as they should be.
    const nextCivil = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
    const endExclusive = zonedTimeToUtc(
        nextCivil.getUTCFullYear(),
        nextCivil.getUTCMonth() + 1,
        nextCivil.getUTCDate(),
        0, 0, 0, 0,
        timeZone,
    );

    return { start, endExclusive, localDate: toLocalDateString(start, timeZone) };
};

/**
 * Monday 00:00 to the following Monday 00:00 in `timeZone`, containing `at`.
 * Monday-based to match `startOfWeek` on the frontend timesheet and the
 * Monday-to-Sunday convention already used by scheduled report windows.
 */
export const getUserWeekWindow = (timeZone: string, at: Date = new Date()): TimeWindow => {
    const parts = getZonedParts(at, timeZone);
    // weekday: 0 = Sunday .. 6 = Saturday. Sunday belongs to the week that began six
    // days earlier, not to the one starting tomorrow.
    const daysSinceMonday = (parts.weekday + 6) % 7;

    const mondayCivil = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - daysSinceMonday));
    const nextMondayCivil = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - daysSinceMonday + 7));

    const start = zonedTimeToUtc(
        mondayCivil.getUTCFullYear(), mondayCivil.getUTCMonth() + 1, mondayCivil.getUTCDate(),
        0, 0, 0, 0, timeZone,
    );
    const endExclusive = zonedTimeToUtc(
        nextMondayCivil.getUTCFullYear(), nextMondayCivil.getUTCMonth() + 1, nextMondayCivil.getUTCDate(),
        0, 0, 0, 0, timeZone,
    );

    return { start, endExclusive, localDate: toLocalDateString(start, timeZone) };
};
