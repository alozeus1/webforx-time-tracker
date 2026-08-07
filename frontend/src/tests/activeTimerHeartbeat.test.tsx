import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import api from '../services/api';
import {
    TIMER_IDLE_WARNING_EVENT,
    useActiveTimerHeartbeat,
} from '../hooks/useActiveTimerHeartbeat';

vi.mock('../services/api', async () => {
    const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
    return {
        ...actual,
        default: {
            get: vi.fn(),
            post: vi.fn(),
        },
    };
});

type MockedApi = {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
};

const mockedApi = api as unknown as MockedApi;

const HeartbeatHarness = () => {
    useActiveTimerHeartbeat();
    return <div>heartbeat</div>;
};

describe('useActiveTimerHeartbeat', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem('token', 'test-token');
    });

    afterEach(() => {
        cleanup();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('sends a heartbeat after real browser activity when an active timer exists', async () => {
        mockedApi.get.mockResolvedValue({
            data: {
                entries: [],
                activeTimer: {
                    id: 'timer-1',
                    start_time: new Date().toISOString(),
                    task_description: 'Focus work',
                    project_id: null,
                    project: null,
                },
            },
        });
        mockedApi.post.mockResolvedValue({ data: { message: 'Ping successful' } });

        render(<HeartbeatHarness />);

        await waitFor(() => {
            expect(mockedApi.get).toHaveBeenCalledWith('/timers/active');
        });

        window.dispatchEvent(new MouseEvent('mousemove'));

        await waitFor(() => {
            expect(mockedApi.post).toHaveBeenCalledWith('/timers/ping', expect.objectContaining({
                active_timer_id: 'timer-1',
                visibility_state: 'visible',
                has_focus: true,
            }));
        });
    });

    it('does not send heartbeats when no active timer is running', async () => {
        mockedApi.get.mockResolvedValue({
            data: {
                entries: [],
                activeTimer: null,
            },
        });
        mockedApi.post.mockResolvedValue({ data: { message: 'Ping successful' } });

        render(<HeartbeatHarness />);

        await waitFor(() => {
            expect(mockedApi.get).toHaveBeenCalledWith('/timers/active');
        });

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A' }));
        await new Promise((resolve) => window.setTimeout(resolve, 50));

        expect(mockedApi.post).not.toHaveBeenCalled();
    });

    it('emits a local idle warning event before server auto-stop windows elapse', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-28T12:00:00.000Z'));
        const idleSpy = vi.fn();
        window.addEventListener(TIMER_IDLE_WARNING_EVENT, idleSpy as EventListener);

        mockedApi.get.mockResolvedValue({
            data: {
                entries: [],
                activeTimer: {
                    id: 'timer-1',
                    start_time: new Date('2026-04-28T11:55:00.000Z').toISOString(),
                    task_description: 'Focus work',
                    project_id: null,
                    project: null,
                },
            },
        });
        mockedApi.post.mockResolvedValue({ data: { message: 'Ping successful' } });

        await act(async () => {
            render(<HeartbeatHarness />);
            await Promise.resolve();
        });
        expect(mockedApi.get).toHaveBeenCalledWith('/timers/active');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30_000);
        });

        expect(idleSpy).toHaveBeenCalled();
        window.removeEventListener(TIMER_IDLE_WARNING_EVENT, idleSpy as EventListener);
    });

    describe('background polling', () => {
        // Each background poll wakes the database compute, which is billed by the hour.
        // A hidden tab with no running timer has nothing to enforce and nothing to show,
        // so it must go quiet entirely rather than poll forever.
        const setHidden = (hidden: boolean) => {
            Object.defineProperty(document, 'visibilityState', {
                configurable: true,
                get: () => (hidden ? 'hidden' : 'visible'),
            });
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
        };

        afterEach(() => setHidden(false));

        it('stops polling when the tab is hidden and no timer is running', async () => {
            mockedApi.get.mockResolvedValue({ data: { activeTimer: null } });
            vi.useFakeTimers();

            await act(async () => {
                render(<HeartbeatHarness />);
                await Promise.resolve();
            });

            setHidden(true);
            const callsBefore = mockedApi.get.mock.calls.length;

            await act(async () => {
                await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
            });

            expect(mockedApi.get.mock.calls.length).toBe(callsBefore);
        });

        const pollsOver30Min = async (activeTimer: unknown) => {
            mockedApi.get.mockResolvedValue({ data: { activeTimer } });
            mockedApi.post.mockResolvedValue({ data: { message: 'Ping successful' } });
            vi.useFakeTimers();

            await act(async () => {
                render(<HeartbeatHarness />);
                await Promise.resolve();
            });

            const callsBefore = mockedApi.get.mock.calls.length;
            await act(async () => {
                await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
            });

            return mockedApi.get.mock.calls.length - callsBefore;
        };

        it('polls every interval while a timer is running', async () => {
            const polls = await pollsOver30Min({
                id: 'timer-1',
                start_time: new Date().toISOString(),
                task_description: 'Focus work',
                project_id: null,
                project: null,
            });

            // 30 min at a 5-min interval.
            expect(polls).toBeGreaterThanOrEqual(5);
        });

        it('throttles polling on a visible tab with no timer running', async () => {
            const polls = await pollsOver30Min(null);

            // Throttled to every IDLE_REFRESH_TICKS-th tick — 15 min, so ~2 in 30 min.
            expect(polls).toBeLessThanOrEqual(2);
            expect(polls).toBeGreaterThan(0);
        });
    });
});
