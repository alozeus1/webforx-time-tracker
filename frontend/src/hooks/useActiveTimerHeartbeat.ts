import { useCallback, useEffect, useRef } from 'react';
import api from '../services/api';
import type { TimerEntriesResponse } from '../types/api';
import { getStoredToken } from '../utils/session';
import { TIME_ENTRY_CHANGED_EVENT, TIME_ENTRY_CHANGED_STORAGE_KEY } from '../utils/timeEntryEvents';

export const HEARTBEAT_INTERVAL_MS = 60_000;
export const ACTIVE_TIMER_REFRESH_MS = 120_000;
export const ACTIVITY_SAMPLE_MS = 15_000;

const isDocumentVisible = () =>
    typeof document === 'undefined' || document.visibilityState === 'visible';

export const useActiveTimerHeartbeat = () => {
    const hasActiveTimerRef = useRef(false);
    const lastHeartbeatAtRef = useRef(0);
    const lastActivitySampleAtRef = useRef(0);
    const syncInFlightRef = useRef<Promise<void> | null>(null);

    const syncActiveTimer = useCallback(async () => {
        if (!getStoredToken()) {
            hasActiveTimerRef.current = false;
            return;
        }

        if (syncInFlightRef.current) {
            return syncInFlightRef.current;
        }

        syncInFlightRef.current = (async () => {
            try {
                const response = await api.get<TimerEntriesResponse>('/timers/me');
                hasActiveTimerRef.current = Boolean(response.data.activeTimer?.start_time);
                if (!hasActiveTimerRef.current) {
                    lastHeartbeatAtRef.current = 0;
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
            await api.post('/timers/ping');
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

        window.addEventListener('focus', onVisibility);
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
            window.removeEventListener('focus', onVisibility);
            window.removeEventListener(TIME_ENTRY_CHANGED_EVENT, onEntryChanged as EventListener);
            window.removeEventListener('storage', onStorage);
            document.removeEventListener('visibilitychange', onVisibility);
            window.clearInterval(refreshInterval);
        };
    }, [handleActivity, sendHeartbeat, syncActiveTimer]);
};
