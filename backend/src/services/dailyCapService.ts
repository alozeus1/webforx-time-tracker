import type { ActiveTimer, Prisma } from '@prisma/client/index';
import prisma from '../config/db';
import { normalizeEmploymentType } from './employmentService';
import type { TimerPolicy } from './timerPolicyService';
import { getUserDayWindow, resolveUserTimezone, type TimeWindow } from './userTimeWindowService';

/**
 * Daily-cap evaluation.
 *
 * The pre-existing 8-hour rule caps one continuous *session*; nothing stopped a user
 * starting a fresh timer straight afterwards, and `manualEntry`, `updateEntry` and
 * correction approvals had no duration ceiling at all. This module adds the missing
 * per-day ceiling, evaluated in the user's own timezone.
 *
 * Going over the cap is not forbidden — it requires an explicit, recorded
 * attestation. The resulting entry is flagged (`over_daily_cap`) so it surfaces at
 * the top of the approval queue rather than blending in.
 */

/** Minimum length of the justification a user must type to log past their cap. */
export const MIN_OVERTIME_REASON_LENGTH = 20;

/** Fraction of the cap at which the UI starts warning. */
const APPROACHING_RATIO = 0.9;

/**
 * How stale a cached daily total may be before it is recomputed.
 * Expressed as a multiple of the heartbeat interval, so a slower heartbeat also
 * means a proportionally cheaper cache.
 *
 * This cache exists for cost, not latency: the database is billed by compute hour
 * and `/timers/ping` runs every few minutes for every user with the app open, so an
 * unconditional aggregate there would be one of the most expensive queries in the
 * system. The cached value lives in `ActiveTimer.heartbeat_state`, which the ping
 * handler already rewrites on every call — no extra column, no extra write.
 */
const CACHE_TTL_HEARTBEATS = 5;

export type DailyCapState = 'ok' | 'floor_passed' | 'approaching' | 'at_cap' | 'over_cap';

export type DailyLimits = {
    capSeconds: number;
    /** 0 for anyone without a daily floor (i.e. everyone who is not an intern). */
    floorSeconds: number;
};

export type DailyUsage = DailyLimits & {
    /** Committed TimeEntry seconds for the day. */
    completedSeconds: number;
    /** Seconds accrued by a currently-running timer, paused time already removed. */
    activeSeconds: number;
    /** completedSeconds + activeSeconds. */
    workedSeconds: number;
    remainingSeconds: number;
    state: DailyCapState;
    localDate: string;
    timezone: string;
};

export type CapUser = {
    id: string;
    timezone?: string | null;
    employment_type?: string | null;
};

/**
 * Seconds a timer has actually counted: wall-clock elapsed minus all paused time,
 * including a pause that is still open.
 *
 * Every cap enforcer previously compared raw `now - start_time` and ignored
 * `paused_duration_seconds`, so a session paused for two hours was killed at six
 * hours of real work.
 */
export const computeCountedSeconds = (
    timer: Pick<ActiveTimer, 'start_time' | 'paused_duration_seconds' | 'is_paused' | 'paused_at'>,
    at: Date = new Date(),
): number => {
    const elapsed = Math.floor((at.getTime() - new Date(timer.start_time).getTime()) / 1000);
    const openPause = timer.is_paused && timer.paused_at
        ? Math.floor((at.getTime() - new Date(timer.paused_at).getTime()) / 1000)
        : 0;
    const paused = (timer.paused_duration_seconds || 0) + Math.max(openPause, 0);
    return Math.max(elapsed - paused, 0);
};

/**
 * Resolve a user's daily ceiling and (for interns) daily floor.
 * The floor comes from `employment_type`, never from the access role — a Manager can
 * be an intern, and the compliance target must follow the classification.
 */
export const resolveDailyLimits = (user: CapUser, policy: TimerPolicy): DailyLimits => {
    const isIntern = normalizeEmploymentType(user.employment_type) === 'intern';
    return {
        capSeconds: Math.round(policy.dailyCapHours * 3600),
        floorSeconds: isIntern ? Math.round(policy.internDailyFloorHours * 3600) : 0,
    };
};

export const evaluateDailyState = (
    workedSeconds: number,
    { capSeconds, floorSeconds }: DailyLimits,
): DailyCapState => {
    if (workedSeconds > capSeconds) return 'over_cap';
    if (workedSeconds >= capSeconds) return 'at_cap';
    if (workedSeconds >= capSeconds * APPROACHING_RATIO) return 'approaching';
    if (floorSeconds > 0 && workedSeconds >= floorSeconds) return 'floor_passed';
    return 'ok';
};

type DbClient = typeof prisma | Prisma.TransactionClient;

/**
 * Committed seconds for a day. Bucketed on `start_time`, matching the convention
 * already used by `getDailyBreakdown` — an entry that spans midnight counts wholly
 * in the day it started. Rejected entries do not count against the cap.
 */
export const getCompletedDaySeconds = async (
    client: DbClient,
    organizationId: string,
    userId: string,
    window: TimeWindow,
    excludeEntryId?: string,
): Promise<number> => {
    const result = await client.timeEntry.aggregate({
        _sum: { duration: true },
        where: {
            organization_id: organizationId,
            user_id: userId,
            status: { not: 'rejected' },
            start_time: { gte: window.start, lt: window.endExclusive },
            ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
        },
    });
    return result._sum.duration || 0;
};

// ---------------------------------------------------------------------------
// heartbeat_state cache
// ---------------------------------------------------------------------------

type DayCache = { localDate: string; completedSeconds: number; computedAt: string };

const readDayCache = (
    heartbeatState: unknown,
    localDate: string,
    ttlMs: number,
    at: Date,
): number | null => {
    if (!heartbeatState || typeof heartbeatState !== 'object' || Array.isArray(heartbeatState)) return null;
    const cached = (heartbeatState as Record<string, unknown>).daily_cap as DayCache | undefined;
    if (!cached || cached.localDate !== localDate) return null;
    const computedAt = Date.parse(cached.computedAt || '');
    if (!Number.isFinite(computedAt) || at.getTime() - computedAt > ttlMs) return null;
    if (typeof cached.completedSeconds !== 'number') return null;
    return cached.completedSeconds;
};

/**
 * Merge a freshly-computed daily total into an existing `heartbeat_state` blob.
 * Returns the object the caller should persist; callers that are not already writing
 * `heartbeat_state` should ignore it rather than issue an extra write.
 */
export const withDayCache = (
    heartbeatState: unknown,
    localDate: string,
    completedSeconds: number,
    at: Date = new Date(),
): Prisma.InputJsonObject => {
    const base = heartbeatState && typeof heartbeatState === 'object' && !Array.isArray(heartbeatState)
        ? { ...(heartbeatState as Record<string, unknown>) }
        : {};

    return {
        ...base,
        daily_cap: { localDate, completedSeconds, computedAt: at.toISOString() } satisfies DayCache,
    } as Prisma.InputJsonObject;
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export type DailyUsageOptions = {
    user: CapUser;
    organizationId: string;
    policy: TimerPolicy;
    at?: Date;
    /**
     * Running timer, if any. Pass `null` explicitly to skip the active component.
     * `heartbeat_state` is `unknown` rather than Prisma's `JsonValue` so callers can
     * hand back the object `withDayCache` produced without a cast.
     */
    activeTimer?: (
        Pick<ActiveTimer, 'start_time' | 'paused_duration_seconds' | 'is_paused' | 'paused_at'>
        & { heartbeat_state?: unknown }
    ) | null;
    /** Seconds about to be added (a manual entry, a correction, an edit delta). */
    additionalSeconds?: number;
    /** Ignore this entry when summing — used when editing an existing entry. */
    excludeEntryId?: string;
    /** Set false to bypass the heartbeat_state cache and always hit the database. */
    useCache?: boolean;
    client?: DbClient;
};

export const getDailyUsage = async (options: DailyUsageOptions): Promise<DailyUsage> => {
    const {
        user, organizationId, policy, activeTimer = null,
        additionalSeconds = 0, excludeEntryId, useCache = false, client = prisma,
    } = options;
    const at = options.at || new Date();

    const timezone = resolveUserTimezone(user);
    const window = getUserDayWindow(timezone, at);
    const limits = resolveDailyLimits(user, policy);

    const ttlMs = policy.heartbeatIntervalSeconds * 1000 * CACHE_TTL_HEARTBEATS;
    const cached = useCache && activeTimer
        ? readDayCache(activeTimer.heartbeat_state, window.localDate, ttlMs, at)
        : null;

    const completedSeconds = cached ?? await getCompletedDaySeconds(
        client, organizationId, user.id, window, excludeEntryId,
    );

    // A timer that started before today has already contributed its pre-midnight
    // seconds to yesterday; only count the part that falls inside today's window.
    let activeSeconds = 0;
    if (activeTimer) {
        const counted = computeCountedSeconds(activeTimer, at);
        const sinceWindowStart = Math.floor((at.getTime() - window.start.getTime()) / 1000);
        activeSeconds = Math.max(Math.min(counted, sinceWindowStart), 0);
    }

    const workedSeconds = completedSeconds + activeSeconds + Math.max(additionalSeconds, 0);

    return {
        ...limits,
        completedSeconds,
        activeSeconds,
        workedSeconds,
        remainingSeconds: Math.max(limits.capSeconds - workedSeconds, 0),
        state: evaluateDailyState(workedSeconds, limits),
        localDate: window.localDate,
        timezone,
    };
};

// ---------------------------------------------------------------------------
// Over-cap attestation
// ---------------------------------------------------------------------------

export type OvertimeAck = { acknowledged: true; reason: string };

export class OvertimeAckError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OvertimeAckError';
    }
}

/**
 * Validate the attestation a client sends when knowingly logging past the cap.
 * Returns null when no attestation was supplied (the caller should then reject the
 * write with DAILY_CAP_REACHED); throws when one was supplied but is unusable, so a
 * blank or tick-only "acknowledgement" cannot buy past the guardrail.
 */
export const parseOvertimeAck = (raw: unknown): OvertimeAck | null => {
    if (!raw || typeof raw !== 'object') return null;
    const candidate = raw as { acknowledged?: unknown; reason?: unknown };
    if (candidate.acknowledged !== true) return null;

    const reason = typeof candidate.reason === 'string' ? candidate.reason.trim() : '';
    if (reason.length < MIN_OVERTIME_REASON_LENGTH) {
        throw new OvertimeAckError(
            `An overtime reason of at least ${MIN_OVERTIME_REASON_LENGTH} characters is required.`,
        );
    }
    return { acknowledged: true, reason };
};

/** Body shape returned to the client alongside a 409, so it can render the modal. */
export const dailyCapConflictBody = (usage: DailyUsage) => ({
    code: 'DAILY_CAP_REACHED' as const,
    message: 'This would take you past your daily time limit.',
    worked_seconds: usage.workedSeconds,
    cap_seconds: usage.capSeconds,
    floor_seconds: usage.floorSeconds,
    local_date: usage.localDate,
    timezone: usage.timezone,
});
