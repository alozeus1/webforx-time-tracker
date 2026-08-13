jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        timerCorrectionRequest: { count: jest.fn() },
        recoveryOverrideGrant: { aggregate: jest.fn() },
    },
}));

import prisma from '../src/config/db';
import {
    assertRecoveryAllowed,
    getWeeklyRecoveryUsage,
    MIN_FINAL_TIER_REASON_LENGTH,
    recoveryQuotaBody,
    RecoveryQuotaError,
    resolveTier,
} from '../src/services/recoveredTimeService';
import { DEFAULT_TIMER_POLICY, type TimerPolicy } from '../src/services/timerPolicyService';

const policy: TimerPolicy = { ...DEFAULT_TIMER_POLICY, weeklyRecoveryLimit: 3 };
const user = { id: 'user-1', timezone: 'UTC' };

const longReason = 'The laptop lost power during the deployment window and the timer never restarted.';

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.timerCorrectionRequest.count as jest.Mock).mockResolvedValue(0);
    (prisma.recoveryOverrideGrant.aggregate as jest.Mock).mockResolvedValue({ _sum: { extra_requests: 0 } });
});

describe('resolveTier', () => {
    it.each([
        [0, 'normal'],
        [1, 'normal'],
        [2, 'final'],
        [3, 'blocked'],
        [7, 'blocked'],
    ])('%p already used → %s', (used, expected) => {
        expect(resolveTier(used as number, 3)).toBe(expected);
    });

    it('shifts with a raised limit', () => {
        expect(resolveTier(3, 5)).toBe('normal');
        expect(resolveTier(4, 5)).toBe('final');
        expect(resolveTier(5, 5)).toBe('blocked');
    });
});

describe('getWeeklyRecoveryUsage', () => {
    it('counts only requests that are pending or approved', async () => {
        await getWeeklyRecoveryUsage({ user, organizationId: 'org-1', policy });

        const where = (prisma.timerCorrectionRequest.count as jest.Mock).mock.calls[0][0].where;
        // A rejected request must not burn a slot, or a wrong rejection punishes twice.
        expect(where.status).toEqual({ in: ['PENDING', 'APPROVED'] });
    });

    it('counts within the user Monday-based week', async () => {
        const usage = await getWeeklyRecoveryUsage({
            user,
            organizationId: 'org-1',
            policy,
            at: new Date('2026-08-12T10:00:00.000Z'), // Wednesday
        });

        expect(usage.weekStart.toISOString()).toBe('2026-08-10T00:00:00.000Z');
        expect(usage.weekEnd.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    });

    it('uses the requester timezone, not the server one', async () => {
        const usage = await getWeeklyRecoveryUsage({
            user: { id: 'user-1', timezone: 'Pacific/Auckland' },
            organizationId: 'org-1',
            policy,
            at: new Date('2026-08-16T20:00:00.000Z'), // Monday 08:00 in Auckland
        });

        // Already the new week locally, even though it is still Sunday in UTC.
        expect(usage.weekStart.toISOString()).toBe('2026-08-16T12:00:00.000Z');
    });

    it('raises the limit by any admin grants for that week', async () => {
        (prisma.timerCorrectionRequest.count as jest.Mock).mockResolvedValue(3);
        (prisma.recoveryOverrideGrant.aggregate as jest.Mock).mockResolvedValue({ _sum: { extra_requests: 2 } });

        const usage = await getWeeklyRecoveryUsage({ user, organizationId: 'org-1', policy });

        expect(usage.baseLimit).toBe(3);
        expect(usage.limit).toBe(5);
        expect(usage.remaining).toBe(2);
        expect(usage.tier).toBe('normal');
    });

    it('never reports negative remaining', async () => {
        (prisma.timerCorrectionRequest.count as jest.Mock).mockResolvedValue(9);

        const usage = await getWeeklyRecoveryUsage({ user, organizationId: 'org-1', policy });

        expect(usage.remaining).toBe(0);
        expect(usage.tier).toBe('blocked');
    });
});

describe('assertRecoveryAllowed', () => {
    const usageAt = async (used: number) => {
        (prisma.timerCorrectionRequest.count as jest.Mock).mockResolvedValue(used);
        return getWeeklyRecoveryUsage({ user, organizationId: 'org-1', policy });
    };

    it('lets the early requests straight through', async () => {
        const usage = await usageAt(1);
        expect(() => assertRecoveryAllowed(usage, { reason: 'ok' })).not.toThrow();
    });

    it('demands an acknowledgement on the last request in the allowance', async () => {
        const usage = await usageAt(2);

        expect(() => assertRecoveryAllowed(usage, { reason: longReason })).toThrow(RecoveryQuotaError);
        try {
            assertRecoveryAllowed(usage, { reason: longReason });
        } catch (error) {
            expect((error as RecoveryQuotaError).status).toBe(400);
        }
    });

    it('demands a detailed reason on the last request even when acknowledged', async () => {
        const usage = await usageAt(2);

        expect(() => assertRecoveryAllowed(usage, { reason: 'forgot', acknowledgedPolicy: true }))
            .toThrow(RecoveryQuotaError);
    });

    it('accepts the last request when both conditions are met', async () => {
        const usage = await usageAt(2);

        expect(longReason.length).toBeGreaterThanOrEqual(MIN_FINAL_TIER_REASON_LENGTH);
        expect(() => assertRecoveryAllowed(usage, { reason: longReason, acknowledgedPolicy: true }))
            .not.toThrow();
    });

    it('blocks with 403 once the allowance is spent, acknowledgement or not', async () => {
        const usage = await usageAt(3);

        try {
            assertRecoveryAllowed(usage, { reason: longReason, acknowledgedPolicy: true });
            throw new Error('expected a RecoveryQuotaError');
        } catch (error) {
            expect(error).toBeInstanceOf(RecoveryQuotaError);
            expect((error as RecoveryQuotaError).status).toBe(403);
        }
    });
});

describe('recoveryQuotaBody', () => {
    it('tells the client when the allowance resets', async () => {
        (prisma.timerCorrectionRequest.count as jest.Mock).mockResolvedValue(3);
        const usage = await getWeeklyRecoveryUsage({
            user, organizationId: 'org-1', policy, at: new Date('2026-08-12T10:00:00.000Z'),
        });

        const body = recoveryQuotaBody(usage, 'nope');

        expect(body.code).toBe('RECOVERY_LIMIT_REACHED');
        expect(body.recovery_usage.week_end).toBe('2026-08-17T00:00:00.000Z');
        expect(body.recovery_usage.tier).toBe('blocked');
    });
});
