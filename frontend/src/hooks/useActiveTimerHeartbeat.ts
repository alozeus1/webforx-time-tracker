import { useCallback, useEffect, useRef } from 'react';
import api from '../services/api';
import type { ActiveTimerResponse, DailyCapSummary } from '../types/api';
import { getStoredToken } from '../utils/session';
import { TIME_ENTRY_CHANGED_EVENT, TIME_ENTRY_CHANGED_STORAGE_KEY, emitTimeEntryChanged } from '../utils/timeEntryEvents';

// ---------------------------------------------------------------------------
// Public event names consumed by Timer.tsx
// ---------------------------------------------------------------------------
export const TIMER_IDLE_WARNING_EVENT = 'wfx:timer-idle-warning';
export const TIMER_IDLE_RESUMED_EVENT = 'wfx:timer-idle-resumed';
export const TIMER_PAUSED_EVENT = 'wfx:timer-paused';
/** Fired every 10 s while the idle warning is active so the UI can show a countdown. */
export const TIMER_IDLE_COUNTDOWN_EVENT = 'wfx:timer-idle-countdown';
/**
 * Fired when the server reports the user has reached their daily limit, or (for
 * interns) passed their daily expectation. Carries the whole `daily` block from the
 * ping response so the dialog can render exact figures rather than guess.
 */
export const TIMER_DAILY_CAP_EVENT = 'wfx:timer-daily-cap';
export const TIMER_DAILY_FLOOR_EVENT = 'wfx:timer-daily-floor';

// ---------------------------------------------------------------------------
// Feature flag — mirrors TIMER_ENHANCED_ACTIVITY_DETECTION on the backend.
// When false, behaviour is identical to the original implementation.
// ---------------------------------------------------------------------------
const ENHANCED = import.meta.env.VITE_TIMER_ENHANCED_ACTIVITY_DETECTION === 'true';

// ---------------------------------------------------------------------------
// Timing constants
// ---------------------------------------------------------------------------
const resolveMinutes = (value: string | undefined, fallback: number) => {
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const HEARTBEAT_INTERVAL_MS = resolveMinutes(import.meta.env.VITE_HEARTBEAT_INTERVAL_MINUTES, 3) * 60_000;
/**
 * How often the client re-syncs active-timer state.
 *
 * This is a billing-sensitive knob, not just a freshness one: every poll wakes the
 * database compute, which is charged by the hour, so a shorter interval keeps the
 * compute from ever auto-suspending. Env-tunable so it can be adjusted without a
 * code change if timer state ever needs to feel fresher.
 */
export const ACTIVE_TIMER_REFRESH_MS = resolveMinutes(import.meta.env.VITE_ACTIVE_TIMER_REFRESH_MINUTES, 5) * 60_000;
/**
 * With no timer running, the sync exists only to notice a timer started on another
 * device — it drives no guardrails and nothing is ticking on screen. Polling that case
 * at the full rate kept the database awake around the clock, so it runs every Nth tick
 * instead (5 min × 3 = 15 min). Starting a timer here, in another tab, or returning to
 * the tab all re-sync immediately through their own handlers.
 */
export const IDLE_REFRESH_TICKS = 3;
/** Sampling window for in-tab activity events (pointer, key, scroll). */
export const ACTIVITY_SAMPLE_MS = 15_000;
/** Threshold after which the user is considered idle *within the tab*. */
export const IDLE_WARNING_MS = resolveMinutes(import.meta.env.VITE_IDLE_WARNING_MINUTES, 5) * 60_000;
export const MAX_ACTIVE_TIMER_MS = resolveMinutes(import.meta.env.VITE_MAX_ACTIVE_TIMER_HOURS, 8) * 60 * 60_000;

/**
 * How long the heartbeat continues to fire when the tab is hidden before the
 * client treats the session as an idle_candidate.
 * Defaults to 10 minutes — matches HIDDEN_CONNECTED_GRACE_MINUTES on the backend.
 */
const HIDDEN_GRACE_MS = resolveMinutes(import.meta.env.VITE_HIDDEN_CONNECTED_GRACE_MINUTES, 10) * 60_000;

/**
 * When tab is hidden but enhanced mode is active, heartbeats are still sent
 * but at a reduced rate to avoid unnecessary wake-ups on battery-powered devices.
 * Default: once per heartbeat interval (same rate — small JSON payload, no issue).
 */
const HIDDEN_HEARTBEAT_INTERVAL_MS = HEARTBEAT_INTERVAL_MS;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const isDocumentVisible = () =>
    typeof document === 'undefined' || document.visibilityState === 'visible';

/**
 * Compute the ActivityWatch-inspired browser activity state to include in the
 * heartbeat payload.  Only used when ENHANCED=true.
 *
 *  active           — tab visible + recent user input (last ~60 s)
 *  visible_inactive — tab visible but no recent user input
 *  hidden_connected — tab hidden but heartbeat still sending (working elsewhere)
 *  idle_candidate   — tab hidden + no in-tab activity for > IDLE_WARNING_MS
 */
const computeBrowserActivityState = (lastActivityAtMs: number): string => {
    const visible = isDocumentVisible();
    const hasFocus = typeof document !== 'undefined' && document.hasFocus?.();
    const idleForMs = Date.now() - lastActivityAtMs;

    if (visible && hasFocus && idleForMs < ACTIVITY_SAMPLE_MS * 4) {
        return 'active';
    }
    if (visible) {
        return 'visible_inactive';
    }
    // Tab is not visible — we're still alive and sending heartbeats (the key fix).
    if (idleForMs < HIDDEN_GRACE_MS) {
        return 'hidden_connected';
    }
    return 'idle_candidate';
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export const useActiveTimerHeartbeat = () => {
    const hasActiveTimerRef = useRef(false);
    const activeTimerIdRef = useRef<string | null>(null);
    const activeTimerStartedAtRef = useRef<number | null>(null);
    /**
     * Paused seconds already banked on the server, plus the open pause if there is one.
     * The cap must be compared against counted time, not wall clock — otherwise a
     * session paused for two hours is stopped at six hours of real work.
     */
    const activeTimerPausedSecondsRef = useRef(0);
    const activeTimerPausedAtRef = useRef<number | null>(null);
    const isPausedRef = useRef(false);
    const lastHeartbeatAtRef = useRef(0);
    const lastActivitySampleAtRef = useRef(0);
    const lastActivityAtRef = useRef(Date.now());
    const idleWarningShownRef = useRef(false);
    const syncInFlightRef = useRef<Promise<void> | null>(null);
    // Server-authoritative policy thresholds (updated on each successful ping).
    const serverIdleWarningMsRef = useRef(IDLE_WARNING_MS);
    const serverIdlePauseMsRef = useRef(IDLE_WARNING_MS * 2);

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
                // Deliberately /timers/active, not /timers/me: this runs on a timer for every
                // user with the app open and only reads activeTimer. /timers/me would ship 50
                // hydrated time entries and a COUNT on every poll, all of it discarded below.
                const response = await api.get<ActiveTimerResponse>('/timers/active');
                hasActiveTimerRef.current = Boolean(response.data.activeTimer?.start_time);
                activeTimerIdRef.current = response.data.activeTimer?.id || null;
                activeTimerStartedAtRef.current = response.data.activeTimer?.start_time
                    ? new Date(response.data.activeTimer.start_time).getTime()
                    : null;

                activeTimerPausedSecondsRef.current = response.data.activeTimer?.paused_duration_seconds ?? 0;
                activeTimerPausedAtRef.current = response.data.activeTimer?.paused_at
                    ? new Date(response.data.activeTimer.paused_at).getTime()
                    : null;

                const newIsPaused = Boolean(response.data.activeTimer?.is_paused);
                if (newIsPaused && !isPausedRef.current) {
                    window.dispatchEvent(new CustomEvent(TIMER_PAUSED_EVENT, {
                        detail: { reason: response.data.activeTimer?.pause_reason ?? null },
                    }));
                }
                isPausedRef.current = newIsPaused;

                if (!hasActiveTimerRef.current) {
                    lastHeartbeatAtRef.current = 0;
                    idleWarningShownRef.current = false;
                    isPausedRef.current = false;
                    activeTimerStartedAtRef.current = null;
                    activeTimerPausedSecondsRef.current = 0;
                    activeTimerPausedAtRef.current = null;
                    lastDailyStateRef.current = null;
                }
            } catch (error) {
                console.error('Failed to sync active timer heartbeat state:', error);
            } finally {
                syncInFlightRef.current = null;
            }
        })();

        return syncInFlightRef.current;
    }, []);

    const lastDailyStateRef = useRef<string | null>(null);

    const enforceActiveTimerCap = useCallback(async () => {
        if (!getStoredToken() || !hasActiveTimerRef.current || !activeTimerStartedAtRef.current) {
            return false;
        }

        const now = Date.now();
        const openPauseMs = isPausedRef.current && activeTimerPausedAtRef.current
            ? Math.max(now - activeTimerPausedAtRef.current, 0)
            : 0;
        const countedMs = Math.max(
            now - activeTimerStartedAtRef.current - activeTimerPausedSecondsRef.current * 1000 - openPauseMs,
            0,
        );

        if (countedMs < MAX_ACTIVE_TIMER_MS) {
            return false;
        }

        try {
            // Declaring the reason matters: a plain stop records auto_stopped=false with
            // no stop_reason, which scores 28 risk points lower than the identical entry
            // stopped by the server sweep. Without this, whether a capped session got
            // flagged depended on which enforcer happened to win the race.
            await api.post('/timers/stop', { reason: 'active_duration_limit' });
            hasActiveTimerRef.current = false;
            activeTimerIdRef.current = null;
            activeTimerStartedAtRef.current = null;
            activeTimerPausedSecondsRef.current = 0;
            activeTimerPausedAtRef.current = null;
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
        if (!getStoredToken() || !hasActiveTimerRef.current) {
            return;
        }

        // -----------------------------------------------------------------------
        // ORIGINAL BEHAVIOUR (ENHANCED=false):
        //   Only send heartbeats when the tab is visible.  A hidden tab causes
        //   the server to count missed heartbeats and eventually pause the timer.
        //
        // ENHANCED BEHAVIOUR (ENHANCED=true):
        //   Send heartbeats even when the tab is hidden.  The visibility state is
        //   included in the payload so the server knows the tab is in background.
        //   This is the primary fix for "working in VS Code / terminal" false idle.
        // -----------------------------------------------------------------------
        if (!ENHANCED && !isDocumentVisible()) {
            return;
        }

        if (await enforceActiveTimerCap()) {
            return;
        }

        const now = Date.now();
        const intervalToUse = !isDocumentVisible() ? HIDDEN_HEARTBEAT_INTERVAL_MS : HEARTBEAT_INTERVAL_MS;
        if (!force && now - lastHeartbeatAtRef.current < intervalToUse) {
            return;
        }

        try {
            const payload: Record<string, unknown> = {
                active_timer_id: activeTimerIdRef.current,
                last_activity_at: new Date(lastActivityAtRef.current).toISOString(),
                visibility_state: typeof document === 'undefined' ? 'visible' : document.visibilityState,
                has_focus: typeof document === 'undefined' ? true : document.hasFocus(),
            };

            // Include browser_activity_state only when enhanced mode is active.
            if (ENHANCED) {
                payload.browser_activity_state = computeBrowserActivityState(lastActivityAtRef.current);
            }

            const response = await api.post<{
                state: string;
                policy?: { idleWarningAfterMinutes: number; idlePauseAfterMinutes: number; heartbeatIntervalSeconds: number };
                daily?: DailyCapSummary | null;
            }>('/timers/ping', payload);

            lastHeartbeatAtRef.current = now;

            // Update server-authoritative policy thresholds so countdown is accurate.
            if (response.data.policy) {
                serverIdleWarningMsRef.current = response.data.policy.idleWarningAfterMinutes * 60_000;
                serverIdlePauseMsRef.current = response.data.policy.idlePauseAfterMinutes * 60_000;
            }

            // Daily limits. The server never refuses the ping — it reports where the user
            // stands and the UI decides whether to prompt. Only fire on a *transition*,
            // so the modal appears once rather than on every heartbeat.
            const daily = response.data.daily;
            if (daily) {
                const previousState = lastDailyStateRef.current;
                lastDailyStateRef.current = daily.state;

                const reachedCap = daily.state === 'at_cap' || daily.state === 'over_cap';
                const previouslyAtCap = previousState === 'at_cap' || previousState === 'over_cap';

                if (reachedCap && !previouslyAtCap) {
                    window.dispatchEvent(new CustomEvent(TIMER_DAILY_CAP_EVENT, { detail: daily }));
                } else if (daily.state === 'floor_passed' && previousState !== 'floor_passed') {
                    window.dispatchEvent(new CustomEvent(TIMER_DAILY_FLOOR_EVENT, { detail: daily }));
                }
            }

            // If the server enforced a pause during the ping guardrail, update local state.
            if (response.data.state === 'paused') {
                isPausedRef.current = true;
                window.dispatchEvent(new CustomEvent(TIMER_PAUSED_EVENT, {
                    detail: { reason: 'server_enforced' },
                }));
            }
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

        // Pause via sendBeacon when the tab/window is actually closing.
        // pagehide is more reliable than beforeunload (works on mobile and bfcache navigation),
        // BUT it also fires when the page is merely frozen/put into the back-forward cache
        // (app switch on mobile, tab freeze, back/forward navigation). In that case
        // event.persisted === true and the session is NOT ending — pausing there made the
        // timer feel hair-trigger ("left the browser for a few seconds and it paused").
        // Only fires if there is an active, unpaused timer.
        const onPageHide = (event: PageTransitionEvent) => {
            if (event.persisted) return;
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

        // Regular heartbeat interval.
        // ENHANCED: fires even when tab is hidden (heartbeat payload includes visibility state).
        // LEGACY: fires only when visible (guarded inside sendHeartbeat).
        const heartbeatInterval = window.setInterval(() => {
            if (!hasActiveTimerRef.current) return;
            void enforceActiveTimerCap();
            void sendHeartbeat(true);
        }, HEARTBEAT_INTERVAL_MS);

        const capInterval = window.setInterval(() => {
            if (!hasActiveTimerRef.current) return;
            void enforceActiveTimerCap();
        }, 60_000);

        // Idle warning + countdown interval.
        // Reduced to 10 s (from 30 s) for accurate countdown display.
        const idleCheckInterval = window.setInterval(() => {
            if (!hasActiveTimerRef.current) return;

            // When tab is hidden in enhanced mode, we are NOT idle just because the tab is hidden.
            // Only run the warning countdown when the tab is visible or the client computes idle_candidate.
            const browserState = ENHANCED ? computeBrowserActivityState(lastActivityAtRef.current) : null;

            // In enhanced mode, skip in-tab idle warning when user is working in another app.
            if (ENHANCED && (browserState === 'hidden_connected')) {
                return;
            }

            // Legacy path (or enhanced but idle_candidate / visible_inactive):
            // Only check idle against in-tab activity when tab is visible.
            if (!ENHANCED && !isDocumentVisible()) {
                return;
            }

            const inactiveForMs = Date.now() - lastActivityAtRef.current;
            const warnThreshold = serverIdleWarningMsRef.current;
            const pauseThreshold = serverIdlePauseMsRef.current;

            if (inactiveForMs >= warnThreshold) {
                if (!idleWarningShownRef.current) {
                    idleWarningShownRef.current = true;
                    window.dispatchEvent(new CustomEvent(TIMER_IDLE_WARNING_EVENT, {
                        detail: { inactiveForMs },
                    }));
                }

                // Dispatch countdown so the UI can update the "pauses in X" display.
                const timeUntilPauseMs = Math.max(0, pauseThreshold - inactiveForMs);
                window.dispatchEvent(new CustomEvent(TIMER_IDLE_COUNTDOWN_EVENT, {
                    detail: {
                        inactiveForMs,
                        timeUntilPauseMs,
                        browserActivityState: browserState,
                    },
                }));
            }
        }, 10_000);

        // "I'm still here" button in the idle warning banner triggers this event.
        const onForceHeartbeat = () => {
            lastActivityAtRef.current = Date.now();
            lastActivitySampleAtRef.current = Date.now();
            idleWarningShownRef.current = false;
            void sendHeartbeat(true);
        };

        window.addEventListener('focus', onVisibility);
        window.addEventListener('blur', onVisibility);
        window.addEventListener(TIME_ENTRY_CHANGED_EVENT, onEntryChanged as EventListener);
        window.addEventListener('storage', onStorage);
        window.addEventListener('pagehide', onPageHide);
        window.addEventListener('wfx:timer-force-heartbeat', onForceHeartbeat);
        document.addEventListener('visibilitychange', onVisibility);

        let idleRefreshTicks = 0;
        const refreshInterval = window.setInterval(() => {
            // Legacy mode: skip refresh when the tab is hidden.
            // Enhanced mode: keep syncing while hidden ONLY when a timer is actually
            // running — that poll is what drives server-side auto-pause/auto-stop.
            if (!isDocumentVisible() && (!ENHANCED || !hasActiveTimerRef.current)) return;

            // Throttle the idle case; see IDLE_REFRESH_TICKS.
            if (!hasActiveTimerRef.current) {
                idleRefreshTicks += 1;
                if (idleRefreshTicks < IDLE_REFRESH_TICKS) return;
            }

            idleRefreshTicks = 0;
            void syncActiveTimer();
        }, ACTIVE_TIMER_REFRESH_MS);

        return () => {
            activityEvents.forEach((eventName) => {
                window.removeEventListener(eventName, onActivity);
            });
            window.clearInterval(heartbeatInterval);
            window.clearInterval(capInterval);
            window.clearInterval(idleCheckInterval);
            window.removeEventListener('focus', onVisibility);
            window.removeEventListener('blur', onVisibility);
            window.removeEventListener(TIME_ENTRY_CHANGED_EVENT, onEntryChanged as EventListener);
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('pagehide', onPageHide);
            window.removeEventListener('wfx:timer-force-heartbeat', onForceHeartbeat);
            document.removeEventListener('visibilitychange', onVisibility);
            window.clearInterval(refreshInterval);
        };
    }, [enforceActiveTimerCap, handleActivity, sendHeartbeat, syncActiveTimer]);
};
