jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        activeTimer: {
            findMany: jest.fn(),
        },
        notification: {
            findFirst: jest.fn(),
            create: jest.fn(),
        },
        auditLog: {
            create: jest.fn(),
        },
    },
}));

jest.mock('../src/services/activeTimerService', () => ({
    stopActiveTimerWithReason: jest.fn(),
}));

import prisma from '../src/config/db';
import { stopActiveTimerWithReason } from '../src/services/activeTimerService';
import { checkIdleTimers } from '../src/workers/idleTracker';

describe('checkIdleTimers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('issues an idle warning before auto-stop', async () => {
        (prisma.activeTimer.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'timer-1',
                user_id: 'user-1',
                start_time: new Date(Date.now() - 60 * 60 * 1000),
                last_active_ping: new Date(Date.now() - 25 * 60 * 1000),
                last_heartbeat_at: new Date(Date.now() - 25 * 60 * 1000),
                last_client_activity_at: new Date(Date.now() - 16 * 60 * 1000),
                client_visibility: 'visible',
                client_has_focus: true,
            },
        ]);
        (prisma.notification.findFirst as jest.Mock).mockResolvedValue(null);

        await checkIdleTimers();

        expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ type: 'idle_warning' }),
        }));
        expect(stopActiveTimerWithReason).not.toHaveBeenCalled();
    });

    it('auto-stops timers whose heartbeat is missing beyond the threshold', async () => {
        (prisma.activeTimer.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'timer-1',
                user_id: 'user-1',
                start_time: new Date(Date.now() - 2 * 60 * 60 * 1000),
                last_active_ping: new Date(Date.now() - 40 * 60 * 1000),
                last_heartbeat_at: new Date(Date.now() - 40 * 60 * 1000),
                last_client_activity_at: new Date(Date.now() - 40 * 60 * 1000),
                client_visibility: 'visible',
                client_has_focus: true,
            },
        ]);

        await checkIdleTimers();

        expect(stopActiveTimerWithReason).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'user-1',
            reason: 'idle_timeout',
        }));
    });
});
