import type { Prisma } from '@prisma/client/index';
import prisma from '../config/db';
import type { TimerPolicy } from './timerPolicyService';
import { getUserWeekWindow, resolveUserTimezone, type TimeWindow } from './userTimeWindowService';

/**
 * Weekly quota for "recovered time" — the correction requests people file to claim
 * time the timer did not capture.
 *
 * The mechanism is legitimate and must stay available, but it is also the easiest
 * thing in the app to abuse, because an approved correction writes time with no
 * heartbeat evidence behind it. Rather than a flat block, the quota applies an
 * escalating friction ladder: the first requests are free, the last one in the
 * allowance demands a written justification and an explicit acknowledgement that
 * management reviews these closely, and anything beyond it needs an Admin to grant
 * extra headroom for that week.
 *
 * Rejected requests deliberately do NOT consume a slot — otherwise a wrongly
 * rejected request would punish the user twice.
 */

export type RecoveryTier = 'normal' | 'final' | 'blocked';

/** Minimum justification length once a user reaches the last request in their allowance. */
export const MIN_FINAL_TIER_REASON_LENGTH = 40;

/** Statuses that consume a slot in the weekly allowance. */
const CONSUMING_STATUSES = ['PENDING', 'APPROVED'];

export type RecoveryUsage = {
    used: number;
    /** Base policy limit plus any Admin grants for this week. */
    limit: number;
    baseLimit: number;
    grantedExtra: number;
    remaining: number;
    weekStart: Date;
    /** Exclusive — the instant the allowance resets. */
    weekEnd: Date;
    timezone: string;
    tier: RecoveryTier;
    requiresAcknowledgement: boolean;
    minReasonLength: number;
};

export type RecoveryUser = { id: string; timezone?: string | null };

/**
 * Which tier a *new* request would land in, given how many are already used.
 * With the default limit of 3: 0–1 used → normal, 2 used → final (this is the third
 * and last), 3+ used → blocked.
 */
export const resolveTier = (used: number, limit: number): RecoveryTier => {
    if (used >= limit) return 'blocked';
    if (used >= limit - 1) return 'final';
    return 'normal';
};

const countGrantedExtra = async (
    client: typeof prisma | Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    window: TimeWindow,
): Promise<number> => {
    const result = await client.recoveryOverrideGrant.aggregate({
        _sum: { extra_requests: true },
        where: {
            organization_id: organizationId,
            user_id: userId,
            week_start: { gte: window.start, lt: window.endExclusive },
        },
    });
    return result._sum.extra_requests || 0;
};

export const getWeeklyRecoveryUsage = async (options: {
    user: RecoveryUser;
    organizationId: string;
    policy: TimerPolicy;
    at?: Date;
    client?: typeof prisma | Prisma.TransactionClient;
}): Promise<RecoveryUsage> => {
    const { user, organizationId, policy, client = prisma } = options;
    const at = options.at || new Date();

    const timezone = resolveUserTimezone(user);
    const window = getUserWeekWindow(timezone, at);

    const [used, grantedExtra] = await Promise.all([
        client.timerCorrectionRequest.count({
            where: {
                organization_id: organizationId,
                user_id: user.id,
                status: { in: CONSUMING_STATUSES },
                created_at: { gte: window.start, lt: window.endExclusive },
            },
        }),
        countGrantedExtra(client, organizationId, user.id, window),
    ]);

    const baseLimit = policy.weeklyRecoveryLimit;
    const limit = baseLimit + grantedExtra;
    const tier = resolveTier(used, limit);

    return {
        used,
        limit,
        baseLimit,
        grantedExtra,
        remaining: Math.max(limit - used, 0),
        weekStart: window.start,
        weekEnd: window.endExclusive,
        timezone,
        tier,
        requiresAcknowledgement: tier === 'final',
        minReasonLength: tier === 'final' ? MIN_FINAL_TIER_REASON_LENGTH : 1,
    };
};

export class RecoveryQuotaError extends Error {
    readonly usage: RecoveryUsage;
    readonly status: number;

    constructor(message: string, usage: RecoveryUsage, status: number) {
        super(message);
        this.name = 'RecoveryQuotaError';
        this.usage = usage;
        this.status = status;
    }
}

/**
 * Gate a new correction request against the ladder.
 * Throws `RecoveryQuotaError` (403 blocked / 400 missing acknowledgement) rather
 * than returning a boolean, so no caller can forget to check the result.
 */
export const assertRecoveryAllowed = (
    usage: RecoveryUsage,
    input: { reason: string; acknowledgedPolicy?: unknown },
): void => {
    if (usage.tier === 'blocked') {
        throw new RecoveryQuotaError(
            `You have used all ${usage.limit} recovery requests for this week. Ask an admin to grant an exception.`,
            usage,
            403,
        );
    }

    if (usage.tier === 'final') {
        if (input.acknowledgedPolicy !== true) {
            throw new RecoveryQuotaError(
                'This is your last recovery request this week. You must acknowledge the review policy to continue.',
                usage,
                400,
            );
        }
        if ((input.reason || '').trim().length < MIN_FINAL_TIER_REASON_LENGTH) {
            throw new RecoveryQuotaError(
                `A detailed reason of at least ${MIN_FINAL_TIER_REASON_LENGTH} characters is required for this request.`,
                usage,
                400,
            );
        }
    }
};

/** Serialised form shared by the quota endpoint and every quota-related error body. */
export const serializeRecoveryUsage = (usage: RecoveryUsage) => ({
    used: usage.used,
    limit: usage.limit,
    base_limit: usage.baseLimit,
    granted_extra: usage.grantedExtra,
    remaining: usage.remaining,
    week_start: usage.weekStart.toISOString(),
    week_end: usage.weekEnd.toISOString(),
    timezone: usage.timezone,
    tier: usage.tier,
    requires_acknowledgement: usage.requiresAcknowledgement,
    min_reason_length: usage.minReasonLength,
});

export const recoveryQuotaBody = (usage: RecoveryUsage, message: string) => ({
    code: 'RECOVERY_LIMIT_REACHED' as const,
    message,
    recovery_usage: serializeRecoveryUsage(usage),
});
