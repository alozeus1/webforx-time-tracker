/**
 * Timezone-aware report window utilities.
 *
 * Background — the defect this module exists to prevent
 * ------------------------------------------------------
 * The previous weekly window was built as:
 *
 *     const end   = startOfDay(addDays(now, 1));   // tomorrow 00:00, SERVER local time
 *     const start = addDays(end, -7);
 *
 * That produced a window of `[now-6d 00:00, now+1d 00:00)` in whatever timezone the
 * server happened to run in (UTC on Vercel). Running the cron on a Monday therefore
 * generated a Tuesday->Monday window, and because generation happened at the *start*
 * of the closing day, that final day contributed almost no data. Net effect: every
 * weekly report silently captured six days and dropped a Monday.
 *
 * This module replaces that with an explicit, timezone-correct
 * "previous complete week" — Monday 00:00:00.000 through Sunday 23:59:59.999 in the
 * organisation's reporting timezone — and never includes the day the report runs on.
 *
 * No new runtime dependency: all timezone maths uses the platform `Intl` API.
 */

export const DEFAULT_REPORTING_TIMEZONE = 'UTC';

/** Canonical export window boundaries. Currently fixed, but stored per report so the
 *  values are explicit in the data model and can be relaxed later without a migration. */
export const EXPORT_WINDOW_START = 'monday 00:00:00';
export const EXPORT_WINDOW_END = 'sunday 23:59:59';

/** Default generation time, in the reporting timezone (24-hour "HH:mm"). */
export const DEFAULT_GENERATION_TIME = '06:00';

/** Day index used throughout: 0 = Sunday .. 6 = Saturday (matches Date#getDay). */
export const SUNDAY = 0;
export const MONDAY = 1;

export const DAY_NAMES = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;

export type ZonedParts = {
    year: number;
    month: number; // 1-12
    day: number; // 1-31
    hour: number; // 0-23
    minute: number;
    second: number;
    /** 0 = Sunday .. 6 = Saturday */
    weekday: number;
};

export type ReportWindow = {
    /** Inclusive lower bound: Monday 00:00:00.000 local, expressed as a UTC instant. */
    start: Date;
    /**
     * Exclusive upper bound: the following Monday 00:00:00.000 local, as a UTC instant.
     * Use this for database range queries (`gte: start, lt: endExclusive`) — it avoids
     * the classic sub-millisecond boundary gap of a `<= 23:59:59.999` comparison.
     */
    endExclusive: Date;
    /** Inclusive upper bound: Sunday 23:59:59.999 local, as a UTC instant. Display/validation. */
    end: Date;
    /** Local calendar date of the window start, "YYYY-MM-DD". */
    startLocalDate: string;
    /** Local calendar date of the window end, "YYYY-MM-DD". */
    endLocalDate: string;
    /** Every local calendar date in the window, ascending, "YYYY-MM-DD". Always 7 entries. */
    localDates: string[];
    /** IANA timezone the window was computed in. */
    timeZone: string;
    /** Human label, e.g. "2026-07-27 to 2026-08-02". */
    label: string;
};

export class InvalidTimeZoneError extends Error {
    constructor(public readonly timeZone: string) {
        super(`Invalid IANA timezone: "${timeZone}"`);
        this.name = 'InvalidTimeZoneError';
    }
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * `hourCycle: 'h23'` matters: with `hour12: false` some ICU builds emit "24" for
 * midnight, which silently corrupts every calculation downstream.
 */
const getFormatter = (timeZone: string): Intl.DateTimeFormat => {
    const cached = formatterCache.get(timeZone);
    if (cached) return cached;

    let formatter: Intl.DateTimeFormat;
    try {
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            weekday: 'short',
        });
    } catch {
        throw new InvalidTimeZoneError(timeZone);
    }

    formatterCache.set(timeZone, formatter);
    return formatter;
};

/**
 * Returns true only for an `Area/Location` IANA zone that this runtime can resolve,
 * or `UTC`.
 *
 * Two things are deliberately rejected that a bare `try { new Intl.DateTimeFormat }`
 * would let through.
 *
 * 1. Legacy abbreviations. ICU resolves them, to places that actively mislead:
 *
 *        EST -> America/Panama    (does NOT observe DST)
 *        MST -> America/Phoenix   (does NOT observe DST)
 *        CST -> America/Chicago
 *
 *    Someone entering `EST` almost certainly means US Eastern. They would instead get
 *    a fixed -05:00 zone, so every window boundary and generation time would be an
 *    hour out for roughly half the year — silently, and only in summer. That is
 *    exactly the one-hour-shift defect this module exists to prevent. Requiring an
 *    `Area/Location` slash rejects these, along with deprecated single-word aliases
 *    like `Japan` and `Singapore`, and steers the caller to `America/New_York`.
 *
 * 2. The `Etc/*` family. `Etc/GMT+5` means UTC**-**5 — the sign is inverted by the
 *    POSIX convention. These are fixed-offset and never observe DST, so they carry
 *    the same hazard as the abbreviations with an extra trap on top.
 *
 * Validation is by *shape plus resolvability*, deliberately NOT an allowlist built
 * from `Intl.supportedValuesOf('timeZone')`. That list is ICU-version-dependent: this
 * runtime's copy contains `Asia/Calcutta`, `Asia/Katmandu` and `Europe/Kiev` but not
 * the modern preferred spellings `Asia/Kolkata`, `Asia/Kathmandu` or `Europe/Kyiv`,
 * and omits `America/Argentina/Buenos_Aires` entirely. Since the frontend populates
 * its dropdown from the *browser's* list, an allowlist here would reject values the
 * UI had just offered, and the exact set would drift with each Node upgrade.
 * Resolvability is stable across versions; both spellings resolve fine.
 *
 * `UTC` is allowed explicitly: it is the documented default, unambiguous, and has no
 * slash.
 */
export const isValidTimeZone = (timeZone: unknown): timeZone is string => {
    if (typeof timeZone !== 'string') return false;
    const trimmed = timeZone.trim();
    if (!trimmed) return false;
    if (trimmed === DEFAULT_REPORTING_TIMEZONE) return true;

    if (!trimmed.includes('/')) return false;
    if (trimmed.startsWith('Etc/')) return false;

    try {
        getFormatter(trimmed);
        return true;
    } catch {
        return false;
    }
};

export const assertValidTimeZone = (timeZone: string): string => {
    const trimmed = typeof timeZone === 'string' ? timeZone.trim() : '';
    if (!isValidTimeZone(trimmed)) throw new InvalidTimeZoneError(String(timeZone));
    return trimmed;
};

const WEEKDAY_INDEX: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Decompose a UTC instant into wall-clock parts in the given timezone. */
export const getZonedParts = (instant: Date, timeZone: string): ZonedParts => {
    const parts = getFormatter(timeZone).formatToParts(instant);
    const lookup: Record<string, string> = {};
    for (const part of parts) {
        if (part.type !== 'literal') lookup[part.type] = part.value;
    }

    return {
        year: Number(lookup.year),
        month: Number(lookup.month),
        day: Number(lookup.day),
        hour: Number(lookup.hour),
        minute: Number(lookup.minute),
        second: Number(lookup.second),
        weekday: WEEKDAY_INDEX[lookup.weekday] ?? 0,
    };
};

/**
 * Offset of `timeZone` from UTC at a given instant, in milliseconds.
 * Positive east of Greenwich. Derived by formatting the instant as local wall time
 * and re-reading those digits as if they were UTC.
 */
const getOffsetMs = (instant: Date, timeZone: string): number => {
    const p = getZonedParts(instant, timeZone);
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, instant.getUTCMilliseconds());
    return asIfUtc - instant.getTime();
};

/**
 * Convert a wall-clock time in `timeZone` to the corresponding UTC instant.
 *
 * DST handling: the offset depends on the instant we are solving for, so we
 * iterate. One refinement pass converges everywhere on Earth; a second guards the
 * pathological case of a zone whose offset changes within the candidate window.
 *
 * Spring-forward gap (e.g. 02:30 on a US spring-forward Sunday does not exist):
 * the result lands on the instant the clock jumps to, which is the conventional and
 * safest behaviour for a scheduler — the job runs, it does not silently vanish.
 * Fall-back overlap resolves to the first (earlier) occurrence, so a job never
 * runs twice.
 */
export const zonedTimeToUtc = (
    year: number,
    month: number, // 1-12
    day: number,
    hour: number,
    minute: number,
    second: number,
    millisecond: number,
    timeZone: string,
): Date => {
    assertValidTimeZone(timeZone);
    const naive = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

    let timestamp = naive - getOffsetMs(new Date(naive), timeZone);
    timestamp = naive - getOffsetMs(new Date(timestamp), timeZone);
    timestamp = naive - getOffsetMs(new Date(timestamp), timeZone);

    return new Date(timestamp);
};

const pad = (value: number, size = 2): string => String(value).padStart(size, '0');

export const formatLocalDate = (parts: Pick<ZonedParts, 'year' | 'month' | 'day'>): string =>
    `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;

/** Local calendar date ("YYYY-MM-DD") of a UTC instant in the given timezone. */
export const toLocalDateString = (instant: Date, timeZone: string): string =>
    formatLocalDate(getZonedParts(instant, timeZone));

/** Add whole days to a civil (calendar) date without any timezone involvement. */
const addCivilDays = (year: number, month: number, day: number, days: number) => {
    const shifted = new Date(Date.UTC(year, month - 1, day + days));
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
    };
};

/**
 * The most recent *complete* week relative to `now`, in `timeZone`.
 *
 * "Complete" means the week that has already finished: if `now` is Monday
 * 2026-08-03 06:00 America/Chicago, the window is Monday 2026-07-27 00:00:00.000
 * through Sunday 2026-08-02 23:59:59.999 — the week just ended. The day the report
 * runs on is never inside its own window, which is what previously caused a whole
 * working day to be dropped.
 */
export const getPreviousCompleteWeek = (now: Date, timeZone: string): ReportWindow => {
    const zone = assertValidTimeZone(timeZone);
    const nowParts = getZonedParts(now, zone);

    // Days elapsed since the Monday of the current local week (Mon=0 ... Sun=6).
    const daysSinceMonday = (nowParts.weekday + 6) % 7;

    const currentWeekMonday = addCivilDays(nowParts.year, nowParts.month, nowParts.day, -daysSinceMonday);
    const previousWeekMonday = addCivilDays(
        currentWeekMonday.year,
        currentWeekMonday.month,
        currentWeekMonday.day,
        -WINDOW_DAYS,
    );
    const followingMonday = addCivilDays(
        previousWeekMonday.year,
        previousWeekMonday.month,
        previousWeekMonday.day,
        WINDOW_DAYS,
    );

    const start = zonedTimeToUtc(
        previousWeekMonday.year, previousWeekMonday.month, previousWeekMonday.day,
        0, 0, 0, 0, zone,
    );
    const endExclusive = zonedTimeToUtc(
        followingMonday.year, followingMonday.month, followingMonday.day,
        0, 0, 0, 0, zone,
    );
    const end = new Date(endExclusive.getTime() - 1);

    const localDates: string[] = [];
    for (let offset = 0; offset < WINDOW_DAYS; offset += 1) {
        localDates.push(formatLocalDate(addCivilDays(
            previousWeekMonday.year, previousWeekMonday.month, previousWeekMonday.day, offset,
        )));
    }

    const startLocalDate = localDates[0]!;
    const endLocalDate = localDates[localDates.length - 1]!;

    return {
        start,
        endExclusive,
        end,
        startLocalDate,
        endLocalDate,
        localDates,
        timeZone: zone,
        label: `${startLocalDate} to ${endLocalDate}`,
    };
};

/**
 * The most recent *complete* calendar month relative to `now`, in `timeZone`.
 *
 * Monthly reports previously computed their boundaries with
 * `new Date(y, m - 1, 1)` in server-local time, which is the same class of defect
 * the weekly window had: a report configured for `Africa/Lagos` running on a UTC
 * server would place the month boundary an hour off and mis-assign entries logged
 * in the first or last hour of the month.
 *
 * `localDates` covers every day of the month, so the zero-entry gate works
 * unchanged. The window-integrity gate is weekly by definition (7 days ending
 * Sunday) and is skipped for monthly windows by the caller.
 */
export const getPreviousCompleteMonth = (now: Date, timeZone: string): ReportWindow => {
    const zone = assertValidTimeZone(timeZone);
    const nowParts = getZonedParts(now, zone);

    const prevMonthYear = nowParts.month === 1 ? nowParts.year - 1 : nowParts.year;
    const prevMonth = nowParts.month === 1 ? 12 : nowParts.month - 1;

    const start = zonedTimeToUtc(prevMonthYear, prevMonth, 1, 0, 0, 0, 0, zone);
    const endExclusive = zonedTimeToUtc(nowParts.year, nowParts.month, 1, 0, 0, 0, 0, zone);
    const end = new Date(endExclusive.getTime() - 1);

    // Day count comes from civil arithmetic, so leap years and month lengths are
    // handled without any DST-sensitive division of elapsed milliseconds.
    const daysInMonth = new Date(Date.UTC(prevMonthYear, prevMonth, 0)).getUTCDate();
    const localDates: string[] = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
        localDates.push(formatLocalDate({ year: prevMonthYear, month: prevMonth, day }));
    }

    const startLocalDate = localDates[0]!;
    const endLocalDate = localDates[localDates.length - 1]!;

    return {
        start,
        endExclusive,
        end,
        startLocalDate,
        endLocalDate,
        localDates,
        timeZone: zone,
        label: `${startLocalDate} to ${endLocalDate}`,
    };
};

/**
 * Is `now` at or past the monthly generation slot — the 1st of the month at
 * `generationTime` in `timeZone`?
 *
 * Monthly due-ness was previously `now.getDate() === 1` in server-local time,
 * which fires on the wrong local day for zones far from the server's.
 */
export const isMonthlyGenerationDue = (
    now: Date,
    timeZone: string,
    generationTime: string = DEFAULT_GENERATION_TIME,
): boolean => {
    const zone = assertValidTimeZone(timeZone);
    const time = parseGenerationTime(generationTime);
    if (!time) return false;

    const parts = getZonedParts(now, zone);
    if (parts.day !== 1) return false;

    return parts.hour * 60 + parts.minute >= time.hour * 60 + time.minute;
};

/** Parse an "HH:mm" (or "HH:mm:ss") generation time. Returns null when malformed. */
export const parseGenerationTime = (value: unknown): { hour: number; minute: number } | null => {
    if (typeof value !== 'string') return null;
    const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value.trim());
    if (!match) return null;
    return { hour: Number(match[1]), minute: Number(match[2]) };
};

export const formatGenerationTime = (hour: number, minute: number): string => `${pad(hour)}:${pad(minute)}`;

/**
 * Next scheduled run: the next Monday at `generationTime` in `timeZone`, strictly
 * after `now`. Recomputed through `zonedTimeToUtc` on each call, so DST transitions
 * shift the UTC instant automatically and the local wall-clock time stays fixed.
 */
export const getNextGenerationRun = (
    now: Date,
    timeZone: string,
    generationTime: string = DEFAULT_GENERATION_TIME,
): Date => {
    const zone = assertValidTimeZone(timeZone);
    const time = parseGenerationTime(generationTime);
    if (!time) throw new Error(`Invalid generation time "${generationTime}". Expected 24-hour "HH:mm".`);

    const nowParts = getZonedParts(now, zone);
    const daysUntilMonday = (MONDAY - nowParts.weekday + 7) % 7;

    for (let offset = daysUntilMonday; offset <= daysUntilMonday + 14; offset += 7) {
        const candidateDate = addCivilDays(nowParts.year, nowParts.month, nowParts.day, offset);
        const candidate = zonedTimeToUtc(
            candidateDate.year, candidateDate.month, candidateDate.day,
            time.hour, time.minute, 0, 0, zone,
        );
        if (candidate.getTime() > now.getTime()) return candidate;
    }

    /* istanbul ignore next — unreachable: a Monday always exists within 15 days. */
    throw new Error('Unable to resolve next generation run');
};

/**
 * Is `now` at or past this week's generation slot (Monday `generationTime` local)?
 * Used by the scheduler to decide whether a weekly report is due.
 */
export const isGenerationDue = (
    now: Date,
    timeZone: string,
    generationTime: string = DEFAULT_GENERATION_TIME,
): boolean => {
    const zone = assertValidTimeZone(timeZone);
    const time = parseGenerationTime(generationTime);
    if (!time) return false;

    const parts = getZonedParts(now, zone);
    if (parts.weekday !== MONDAY) return false;

    const minutesNow = parts.hour * 60 + parts.minute;
    return minutesNow >= time.hour * 60 + time.minute;
};

/**
 * Guard for the "never generate on the final day of the window" rule.
 *
 * The window always closes on a Sunday, so generation must never be scheduled for a
 * Sunday. Returns the offending detail when violated, otherwise null.
 */
export const findGenerationDayConflict = (
    generationWeekday: number,
    window: ReportWindow,
    timeZone: string,
): string | null => {
    const endWeekday = getZonedParts(window.end, timeZone).weekday;
    if (generationWeekday === endWeekday) {
        return `Generation is scheduled on ${DAY_NAMES[generationWeekday]}, which is the final day of the export window (${window.endLocalDate}). The window would not be complete at generation time.`;
    }
    if (generationWeekday === SUNDAY) {
        return 'Generation must never be scheduled on Sunday — Sunday is the closing day of every export window.';
    }
    return null;
};

/** Whole days spanned by a window, computed on local calendar dates (DST-safe). */
export const getWindowDaySpan = (window: ReportWindow): number => window.localDates.length;

export const MS_PER_DAY_EXPORT = MS_PER_DAY;
