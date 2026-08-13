jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        timeEntry: { aggregate: jest.fn() },
    },
}));

import prisma from '../src/config/db';
import {
    computeCountedSeconds,
    evaluateDailyState,
    getDailyUsage,
    MIN_OVERTIME_REASON_LENGTH,
    OvertimeAckError,
    parseOvertimeAck,
    resolveDailyLimits,
    withDayCache,
} from '../src/services/dailyCapService';
import { DEFAULT_TIMER_POLICY, type TimerPolicy } from '../src/services/timerPolicyService';
import { getUserDayWindow, getUserWeekWindow, resolveUserTimezone } from '../src/services/userTimeWindowService';

const policy: TimerPolicy = { ...DEFAULT_TIMER_POLICY, dailyCapHours: 8, internDailyFloorHours: 2 };

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.timeEntry.aggregate as jest.Mock).mockResolvedValue({ _sum: { duration: 0 } });
});

describe('resolveUserTimezone', () => {
    it('uses the stored zone when it is a real IANA name', () => {
        expect(resolveUserTimezone({ timezone: 'America/Chicago' })).toBe('America/Chicago');
    });

    // A corrupt stored value must never be able to stop someone tracking time.
    it.each([null, undefined, '', '   ', 'CST', 'Not/AZone'])('falls back to UTC for %p', (value) => {
        expect(resolveUserTimezone({ timezone: value as string | null })).toBe('UTC');
    });
});

describe('getUserDayWindow', () => {
    it('brackets the local calendar day, not the UTC one', () => {
        // 03:00 UTC on 12 Aug is still 22:00 on 11 Aug in Chicago (UTC-5 in summer).
        const window = getUserDayWindow('America/Chicago', new Date('2026-08-12T03:00:00.000Z'));

        expect(window.localDate).toBe('2026-08-11');
        expect(window.start.toISOString()).toBe('2026-08-11T05:00:00.000Z');
        expect(window.endExclusive.toISOString()).toBe('2026-08-12T05:00:00.000Z');
    });

    it('produces a 23-hour day on spring forward', () => {
        // US DST began 8 March 2026.
        const window = getUserDayWindow('America/Chicago', new Date('2026-03-08T12:00:00.000Z'));
        const hours = (window.endExclusive.getTime() - window.start.getTime()) / 3_600_000;

        expect(window.localDate).toBe('2026-03-08');
        expect(hours).toBe(23);
    });

    it('produces a 25-hour day on fall back', () => {
        // US DST ended 1 November 2026.
        const window = getUserDayWindow('America/Chicago', new Date('2026-11-01T12:00:00.000Z'));
        const hours = (window.endExclusive.getTime() - window.start.getTime()) / 3_600_000;

        expect(hours).toBe(25);
    });
});

describe('getUserWeekWindow', () => {
    it('starts on Monday', () => {
        const window = getUserWeekWindow('UTC', new Date('2026-08-12T10:00:00.000Z')); // a Wednesday
        expect(window.localDate).toBe('2026-08-10');
        expect(window.endExclusive.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    });

    it('treats Sunday as the end of the week that began six days earlier, not the start of the next', () => {
        const window = getUserWeekWindow('UTC', new Date('2026-08-16T23:00:00.000Z')); // a Sunday
        expect(window.localDate).toBe('2026-08-10');
    });
});

describe('resolveDailyLimits', () => {
    it('gives interns a floor and everyone the same cap', () => {
        expect(resolveDailyLimits({ id: 'u', employment_type: 'intern' }, policy))
            .toEqual({ capSeconds: 8 * 3600, floorSeconds: 2 * 3600 });
    });

    it.each(['employee', 'contractor', null, undefined, 'nonsense'])(
        'gives %p no floor',
        (employmentType) => {
            expect(resolveDailyLimits({ id: 'u', employment_type: employmentType as string | null }, policy).floorSeconds).toBe(0);
        },
    );
});

describe('evaluateDailyState', () => {
    const limits = { capSeconds: 8 * 3600, floorSeconds: 2 * 3600 };

    it.each([
        [0, 'ok'],
        [1 * 3600, 'ok'],
        [2 * 3600, 'floor_passed'],
        [7.2 * 3600, 'approaching'],
        [8 * 3600, 'at_cap'],
        [8.5 * 3600, 'over_cap'],
    ])('%p seconds → %s', (worked, expected) => {
        expect(evaluateDailyState(worked as number, limits)).toBe(expected);
    });

    it('never reports floor_passed for someone with no floor', () => {
        expect(evaluateDailyState(3 * 3600, { capSeconds: 8 * 3600, floorSeconds: 0 })).toBe('ok');
    });
});

describe('computeCountedSeconds', () => {
    const at = new Date('2026-08-12T12:00:00.000Z');

    it('subtracts accumulated paused time', () => {
        const seconds = computeCountedSeconds({
            start_time: new Date('2026-08-12T08:00:00.000Z'),
            paused_duration_seconds: 3600,
            is_paused: false,
            paused_at: null,
        }, at);

        expect(seconds).toBe(3 * 3600);
    });

    it('also subtracts a pause that is still open', () => {
        const seconds = computeCountedSeconds({
            start_time: new Date('2026-08-12T08:00:00.000Z'),
            paused_duration_seconds: 0,
            is_paused: true,
            paused_at: new Date('2026-08-12T10:00:00.000Z'),
        }, at);

        expect(seconds).toBe(2 * 3600);
    });

    it('never goes negative', () => {
        const seconds = computeCountedSeconds({
            start_time: new Date('2026-08-12T11:00:00.000Z'),
            paused_duration_seconds: 99_999,
            is_paused: false,
            paused_at: null,
        }, at);

        expect(seconds).toBe(0);
    });
});

describe('getDailyUsage', () => {
    const user = { id: 'u1', timezone: 'UTC', employment_type: 'employee' };
    const at = new Date('2026-08-12T12:00:00.000Z');

    it('sums committed entries and the running timer', async () => {
        (prisma.timeEntry.aggregate as jest.Mock).mockResolvedValue({ _sum: { duration: 4 * 3600 } });

        const usage = await getDailyUsage({
            user,
            organizationId: 'org-1',
            policy,
            at,
            activeTimer: {
                start_time: new Date('2026-08-12T10:00:00.000Z'),
                paused_duration_seconds: 0,
                is_paused: false,
                paused_at: null,
                heartbeat_state: {},
            },
        });

        expect(usage.completedSeconds).toBe(4 * 3600);
        expect(usage.activeSeconds).toBe(2 * 3600);
        expect(usage.workedSeconds).toBe(6 * 3600);
        expect(usage.state).toBe('ok');
        expect(usage.remainingSeconds).toBe(2 * 3600);
    });

    it('only counts the part of an overnight timer that falls inside today', async () => {
        const usage = await getDailyUsage({
            user,
            organizationId: 'org-1',
            policy,
            at: new Date('2026-08-12T02:00:00.000Z'),
            activeTimer: {
                // Started 22:00 yesterday; yesterday already owns those two hours.
                start_time: new Date('2026-08-11T22:00:00.000Z'),
                paused_duration_seconds: 0,
                is_paused: false,
                paused_at: null,
                heartbeat_state: {},
            },
        });

        expect(usage.activeSeconds).toBe(2 * 3600);
    });

    it('excludes rejected entries from the day total', async () => {
        await getDailyUsage({ user, organizationId: 'org-1', policy, at });

        expect(prisma.timeEntry.aggregate).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ status: { not: 'rejected' } }),
        }));
    });

    it('reads a fresh cache instead of querying', async () => {
        const usage = await getDailyUsage({
            user,
            organizationId: 'org-1',
            policy,
            at,
            useCache: true,
            activeTimer: {
                start_time: at,
                paused_duration_seconds: 0,
                is_paused: false,
                paused_at: null,
                heartbeat_state: withDayCache({}, '2026-08-12', 5 * 3600, at),
            },
        });

        expect(prisma.timeEntry.aggregate).not.toHaveBeenCalled();
        expect(usage.completedSeconds).toBe(5 * 3600);
    });

    it('ignores a cache from a different local day', async () => {
        await getDailyUsage({
            user,
            organizationId: 'org-1',
            policy,
            at,
            useCache: true,
            activeTimer: {
                start_time: at,
                paused_duration_seconds: 0,
                is_paused: false,
                paused_at: null,
                heartbeat_state: withDayCache({}, '2026-08-11', 5 * 3600, at),
            },
        });

        expect(prisma.timeEntry.aggregate).toHaveBeenCalled();
    });

    it('ignores a cache that has gone stale', async () => {
        const stale = new Date(at.getTime() - policy.heartbeatIntervalSeconds * 1000 * 20);

        await getDailyUsage({
            user,
            organizationId: 'org-1',
            policy,
            at,
            useCache: true,
            activeTimer: {
                start_time: at,
                paused_duration_seconds: 0,
                is_paused: false,
                paused_at: null,
                heartbeat_state: withDayCache({}, '2026-08-12', 5 * 3600, stale),
            },
        });

        expect(prisma.timeEntry.aggregate).toHaveBeenCalled();
    });

    it('preserves unrelated heartbeat_state keys when caching', () => {
        const merged = withDayCache({ visibility_state: 'visible' }, '2026-08-12', 60, at);
        expect(merged.visibility_state).toBe('visible');
        expect((merged.daily_cap as { completedSeconds: number }).completedSeconds).toBe(60);
    });
});

describe('parseOvertimeAck', () => {
    const goodReason = 'Client escalation, agreed with my manager on Slack.';

    it('returns null when nothing was supplied', () => {
        expect(parseOvertimeAck(undefined)).toBeNull();
        expect(parseOvertimeAck(null)).toBeNull();
        expect(parseOvertimeAck({})).toBeNull();
    });

    // A tick alone must not buy past the guardrail.
    it('rejects an acknowledgement with no usable reason', () => {
        expect(() => parseOvertimeAck({ acknowledged: true, reason: 'busy' })).toThrow(OvertimeAckError);
        expect(() => parseOvertimeAck({ acknowledged: true })).toThrow(OvertimeAckError);
        expect(() => parseOvertimeAck({ acknowledged: true, reason: ' '.repeat(50) })).toThrow(OvertimeAckError);
    });

    it('accepts a real justification', () => {
        expect(goodReason.length).toBeGreaterThanOrEqual(MIN_OVERTIME_REASON_LENGTH);
        expect(parseOvertimeAck({ acknowledged: true, reason: `  ${goodReason}  ` }))
            .toEqual({ acknowledged: true, reason: goodReason });
    });

    it('ignores a reason when the box was not ticked', () => {
        expect(parseOvertimeAck({ acknowledged: false, reason: goodReason })).toBeNull();
    });
});
