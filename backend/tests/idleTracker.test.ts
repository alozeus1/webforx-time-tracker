jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        activeTimer: {
            findMany: jest.fn(),
            update: jest.fn(),
        },
        timerPolicyConfig: {
            findFirst: jest.fn(),
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
    pauseActiveTimer: jest.fn(),
    resumeActiveTimer: jest.fn(),
}));

import prisma from '../src/config/db';
import { stopActiveTimerWithReason, pauseActiveTimer } from '../src/services/activeTimerService';
import { checkIdleTimers } from '../src/workers/idleTracker';

// Thresholds (matching new env defaults):
//   idleWarningMinutes=5, heartbeatIntervalMinutes=3, heartbeatStaleMinutes=8, autoStopGraceMinutes=2
//   → warningThreshold=5min, staleThreshold=8min, autoStopThreshold=10min
//   → pingFrequencyThreshold=6min (2 × heartbeatIntervalMinutes)
//   → maxPauseMs = 4h (MAX_PAUSE_HOURS default)
//   → maxActiveTimerMs = 8h (MAX_ACTIVE_TIMER_HOURS default)

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function ago(ms: number) {
    return new Date(Date.now() - ms);
}

const baseTimer = {
    id: 'timer-1',
    user_id: 'user-1',
    start_time: ago(2 * HOUR),
    last_active_ping: ago(5.5 * MIN),
    last_heartbeat_at: ago(5.5 * MIN),
    last_client_activity_at: ago(5.5 * MIN),
    client_visibility: 'visible',
    client_has_focus: true,
    is_paused: false,
    paused_at: null,
    paused_duration_seconds: 0,
};

describe('checkIdleTimers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (prisma.notification.findFirst as jest.Mock).mockResolvedValue(null);
        (prisma.notification.create as jest.Mock).mockResolvedValue({});
        (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
        (prisma.activeTimer.update as jest.Mock).mockResolvedValue({});
        (prisma.timerPolicyConfig.findFirst as jest.Mock).mockResolvedValue(null);
    });

    // ─── Idle warning ──────────────────────────────────────────────────────────

    it('issues an idle warning when client activity is stale but below auto-stop threshold', async () => {
        // heartbeat 5.5min ago → above warning (5min) but below stale (8min) and below auto-stop (10min)
        // pingIsTooOld = 5.5min < 6min → false; browserInactive = false → no pause/stop
        (prisma.activeTimer.findMany as jest.Mock).mockResolvedValue([{
            ...baseTimer,
            last_heartbeat_at: ago(5.5 * MIN),
            last_client_activity_at: ago(5.5 * MIN),
        }]);

        await checkIdleTimers();

        expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ type: 'idle_warning' }),
        }));
        expect(stopActiveTimerWithReason).not.toHaveBeenCalled();
        expect(pauseActiveTimer).not.toHaveBeenCalled();
    });

    it('does not duplicate idle warnings within the dedup window', async () => {
        (prisma.activeTimer.findMany as jest.Mock).mockResolvedValue([{
            ...baseTimer,
            last_heartbeat_at: ago(5.5 * MIN),
            last_client_activity_at: ago(5.5 * MIN),
        }]);
        // Simulate existing notification within dedup window
        (prisma.notification.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-notif' });

        await checkIdleTimers();

        expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    // ─── Idle pause (browser visible, fresh ping, stale activity) ──────────────

    it('pauses a visible-browser timer when client activity is older than idle pause threshold', async () => {
        // heartbeat 5min ago (fresh, pingIsTooOld=false) → browserInactive=false
        // clientActivity 11min ago → > autoStopThreshold (10min) → STOP
        (prisma.activeTimer.findMany as jest.Mock).mockResolvedValue([{
            ...baseTimer,
            last_heartbeat_at: ago(5 * MIN),
            last_client_activity_at: ago(11 * MIN),
            client_visibility: 'visible',
            client_has_focus: true,
        }]);

        await checkIdleTimers();

        expect(pauseActiveTimer).toHaveBeenCalledWith('user-1', 'idle_timeout');
        expect(stopActiveTimerWithReason).not.toHaveBeenCalled();
    });

    // ─── Browser inactive → pause ──────────────────────────────────────────────

    it('pauses timers when browser is explicitly inactive and heartbeat is still fresh', async () => {
        (prisma.activeTimer.findMany as jest.Mock).mockResolvedValue([{
            ...baseTimer,
            last_heartbeat_at: ago(5 * MIN),
            last_client_activity_at: ago(11 * MIN),
            client_visibility: 'hidden',
            client_has_focus: false,
        }]);

        await checkIdleTimers();

        expect(pauseActiveTimer).toHaveBeenCalledWith('user-1', 'browser_inactive');
        expect(stopActiveTimerWithReason).not.toHaveBeenCalled();
    });

    // ─── Ping-frequency enforcement ────────────────────────────────────────────

    it('pauses timer when missed heartbeat tolerance is exceeded', async () => {
        // heartbeat 16min ago means 4 missed heartbeats at the 3min interval.
        (prisma.activeTimer.findMany as jest.Mock).mockResolvedValue([{
            ...baseTimer,
            last_heartbeat_at: ago(16 * MIN),
            last_client_activity_at: ago(1 * MIN),
            client_visibility: 'visible',
            client_has_focus: true,
        }]);

        await checkIdleTimers();

        expect(pauseActiveTimer).toHaveBeenCalledWith('user-1', 'missed_heartbeat_threshold');
        expect(stopActiveTimerWithReason).not.toHaveBeenCalled();
    });

    // ─── Max pause duration ────────────────────────────────────────────────────

    it('auto-stops a paused timer that has exceeded MAX_PAUSE_HOURS', async () => {
        (prisma.activeTimer.findMany as jest.Mock).mockResolvedValue([{
            ...baseTimer,
            is_paused: true,
            paused_at: ago(5 * HOUR), // 5h > 4h default maxPauseHours
        }]);

        await checkIdleTimers();

        expect(stopActiveTimerWithReason).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'user-1',
            reason: 'pause_expired',
        }));
        expect(pauseActiveTimer).not.toHaveBeenCalled();
    });

    it('auto-stops any timer that exceeds MAX_ACTIVE_TIMER_HOURS even if heartbeats are fresh', async () => {
        (prisma.activeTimer.findMany as jest.Mock).mockResolvedValue([{
            ...baseTimer,
            start_time: ago(9 * HOUR),
            last_heartbeat_at: ago(1 * MIN),
            last_client_activity_at: ago(1 * MIN),
            client_visibility: 'visible',
            client_has_focus: true,
            is_paused: false,
            paused_at: null,
        }]);

        await checkIdleTimers();

        expect(stopActiveTimerWithReason).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'user-1',
            reason: 'active_duration_limit',
        }));
        expect(pauseActiveTimer).not.toHaveBeenCalled();
    });

    it('does not stop a paused timer that has not yet exceeded MAX_PAUSE_HOURS', async () => {
        (prisma.activeTimer.findMany as jest.Mock).mockResolvedValue([{
            ...baseTimer,
            is_paused: true,
            paused_at: ago(1 * HOUR), // 1h < 4h default maxPauseHours
        }]);

        await checkIdleTimers();

        expect(stopActiveTimerWithReason).not.toHaveBeenCalled();
        expect(pauseActiveTimer).not.toHaveBeenCalled();
        expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('does not run idle or warning checks against a paused-but-not-expired timer', async () => {
        // Even if heartbeat is very stale, a paused timer gets skipped entirely (unless expired)
        (prisma.activeTimer.findMany as jest.Mock).mockResolvedValue([{
            ...baseTimer,
            is_paused: true,
            paused_at: ago(2 * HOUR),
            last_heartbeat_at: ago(2 * HOUR),
            last_client_activity_at: ago(2 * HOUR),
        }]);

        await checkIdleTimers();

        expect(stopActiveTimerWithReason).not.toHaveBeenCalled();
        expect(pauseActiveTimer).not.toHaveBeenCalled();
        expect(prisma.notification.create).not.toHaveBeenCalled();
    });
});
