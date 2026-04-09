import { useCallback, useEffect, useRef } from 'react';
import api from '../services/api';
import type { TimerEntriesResponse } from '../types/api';
import { getStoredToken } from '../utils/session';
import { TIME_ENTRY_CHANGED_EVENT, TIME_ENTRY_CHANGED_STORAGE_KEY } from '../utils/timeEntryEvents';

export const TIMER_IDLE_WARNING_EVENT = 'wfx:timer-idle-warning';
export const TIMER_IDLE_RESUMED_EVENT = 'wfx:timer-idle-resumed';

const resolveMinutes = (value: string | undefined, fallback: number) => {
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const HEARTBEAT_INTERVAL_MS = resolveMinutes(import.meta.env.VITE_HEARTBEAT_INTERVAL_MINUTES, 15) * 60_000;
export const ACTIVE_TIMER_REFRESH_MS = 120_000;
export const ACTIVITY_SAMPLE_MS = 15_000;
export const IDLE_WARNING_MS = resolveMinutes(import.meta.env.VITE_IDLE_WARNING_MINUTES, 15) * 60_000;

const isDocumentVisible = () =>
    typeof document === 'undefined' || document.visibilityState === 'visible';

export const useActiveTimerHeartbeat = () => {
    const hasActiveTimerRef = useRef(false);
    const activeTimerIdRef = useRef<string | null>(null);
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
                if (!hasActiveTimerRef.current) {
                    lastHeartbeatAtRef.current = 0;
                    idleWarningShownRef.current = false;
                }
            } catch (error) {
                console.error('Failed to sync active timer heartbeat state:', error);
            } finally {
                syncInFlightRef.current = null;
            }
        })();

        return syncInFlightRef.current;
    }, []);

    const sendHeartbeat = useCallback(async (force = false) => {
        if (!getStoredToken() || !hasActiveTimerRef.current || !isDocumentVisible()) {
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
    }, []);

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
            if (!isDocumentVisible()) {
                return;
            }

            lastActivityAtRef.current = Date.now();
            lastActivitySampleAtRef.current = Date.now();
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

        const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
        activityEvents.forEach((eventName) => {
            window.addEventListener(eventName, onActivity, { passive: true });
        });

        const heartbeatInterval = window.setInterval(() => {
            if (!hasActiveTimerRef.current) {
                return;
            }

            void sendHeartbeat(true);
        }, HEARTBEAT_INTERVAL_MS);

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
        window.addEventListener('blur', onActivity);
        window.addEventListener(TIME_ENTRY_CHANGED_EVENT, onEntryChanged as EventListener);
        window.addEventListener('storage', onStorage);
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
            window.clearInterval(idleWarningInterval);
            window.removeEventListener('focus', onVisibility);
            window.removeEventListener('blur', onActivity);
            window.removeEventListener(TIME_ENTRY_CHANGED_EVENT, onEntryChanged as EventListener);
            window.removeEventListener('storage', onStorage);
            document.removeEventListener('visibilitychange', onVisibility);
            window.clearInterval(refreshInterval);
        };
    }, [handleActivity, sendHeartbeat, syncActiveTimer]);
};
