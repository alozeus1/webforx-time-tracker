import { useCallback, useEffect, useRef } from 'react';
import api from '../services/api';
import type { TimerEntriesResponse } from '../types/api';
import { getStoredToken } from '../utils/session';
import { TIME_ENTRY_CHANGED_EVENT, TIME_ENTRY_CHANGED_STORAGE_KEY, emitTimeEntryChanged } from '../utils/timeEntryEvents';

export const TIMER_IDLE_WARNING_EVENT = 'wfx:timer-idle-warning';
export const TIMER_IDLE_RESUMED_EVENT = 'wfx:timer-idle-resumed';
export const TIMER_PAUSED_EVENT = 'wfx:timer-paused';

const resolveMinutes = (value: string | undefined, fallback: number) => {
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const HEARTBEAT_INTERVAL_MS = resolveMinutes(import.meta.env.VITE_HEARTBEAT_INTERVAL_MINUTES, 3) * 60_000;
export const ACTIVE_TIMER_REFRESH_MS = 120_000;
export const ACTIVITY_SAMPLE_MS = 15_000;
export const IDLE_WARNING_MS = resolveMinutes(import.meta.env.VITE_IDLE_WARNING_MINUTES, 5) * 60_000;
export const MAX_ACTIVE_TIMER_MS = resolveMinutes(import.meta.env.VITE_MAX_ACTIVE_TIMER_HOURS, 8) * 60 * 60_000;

const isDocumentVisible = () =>
    typeof document === 'undefined' || document.visibilityState === 'visible';

export const useActiveTimerHeartbeat = () => {
    const hasActiveTimerRef = useRef(false);
    const activeTimerIdRef = useRef<string | null>(null);
    const activeTimerStartedAtRef = useRef<number | null>(null);
    const isPausedRef = useRef(false);
    const lastHeartbeatAtRef = useRef(0);
    const lastActivitySampleAtRef = useRef(0);
    const lastActivityAtRef = useRef(Date.now());
    const idleWarningShownRef = useRef(false);
    const syncInFlightRef = useRef<Promise<void> | null>(null);

    const syncActiveTimer = useCallback(async () => {
        if (!getStoredToken()) {
            hasActiveTimerRef.current = false;
            activeTimerIdRef.current = null;
            return;
        }

        if (syncInFlightRef.current) {
            return syncInFlightRef.current;
        }

        syncInFlightRef.current = (async () => {
            try {
                const response = await api.get<TimerEntriesResponse>('/timers/me');
                hasActiveTimerRef.current = Boolean(response.data.activeTimer?.start_time);
                activeTimerIdRef.current = response.data.activeTimer?.id || null;
                activeTimerStartedAtRef.current = response.data.activeTimer?.start_time
                    ? new Date(response.data.activeTimer.start_time).getTime()
                    : null;

                const newIsPaused = Boolean(response.data.activeTimer?.is_paused);
                if (newIsPaused && !isPausedRef.current) {
                    window.dispatchEvent(new CustomEvent(TIMER_PAUSED_EVENT));
                }
                isPausedRef.current = newIsPaused;

                if (!hasActiveTimerRef.current) {
                    lastHeartbeatAtRef.current = 0;
                    idleWarningShownRef.current = false;
                    isPausedRef.current = false;
                    activeTimerStartedAtRef.current = null;
                }
            } catch (error) {
                console.error('Failed to sync active timer heartbeat state:', error);
            } finally {
                syncInFlightRef.current = null;
            }
        })();

        return syncInFlightRef.current;
    }, []);

    const enforceActiveTimerCap = useCallback(async () => {
        if (!getStoredToken() || !hasActiveTimerRef.current || !activeTimerStartedAtRef.current) {
            return false;
        }

        if (Date.now() - activeTimerStartedAtRef.current < MAX_ACTIVE_TIMER_MS) {
            return false;
        }

        try {
            await api.post('/timers/stop');
            hasActiveTimerRef.current = false;
            activeTimerIdRef.current = null;
            activeTimerStartedAtRef.current = null;
            isPausedRef.current = false;
            lastHeartbeatAtRef.current = 0;
            idleWarningShownRef.current = false;
            emitTimeEntryChanged();
            return true;
        } catch (error) {
            const status = (error as { response?: { status?: number } })?.response?.status;
            if (status === 404) {
                hasActiveTimerRef.current = false;
                activeTimerIdRef.current = null;
                activeTimerStartedAtRef.current = null;
                isPausedRef.current = false;
                lastHeartbeatAtRef.current = 0;
                idleWarningShownRef.current = false;
                return true;
            }

            console.error('Failed to enforce max active timer cap:', error);
            return false;
        }
    }, []);

    const sendHeartbeat = useCallback(async (force = false) => {
        if (!getStoredToken() || !hasActiveTimerRef.current || !isDocumentVisible()) {
            return;
        }

        if (await enforceActiveTimerCap()) {
            return;
        }

        const now = Date.now();
        if (!force && now - lastHeartbeatAtRef.current < HEARTBEAT_INTERVAL_MS) {
            return;
        }

        try {
            await api.post('/timers/ping', {
                active_timer_id: activeTimerIdRef.current,
                last_activity_at: new Date(lastActivityAtRef.current).toISOString(),
                visibility_state: typeof document === 'undefined' ? 'visible' : document.visibilityState,
                has_focus: typeof document === 'undefined' ? true : document.hasFocus(),
            });
            lastHeartbeatAtRef.current = now;
        } catch (error) {
            const status = (error as { response?: { status?: number } })?.response?.status;
            if (status === 404) {
                hasActiveTimerRef.current = false;
                lastHeartbeatAtRef.current = 0;
                return;
            }

            console.error('Failed to send active timer heartbeat:', error);
        }
    }, [enforceActiveTimerCap]);

    const handleActivity = useCallback(() => {
        lastActivityAtRef.current = Date.now();
        if (idleWarningShownRef.current) {
            idleWarningShownRef.current = false;
            window.dispatchEvent(new CustomEvent(TIMER_IDLE_RESUMED_EVENT));
        }

        const now = Date.now();
        if (now - lastActivitySampleAtRef.current < ACTIVITY_SAMPLE_MS) {
            return;
        }

        lastActivitySampleAtRef.current = now;
        void sendHeartbeat();
    }, [sendHeartbeat]);

    useEffect(() => {
        if (!getStoredToken()) {
            return;
        }

        void syncActiveTimer();

        const onActivity = () => {
            handleActivity();
        };

        const onVisibility = () => {
            const visible = isDocumentVisible();
            const hasFocus = typeof document === 'undefined' ? true : document.hasFocus();

            // Only treat regaining foreground focus as user activity.
            // Blur/hidden transitions should not reset idle timers.
            if (visible && hasFocus) {
                const now = Date.now();
                lastActivityAtRef.current = now;
                lastActivitySampleAtRef.current = now;
            }

            void syncActiveTimer().then(() => sendHeartbeat(true));
        };

        const onEntryChanged = () => {
            lastActivitySampleAtRef.current = Date.now();
            void syncActiveTimer().then(() => sendHeartbeat(true));
        };

        const onStorage = (event: StorageEvent) => {
            if (event.key === TIME_ENTRY_CHANGED_STORAGE_KEY) {
                onEntryChanged();
            }
        };

        // Pause via sendBeacon when the tab/window is closing.
        // pagehide is more reliable than beforeunload (works on mobile and bfcache navigation).
        // Only fires if there is an active, unpaused timer.
        const onPageHide = () => {
            if (!hasActiveTimerRef.current || isPausedRef.current) return;
            const token = getStoredToken();
            if (!token) return;

            const blob = new Blob([JSON.stringify({ token })], { type: 'application/json' });
            navigator.sendBeacon(
                `${import.meta.env.VITE_API_URL}/timers/pause-beacon`,
                blob,
            );
        };

        const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
        activityEvents.forEach((eventName) => {
            window.addEventListener(eventName, onActivity, { passive: true });
        });

        const heartbeatInterval = window.setInterval(() => {
            if (!hasActiveTimerRef.current) {
                return;
            }

            void enforceActiveTimerCap();
            void sendHeartbeat(true);
        }, HEARTBEAT_INTERVAL_MS);

        const capInterval = window.setInterval(() => {
            if (!hasActiveTimerRef.current) {
                return;
            }

            void enforceActiveTimerCap();
        }, 60_000);

        const idleWarningInterval = window.setInterval(() => {
            if (!hasActiveTimerRef.current || !isDocumentVisible()) {
                return;
            }

            const inactiveForMs = Date.now() - lastActivityAtRef.current;
            if (inactiveForMs >= IDLE_WARNING_MS && !idleWarningShownRef.current) {
                idleWarningShownRef.current = true;

                window.dispatchEvent(new CustomEvent(TIMER_IDLE_WARNING_EVENT, {
                    detail: {
                        inactiveForMinutes: Math.floor(inactiveForMs / 60_000),
                    },
                }));
            }
        }, 30_000);

        window.addEventListener('focus', onVisibility);
        // Fix: blur signals inactivity (tab lost focus), not activity.
        // Previously mapped to onActivity which incorrectly reset the idle counter.
        window.addEventListener('blur', onVisibility);
        window.addEventListener(TIME_ENTRY_CHANGED_EVENT, onEntryChanged as EventListener);
        window.addEventListener('storage', onStorage);
        window.addEventListener('pagehide', onPageHide);
        document.addEventListener('visibilitychange', onVisibility);

        const refreshInterval = window.setInterval(() => {
            if (!isDocumentVisible()) {
                return;
            }

            void syncActiveTimer();
        }, ACTIVE_TIMER_REFRESH_MS);

        return () => {
            activityEvents.forEach((eventName) => {
                window.removeEventListener(eventName, onActivity);
            });
            window.clearInterval(heartbeatInterval);
            window.clearInterval(capInterval);
            window.clearInterval(idleWarningInterval);
            window.removeEventListener('focus', onVisibility);
            window.removeEventListener('blur', onVisibility);
            window.removeEventListener(TIME_ENTRY_CHANGED_EVENT, onEntryChanged as EventListener);
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('pagehide', onPageHide);
            document.removeEventListener('visibilitychange', onVisibility);
            window.clearInterval(refreshInterval);
        };
    }, [enforceActiveTimerCap, handleActivity, sendHeartbeat, syncActiveTimer]);
};
