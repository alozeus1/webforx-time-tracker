/**
 * Export window correctness.
 *
 * The regression these tests lock down: the weekly window used to be built from
 * server-local time as [now-6d 00:00, now+1d 00:00), which produced a
 * Tuesday-to-Monday window and silently dropped one working day from every weekly
 * report. Monday 2026-07-27 appeared in neither the Week 30 nor the Week 31 export.
 */

import {
    DEFAULT_GENERATION_TIME,
    InvalidTimeZoneError,
    findGenerationDayConflict,
    getNextGenerationRun,
    getPreviousCompleteMonth,
    getPreviousCompleteWeek,
    getZonedParts,
    isGenerationDue,
    isMonthlyGenerationDue,
    isValidTimeZone,
    parseGenerationTime,
    toLocalDateString,
    zonedTimeToUtc,
} from '../src/utils/reportWindow';

describe('getPreviousCompleteWeek', () => {
    it('REGRESSION: covers Mon 2026-07-27 to Sun 2026-08-02, the week the old window dropped', () => {
        // Generation instant: Monday 2026-08-03 06:00 America/Chicago (CDT, UTC-5).
        const now = new Date('2026-08-03T11:00:00.000Z');
        const window = getPreviousCompleteWeek(now, 'America/Chicago');

        expect(window.startLocalDate).toBe('2026-07-27');
        expect(window.endLocalDate).toBe('2026-08-02');
        expect(window.label).toBe('2026-07-27 to 2026-08-02');

        // The old implementation produced 2026-07-28 to 2026-08-03.
        expect(window.label).not.toBe('2026-07-28 to 2026-08-03');
        expect(window.localDates).toContain('2026-07-27');
        expect(window.localDates).not.toContain('2026-08-03');
    });

    it('always spans exactly 7 local dates, starting Monday and ending Sunday', () => {
        const zones = ['UTC', 'America/Chicago', 'Asia/Kolkata', 'Pacific/Auckland', 'Europe/London'];
        for (const zone of zones) {
            const window = getPreviousCompleteWeek(new Date('2026-08-03T11:00:00.000Z'), zone);
            expect(window.localDates).toHaveLength(7);
            expect(getZonedParts(window.start, zone).weekday).toBe(1); // Monday
            expect(getZonedParts(window.end, zone).weekday).toBe(0); // Sunday
        }
    });

    it('starts at 00:00:00.000 and ends at 23:59:59.999 local', () => {
        const zone = 'America/Chicago';
        const window = getPreviousCompleteWeek(new Date('2026-08-03T11:00:00.000Z'), zone);

        const start = getZonedParts(window.start, zone);
        expect([start.hour, start.minute, start.second]).toEqual([0, 0, 0]);

        const end = getZonedParts(window.end, zone);
        expect([end.hour, end.minute, end.second]).toEqual([23, 59, 59]);
        expect(window.end.getTime()).toBe(window.endExclusive.getTime() - 1);
    });

    it('never includes the day generation runs on', () => {
        // Every day of a week must resolve to a window that excludes "today".
        for (let day = 3; day <= 9; day += 1) {
            const now = new Date(`2026-08-0${day}T09:00:00.000Z`);
            const window = getPreviousCompleteWeek(now, 'UTC');
            expect(window.localDates).not.toContain(toLocalDateString(now, 'UTC'));
        }
    });

    it('resolves the same completed week from any day within the current week', () => {
        const labels = new Set<string>();
        // Mon 2026-08-03 through Sun 2026-08-09 all sit in the same current week.
        for (let day = 3; day <= 9; day += 1) {
            labels.add(getPreviousCompleteWeek(new Date(`2026-08-0${day}T12:00:00.000Z`), 'UTC').label);
        }
        expect(Array.from(labels)).toEqual(['2026-07-27 to 2026-08-02']);
    });

    describe('timezone edge cases', () => {
        it('handles UTC+13 (Pacific/Apia) — window is ahead of the UTC instant', () => {
            const window = getPreviousCompleteWeek(new Date('2026-08-03T00:00:00.000Z'), 'Pacific/Apia');
            expect(window.localDates).toHaveLength(7);
            expect(getZonedParts(window.start, 'Pacific/Apia').weekday).toBe(1);
            expect(getZonedParts(window.end, 'Pacific/Apia').weekday).toBe(0);
        });

        it('handles UTC-11 (Pacific/Niue) — window lags the UTC instant', () => {
            const window = getPreviousCompleteWeek(new Date('2026-08-03T00:00:00.000Z'), 'Pacific/Niue');
            expect(window.localDates).toHaveLength(7);
            expect(getZonedParts(window.start, 'Pacific/Niue').weekday).toBe(1);
            expect(getZonedParts(window.end, 'Pacific/Niue').weekday).toBe(0);
        });

        it('handles a half-hour offset zone (Asia/Kolkata, UTC+05:30)', () => {
            const zone = 'Asia/Kolkata';
            const window = getPreviousCompleteWeek(new Date('2026-08-03T11:00:00.000Z'), zone);
            expect(window.label).toBe('2026-07-27 to 2026-08-02');
            const start = getZonedParts(window.start, zone);
            expect([start.hour, start.minute]).toEqual([0, 0]);
        });

        it('handles a 45-minute offset zone (Asia/Kathmandu, UTC+05:45)', () => {
            const zone = 'Asia/Kathmandu';
            const window = getPreviousCompleteWeek(new Date('2026-08-03T11:00:00.000Z'), zone);
            expect(window.localDates).toHaveLength(7);
            const start = getZonedParts(window.start, zone);
            expect([start.hour, start.minute, start.second]).toEqual([0, 0, 0]);
        });

        it('rejects an invalid IANA zone rather than silently defaulting', () => {
            expect(() => getPreviousCompleteWeek(new Date(), 'Mars/Olympus_Mons')).toThrow(InvalidTimeZoneError);
            expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
            expect(isValidTimeZone('America/Chicago')).toBe(true);
            expect(isValidTimeZone('')).toBe(false);
            expect(isValidTimeZone(null)).toBe(false);
        });

        it('rejects legacy abbreviations that ICU would otherwise accept', () => {
            // ICU resolves these, so a plain try/catch around Intl.DateTimeFormat would
            // let them through. They must not be accepted — see the next test for why.
            for (const abbreviation of ['EST', 'CST', 'MST', 'HST', 'GMT', 'EST5EDT', 'CST6CDT']) {
                expect(new Intl.DateTimeFormat('en-US', { timeZone: abbreviation })).toBeDefined();
                expect(isValidTimeZone(abbreviation)).toBe(false);
            }
            // Deprecated single-word aliases are rejected for the same reason.
            expect(isValidTimeZone('Japan')).toBe(false);
            expect(isValidTimeZone('Singapore')).toBe(false);
            // Etc/* is fixed-offset AND sign-inverted: Etc/GMT+5 means UTC-5.
            expect(isValidTimeZone('Etc/GMT+5')).toBe(false);
            expect(isValidTimeZone('Etc/UTC')).toBe(false);
        });

        it('accepts both old and new canonicalisations, because ICU versions disagree', () => {
            // Validation is shape + resolvability, NOT an allowlist from
            // Intl.supportedValuesOf('timeZone'). That list is ICU-version-dependent:
            // the CI runtime lists Asia/Calcutta / Europe/Kiev but not the modern
            // Asia/Kolkata / Europe/Kyiv, while browsers list the modern spellings.
            // An allowlist would therefore reject values the UI had just offered.
            for (const zone of [
                'Asia/Kolkata', 'Asia/Calcutta',
                'Asia/Kathmandu', 'Asia/Katmandu',
                'Europe/Kyiv', 'Europe/Kiev',
                'America/Argentina/Buenos_Aires',
            ]) {
                expect(isValidTimeZone(zone)).toBe(true);
            }
        });

        it('documents WHY abbreviations are rejected: EST is not US Eastern', () => {
            // ICU maps EST to America/Panama, a fixed -05:00 zone with no DST. Someone
            // entering "EST" meaning US Eastern would get boundaries an hour out for
            // roughly half the year — exactly the silent one-hour shift this module exists
            // to prevent.
            expect(new Intl.DateTimeFormat('en-US', { timeZone: 'EST' }).resolvedOptions().timeZone)
                .toBe('America/Panama');

            const fmt = (zone: string, instant: Date) => new Intl.DateTimeFormat('en-US', {
                timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
            }).format(instant);

            const january = new Date('2026-01-15T17:00:00.000Z');
            const july = new Date('2026-07-15T17:00:00.000Z');

            expect(fmt('EST', january)).toBe(fmt('EST', july)); // no DST — same wall time
            expect(fmt('America/New_York', january)).not.toBe(fmt('America/New_York', july));
        });

        it('accepts UTC, the documented default, even though it is not in the canonical list', () => {
            expect(isValidTimeZone('UTC')).toBe(true);
            expect(isValidTimeZone(' UTC ')).toBe(true);
            expect(getPreviousCompleteWeek(new Date('2026-08-03T06:00:00.000Z'), 'UTC').label)
                .toBe('2026-07-27 to 2026-08-02');
        });
    });

    describe('DST transitions', () => {
        it('spring forward: a US week containing the transition is still 7 days and 167 real hours', () => {
            // US spring forward 2026: Sunday 2026-03-08.
            const zone = 'America/Chicago';
            const window = getPreviousCompleteWeek(new Date('2026-03-09T11:00:00.000Z'), zone);

            expect(window.label).toBe('2026-03-02 to 2026-03-08');
            expect(window.localDates).toHaveLength(7);

            // One hour vanishes from the wall clock, so the elapsed real time is 167h.
            const elapsedHours = (window.endExclusive.getTime() - window.start.getTime()) / 3_600_000;
            expect(elapsedHours).toBe(167);
        });

        it('fall back: a US week containing the transition is 7 days and 169 real hours', () => {
            // US fall back 2026: Sunday 2026-11-01.
            const zone = 'America/Chicago';
            const window = getPreviousCompleteWeek(new Date('2026-11-02T12:00:00.000Z'), zone);

            expect(window.label).toBe('2026-10-26 to 2026-11-01');
            expect(window.localDates).toHaveLength(7);

            const elapsedHours = (window.endExclusive.getTime() - window.start.getTime()) / 3_600_000;
            expect(elapsedHours).toBe(169);
        });

        it('southern hemisphere DST (Australia/Sydney) keeps Monday/Sunday boundaries', () => {
            const zone = 'Australia/Sydney';
            const window = getPreviousCompleteWeek(new Date('2026-10-12T00:00:00.000Z'), zone);
            expect(getZonedParts(window.start, zone).weekday).toBe(1);
            expect(getZonedParts(window.end, zone).weekday).toBe(0);
            expect(getZonedParts(window.start, zone).hour).toBe(0);
        });
    });

    describe('calendar boundaries', () => {
        it('spans a month boundary', () => {
            const window = getPreviousCompleteWeek(new Date('2026-08-03T11:00:00.000Z'), 'UTC');
            expect(window.localDates).toEqual([
                '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30',
                '2026-07-31', '2026-08-01', '2026-08-02',
            ]);
        });

        it('spans a year boundary', () => {
            // Monday 2027-01-04 -> previous complete week is 2026-12-28 to 2027-01-03.
            const window = getPreviousCompleteWeek(new Date('2027-01-04T09:00:00.000Z'), 'UTC');
            expect(window.label).toBe('2026-12-28 to 2027-01-03');
            expect(window.localDates).toHaveLength(7);
        });

        it('spans a leap day (2028-02-29)', () => {
            // 2028 is a leap year; Tuesday 2028-02-29 falls inside this window.
            const window = getPreviousCompleteWeek(new Date('2028-03-06T09:00:00.000Z'), 'UTC');
            expect(window.localDates).toContain('2028-02-29');
            expect(window.localDates).toHaveLength(7);
        });
    });
});

describe('zonedTimeToUtc', () => {
    it('round-trips a wall-clock time through the offset', () => {
        const instant = zonedTimeToUtc(2026, 8, 3, 6, 0, 0, 0, 'America/Chicago');
        const parts = getZonedParts(instant, 'America/Chicago');
        expect([parts.year, parts.month, parts.day, parts.hour, parts.minute]).toEqual([2026, 8, 3, 6, 0]);
    });

    it('handles midnight without emitting hour 24', () => {
        const instant = zonedTimeToUtc(2026, 8, 3, 0, 0, 0, 0, 'Europe/London');
        expect(getZonedParts(instant, 'Europe/London').hour).toBe(0);
    });

    it('resolves a fall-back ambiguous hour to the first occurrence, so a job never runs twice', () => {
        // 01:30 occurs twice on 2026-11-01 in America/Chicago.
        const instant = zonedTimeToUtc(2026, 11, 1, 1, 30, 0, 0, 'America/Chicago');
        // First occurrence is CDT (UTC-5) => 06:30Z; second is CST (UTC-6) => 07:30Z.
        expect(instant.toISOString()).toBe('2026-11-01T06:30:00.000Z');
    });
});

describe('generation scheduling', () => {
    it('parses and rejects generation times', () => {
        expect(parseGenerationTime('06:00')).toEqual({ hour: 6, minute: 0 });
        expect(parseGenerationTime('23:59')).toEqual({ hour: 23, minute: 59 });
        expect(parseGenerationTime('6:00')).toBeNull();
        expect(parseGenerationTime('24:00')).toBeNull();
        expect(parseGenerationTime('06:60')).toBeNull();
        expect(parseGenerationTime(600)).toBeNull();
    });

    it('never schedules a run on Sunday, for any starting point in the week', () => {
        for (let day = 1; day <= 28; day += 1) {
            const now = new Date(Date.UTC(2026, 7, day, 13, 0, 0));
            const next = getNextGenerationRun(now, 'America/Chicago', '06:00');
            expect(getZonedParts(next, 'America/Chicago').weekday).toBe(1); // always Monday
        }
    });

    it('keeps the local wall-clock time fixed across a DST transition', () => {
        const zone = 'America/Chicago';
        // Next Monday after the spring-forward Sunday.
        const next = getNextGenerationRun(new Date('2026-03-05T12:00:00.000Z'), zone, '06:00');
        const parts = getZonedParts(next, zone);
        expect([parts.weekday, parts.hour, parts.minute]).toEqual([1, 6, 0]);
        // CDT is UTC-5, so 06:00 local is 11:00Z (it was 12:00Z before the change).
        expect(next.toISOString()).toBe('2026-03-09T11:00:00.000Z');
    });

    it('returns a strictly future run when called exactly at the slot', () => {
        const zone = 'UTC';
        const atSlot = new Date('2026-08-03T06:00:00.000Z'); // Monday 06:00 UTC
        const next = getNextGenerationRun(atSlot, zone, '06:00');
        expect(next.getTime()).toBeGreaterThan(atSlot.getTime());
        expect(next.toISOString()).toBe('2026-08-10T06:00:00.000Z');
    });

    it('isGenerationDue is true only on Monday at or after the configured local time', () => {
        const zone = 'America/Chicago';
        expect(isGenerationDue(new Date('2026-08-03T10:59:00.000Z'), zone, '06:00')).toBe(false); // Mon 05:59
        expect(isGenerationDue(new Date('2026-08-03T11:00:00.000Z'), zone, '06:00')).toBe(true); // Mon 06:00
        expect(isGenerationDue(new Date('2026-08-03T23:00:00.000Z'), zone, '06:00')).toBe(true); // Mon 18:00
        expect(isGenerationDue(new Date('2026-08-02T23:00:00.000Z'), zone, '06:00')).toBe(false); // Sun 18:00
        expect(isGenerationDue(new Date('2026-08-04T11:00:00.000Z'), zone, '06:00')).toBe(false); // Tue
    });

    it('is never due on a Sunday in any timezone', () => {
        const zones = ['UTC', 'America/Chicago', 'Pacific/Auckland', 'Pacific/Niue', 'Asia/Kolkata'];
        for (const zone of zones) {
            for (let hour = 0; hour < 24; hour += 1) {
                const instant = new Date(Date.UTC(2026, 7, 2, hour, 0, 0)); // 2026-08-02 is a Sunday UTC
                if (getZonedParts(instant, zone).weekday !== 0) continue;
                expect(isGenerationDue(instant, zone, DEFAULT_GENERATION_TIME)).toBe(false);
            }
        }
    });

    it('flags a generation day that collides with the window close', () => {
        const window = getPreviousCompleteWeek(new Date('2026-08-03T11:00:00.000Z'), 'UTC');
        expect(findGenerationDayConflict(0, window, 'UTC')).toMatch(/Sunday/);
        expect(findGenerationDayConflict(1, window, 'UTC')).toBeNull();
    });
});


describe('getPreviousCompleteMonth', () => {
    // Regression (Codex review): monthly windows used `new Date(y, m - 1, 1)` in
    // SERVER-local time — the same defect class as the old weekly window. A report
    // configured for a non-UTC zone displayed that timezone but never applied it,
    // mis-assigning entries logged in the first or last hour of the month.
    it('builds the previous calendar month in UTC', () => {
        const window = getPreviousCompleteMonth(new Date('2026-04-01T06:00:00.000Z'), 'UTC');
        expect(window.label).toBe('2026-03-01 to 2026-03-31');
        expect(window.localDates).toHaveLength(31);
        expect(window.start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
        expect(window.endExclusive.toISOString()).toBe('2026-04-01T00:00:00.000Z');
        expect(window.end.getTime()).toBe(window.endExclusive.getTime() - 1);
    });

    it('shifts the month boundary for a non-UTC zone', () => {
        const window = getPreviousCompleteMonth(new Date('2026-04-01T05:00:00.000Z'), 'Africa/Lagos');
        // UTC+1: local 1 March 00:00 is 28 February 23:00 UTC.
        expect(window.start.toISOString()).toBe('2026-02-28T23:00:00.000Z');
        expect(window.endExclusive.toISOString()).toBe('2026-03-31T23:00:00.000Z');
        expect(window.label).toBe('2026-03-01 to 2026-03-31');
    });

    it('computes boundaries per-instant across a DST transition inside the month', () => {
        // US spring forward is 8 March 2026, mid-window: the month opens in CST
        // (UTC-6) and closes in CDT (UTC-5). A fixed-offset implementation would put
        // one of these an hour out.
        const window = getPreviousCompleteMonth(new Date('2026-04-01T11:00:00.000Z'), 'America/Chicago');
        expect(window.start.toISOString()).toBe('2026-03-01T06:00:00.000Z');
        expect(window.endExclusive.toISOString()).toBe('2026-04-01T05:00:00.000Z');
        expect(window.localDates).toHaveLength(31);
    });

    it('handles month lengths, leap years and the year boundary', () => {
        expect(getPreviousCompleteMonth(new Date('2028-03-01T06:00:00.000Z'), 'UTC').localDates).toHaveLength(29);
        expect(getPreviousCompleteMonth(new Date('2028-03-01T06:00:00.000Z'), 'UTC').localDates).toContain('2028-02-29');
        expect(getPreviousCompleteMonth(new Date('2026-03-01T06:00:00.000Z'), 'UTC').localDates).toHaveLength(28);
        expect(getPreviousCompleteMonth(new Date('2027-01-01T06:00:00.000Z'), 'UTC').label)
            .toBe('2026-12-01 to 2026-12-31');
        expect(getPreviousCompleteMonth(new Date('2026-05-01T06:00:00.000Z'), 'UTC').localDates).toHaveLength(30);
    });
});

describe('isMonthlyGenerationDue', () => {
    it('is due only on the 1st, at or after the local slot', () => {
        expect(isMonthlyGenerationDue(new Date('2026-04-01T06:00:00.000Z'), 'UTC', '06:00')).toBe(true);
        expect(isMonthlyGenerationDue(new Date('2026-04-01T05:59:00.000Z'), 'UTC', '06:00')).toBe(false);
        expect(isMonthlyGenerationDue(new Date('2026-04-02T06:00:00.000Z'), 'UTC', '06:00')).toBe(false);
        expect(isMonthlyGenerationDue(new Date('2026-04-30T06:00:00.000Z'), 'UTC', '06:00')).toBe(false);
    });

    it('resolves the 1st in the reporting timezone, not the server\'s', () => {
        // 31 March 18:00 UTC is already 1 April 06:00 in Pacific/Auckland.
        const instant = new Date('2026-03-31T18:00:00.000Z');
        expect(isMonthlyGenerationDue(instant, 'Pacific/Auckland', '06:00')).toBe(true);
        expect(isMonthlyGenerationDue(instant, 'UTC', '06:00')).toBe(false);
    });
});
