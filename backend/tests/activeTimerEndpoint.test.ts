jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        activeTimer: { findFirst: jest.fn() },
        timeEntry: { findMany: jest.fn(), count: jest.fn() },
    },
}));

jest.mock('../src/services/timerPolicyService', () => ({
    getGlobalTimerPolicy: jest.fn(),
}));

jest.mock('../src/services/activeTimerService', () => ({
    stopActiveTimerWithReason: jest.fn(),
    pauseActiveTimer: jest.fn(),
    resumeActiveTimer: jest.fn(),
    // Not a spy: the guardrail's bot-timer exemption is part of what these tests exercise.
    isBotStartedTimer: jest.requireActual('../src/services/activeTimerService').isBotStartedTimer,
}));

import prisma from '../src/config/db';
import { getGlobalTimerPolicy } from '../src/services/timerPolicyService';
import { pauseActiveTimer, stopActiveTimerWithReason } from '../src/services/activeTimerService';
import { getActiveTimer } from '../src/controllers/timeEntryController';

const findFirst = prisma.activeTimer.findFirst as jest.Mock;

const buildRes = () => {
    const res: Record<string, jest.Mock> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

const buildReq = () => ({
    user: { id: 'user-1', userId: 'user-1', organization_id: 'org-1' },
});

beforeEach(() => {
    jest.clearAllMocks();
    (getGlobalTimerPolicy as jest.Mock).mockResolvedValue({
        heartbeatIntervalSeconds: 180,
        idlePauseAfterMinutes: 10,
        maxSessionDurationHours: 8,
    });
});

describe('GET /timers/active', () => {
    it('never touches the time entry tables', async () => {
        // The entire point of this endpoint: the poller reads only activeTimer, so
        // fetching entries here would reintroduce the egress it was built to remove.
        findFirst.mockResolvedValue(null);

        const res = buildRes();
        await getActiveTimer(buildReq() as never, res as never);

        expect(prisma.timeEntry.findMany).not.toHaveBeenCalled();
        expect(prisma.timeEntry.count).not.toHaveBeenCalled();
    });

    it('returns only the activeTimer key', async () => {
        const timer = {
            id: 'timer-1',
            user_id: 'user-1',
            task_description: 'Writing tests',
            start_time: new Date().toISOString(),
            is_paused: false,
            project: { id: 'proj-1', name: 'Platform' },
        };
        findFirst.mockResolvedValue(timer);

        const res = buildRes();
        await getActiveTimer(buildReq() as never, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        expect(Object.keys(payload)).toEqual(['activeTimer']);
        expect(payload.activeTimer.id).toBe('timer-1');
    });

    it('returns a null timer rather than erroring when none is running', async () => {
        findFirst.mockResolvedValue(null);

        const res = buildRes();
        await getActiveTimer(buildReq() as never, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0]).toEqual({ activeTimer: null });
        // No timer means no guardrail work to do.
        expect(getGlobalTimerPolicy).not.toHaveBeenCalled();
    });

    it('still enforces guardrails and re-reads the timer when one fires', async () => {
        // A session older than maxSessionDurationHours must be auto-stopped; the poll is
        // what drives that, so the lean endpoint has to keep doing it.
        const staleStart = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
        findFirst
            .mockResolvedValueOnce({
                id: 'timer-1',
                user_id: 'user-1',
                start_time: staleStart,
                is_paused: false,
            })
            .mockResolvedValueOnce(null);

        const res = buildRes();
        await getActiveTimer(buildReq() as never, res as never);

        expect(getGlobalTimerPolicy).toHaveBeenCalled();
        // Re-read after the guardrail changed state.
        expect(findFirst).toHaveBeenCalledTimes(2);
        expect(res.json.mock.calls[0][0]).toEqual({ activeTimer: null });
    });

    it('does not pause a bot-started timer that has never sent a heartbeat', async () => {
        // The web poll used to pause a Mattermost-started timer within ~20 minutes: it has
        // no client, so its silence looked identical to a user who walked away.
        findFirst.mockResolvedValue({
            id: 'timer-1',
            user_id: 'user-1',
            start_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            is_paused: false,
            last_heartbeat_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            last_client_activity_at: null,
            persisted_state: { source: 'mattermost' },
        });

        const res = buildRes();
        await getActiveTimer(buildReq() as never, res as never);

        expect(pauseActiveTimer).not.toHaveBeenCalled();
        expect(stopActiveTimerWithReason).not.toHaveBeenCalled();
        // Guardrail returned 'none', so no re-read was needed.
        expect(findFirst).toHaveBeenCalledTimes(1);
        expect(res.json.mock.calls[0][0].activeTimer).not.toBeNull();
    });

    it('returns 500 when the lookup fails', async () => {
        findFirst.mockRejectedValue(new Error('connection lost'));

        const res = buildRes();
        await getActiveTimer(buildReq() as never, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});
