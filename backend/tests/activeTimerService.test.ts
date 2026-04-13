jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        activeTimer: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        notification: { create: jest.fn() },
        auditLog: { create: jest.fn() },
    },
}));

import prisma from '../src/config/db';
import { pauseActiveTimer, resumeActiveTimer } from '../src/services/activeTimerService';

describe('pauseActiveTimer', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sets is_paused and paused_at on the active timer', async () => {
        const fakeTimer = {
            id: 'timer-1',
            user_id: 'user-1',
            task_description: 'Test task',
            is_paused: false,
            paused_at: null,
            paused_duration_seconds: 0,
        };
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(fakeTimer);
        (prisma.activeTimer.update as jest.Mock).mockResolvedValue({ ...fakeTimer, is_paused: true });
        (prisma.notification.create as jest.Mock).mockResolvedValue({});
        (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

        await pauseActiveTimer('user-1', 'browser_inactive');

        expect(prisma.activeTimer.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { user_id: 'user-1' },
                data: expect.objectContaining({ is_paused: true }),
            }),
        );
        expect(prisma.notification.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ type: 'timer_paused' }),
            }),
        );
    });

    it('is a no-op if the timer is already paused', async () => {
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue({
            id: 'timer-1', user_id: 'user-1', is_paused: true,
        });

        await pauseActiveTimer('user-1', 'browser_inactive');

        expect(prisma.activeTimer.update).not.toHaveBeenCalled();
    });

    it('is a no-op if no active timer exists', async () => {
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(null);

        await pauseActiveTimer('user-1', 'browser_inactive');

        expect(prisma.activeTimer.update).not.toHaveBeenCalled();
    });
});

describe('resumeActiveTimer', () => {
    beforeEach(() => jest.clearAllMocks());

    it('clears is_paused and accumulates paused_duration_seconds', async () => {
        const pausedAt = new Date(Date.now() - 120_000); // 2 minutes ago
        const fakeTimer = {
            id: 'timer-1',
            user_id: 'user-1',
            is_paused: true,
            paused_at: pausedAt,
            paused_duration_seconds: 60, // already had 60s from a prior pause cycle
        };
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue(fakeTimer);
        (prisma.activeTimer.update as jest.Mock).mockResolvedValue({});
        (prisma.auditLog.create as jest.Mock).mockResolvedValue({});

        const totalPaused = await resumeActiveTimer('user-1');

        // 60 existing + ~120 new = ~180
        expect(totalPaused).toBeGreaterThanOrEqual(170);
        expect(prisma.activeTimer.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    is_paused: false,
                    paused_at: null,
                }),
            }),
        );
    });

    it('returns 0 and is a no-op if timer is not paused', async () => {
        (prisma.activeTimer.findUnique as jest.Mock).mockResolvedValue({
            id: 'timer-1', user_id: 'user-1', is_paused: false, paused_at: null, paused_duration_seconds: 0,
        });

        const result = await resumeActiveTimer('user-1');
        expect(result).toBe(0);
        expect(prisma.activeTimer.update).not.toHaveBeenCalled();
    });
});
