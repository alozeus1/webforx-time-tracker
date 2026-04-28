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
            expect(mockedApi.get).toHaveBeenCalledWith('/timers/me');
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
            expect(mockedApi.get).toHaveBeenCalledWith('/timers/me');
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
        expect(mockedApi.get).toHaveBeenCalledWith('/timers/me');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30_000);
        });

        expect(idleSpy).toHaveBeenCalled();
        window.removeEventListener(TIMER_IDLE_WARNING_EVENT, idleSpy as EventListener);
    });
});
