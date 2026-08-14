import cron from 'node-cron';
import prisma from '../config/db';
import { env } from '../config/env';
import { computeCountedSeconds } from '../services/dailyCapService';
import { stopActiveTimerWithReason, pauseActiveTimer, isBotStartedTimer } from '../services/activeTimerService';
import { getGlobalTimerPolicy } from '../services/timerPolicyService';

// ---------------------------------------------------------------------------
// Helper: read browser_activity_state stored in the heartbeat_state JSON blob.
// ---------------------------------------------------------------------------
const getBrowserActivityState = (heartbeatState: unknown): string | null => {
    if (heartbeatState && typeof heartbeatState === 'object' && !Array.isArray(heartbeatState)) {
        const state = (heartbeatState as Record<string, unknown>).browser_activity_state;
        if (typeof state === 'string') return state;
    }
    return null;
};

// ---------------------------------------------------------------------------
// Enhanced idle-check logic (TIMER_ENHANCED_ACTIVITY_DETECTION=true)
//
// Key principle (ActivityWatch-inspired):
//   "browser tab hidden" ≠ "user idle"
//
// Decision matrix:
//   | heartbeat fresh | activity state      | action              |
//   |-----------------|---------------------|---------------------|
//   | yes             | active              | keep running        |
//   | yes             | visible_inactive    | warn if > threshold |
//   | yes             | hidden_connected    | keep running        |
//   | yes             | idle_candidate      | warn, start grace   |
//   | yes             | null (legacy)       | legacy path         |
//   | no (missed)     | any                 | pause (unchanged)   |
// ---------------------------------------------------------------------------
const checkIdleTimersEnhanced = async () => {
    console.log('[Worker/Enhanced] Running Idle Tracker Checks...');
    try {
        const activeTimers = await prisma.activeTimer.findMany();
        const now = new Date();
        const policy = await getGlobalTimerPolicy();
        const warningThresholdMs = policy.idleWarningAfterMinutes * 60 * 1000;
        const idlePauseThresholdMs = policy.idlePauseAfterMinutes * 60 * 1000;
        const heartbeatIntervalMs = policy.heartbeatIntervalSeconds * 1000;
        const maxPauseMs = env.maxPauseHours * 60 * 60 * 1000;
        const maxActiveTimerMs = policy.maxSessionDurationHours * 60 * 60 * 1000;
        // Grace window: how long a hidden_connected session can run before we still ask for review.
        const hiddenGraceMs = env.hiddenConnectedGraceMinutes * 60 * 1000;

        // How long a timer may run with no heartbeat at all before it is treated as
        // abandoned rather than merely idle. Generous relative to the pause threshold:
        // pausing is the normal response to inactivity, and this only catches sessions
        // whose client stopped reporting entirely (closed laptop, killed browser).
        const abandonedAfterMs = Math.max(idlePauseThresholdMs * 2, heartbeatIntervalMs * 10);

        for (const timer of activeTimers) {
            // Counted time, not wall clock — a session paused for two hours must not be
            // auto-stopped at six hours of real work.
            const activeForMs = computeCountedSeconds(timer, now) * 1000;

            // Hard cap: session ran too long regardless of activity state.
            if (activeForMs >= maxActiveTimerMs) {
                await stopActiveTimerWithReason({
                    userId: timer.user_id,
                    reason: 'active_duration_limit',
                    triggeredAt: now,
                    organizationId: timer.organization_id,
                });
                console.log(`[Worker/Enhanced] Timer auto-stopped (active_duration_limit, ${Math.round(activeForMs / 3600000)}h) for user ${timer.user_id}`);
                continue;
            }

            // Guard 1: max pause duration — same as legacy path.
            if (timer.is_paused) {
                if (timer.paused_at) {
                    const pausedForMs = now.getTime() - new Date(timer.paused_at).getTime();
                    if (pausedForMs >= maxPauseMs) {
                        await stopActiveTimerWithReason({
                            userId: timer.user_id,
                            reason: 'pause_expired',
                            triggeredAt: now,
                            organizationId: timer.organization_id,
                        });
                        console.log(`[Worker/Enhanced] Timer auto-stopped (pause_expired, ${Math.round(pausedForMs / 3600000)}h) for user ${timer.user_id}`);
                    }
                }
                continue;
            }

            // Bot-started timers have no client that can send heartbeats, so every check
            // below reads their silence as inactivity and would pause them minutes after
            // they start (see isBotStartedTimer). The session cap and pause expiry above
            // still bound them.
            if (isBotStartedTimer(timer)) continue;

            // Abandoned: nothing has been heard from this client in a very long time.
            // Stopping with this reason clamps the recorded end back to the last
            // heartbeat, so unproven hours are never credited.
            const lastSignal = timer.last_heartbeat_at ?? timer.last_client_activity_at ?? timer.last_active_ping;
            const silenceMs = lastSignal
                ? now.getTime() - new Date(lastSignal).getTime()
                : now.getTime() - new Date(timer.start_time).getTime();

            if (silenceMs >= abandonedAfterMs) {
                await stopActiveTimerWithReason({
                    userId: timer.user_id,
                    reason: 'abandoned_timer',
                    triggeredAt: now,
                    organizationId: timer.organization_id,
                });
                console.log(`[Worker/Enhanced] Timer auto-stopped (abandoned_timer, silent ${Math.round(silenceMs / 60000)}m) for user ${timer.user_id}`);
                continue;
            }

            // Compute time since last heartbeat.
            const lastHeartbeat = timer.last_heartbeat_at
                ? new Date(timer.last_heartbeat_at)
                : (timer.last_active_ping ? new Date(timer.last_active_ping) : new Date(timer.start_time));

            const heartbeatAgeMs = now.getTime() - lastHeartbeat.getTime();
            const missedHeartbeats = Math.max(Math.floor(heartbeatAgeMs / heartbeatIntervalMs) - 1, 0);

            if (missedHeartbeats !== timer.heartbeat_miss_count) {
                await prisma.activeTimer.update({
                    where: { user_id: timer.user_id },
                    data: { heartbeat_miss_count: missedHeartbeats },
                });
            }

            // Guard 2: missed heartbeats — client has gone completely silent.
            // This applies regardless of enhancement mode because a missing heartbeat
            // means we have no signal at all from the client.
            if (missedHeartbeats >= policy.missedHeartbeatPauseThreshold) {
                const reason = (timer.client_visibility === 'hidden' || timer.client_has_focus === false)
                    ? 'browser_inactive'
                    : 'missed_heartbeat_threshold';
                await pauseActiveTimer(timer.user_id, timer.organization_id, reason);
                console.log(`[Worker/Enhanced] Timer paused (${reason}, ${missedHeartbeats} missed heartbeats) for user ${timer.user_id}`);
                continue;
            }

            // Heartbeat IS arriving (client is alive). Now apply enhanced logic.
            const browserActivityState = getBrowserActivityState(timer.heartbeat_state);

            // hidden_connected: the user's browser is sending heartbeats even though the
            // tab is in the background. This is the key fix for "working in VS Code/terminal".
            // We do NOT pause based on client-side activity age for these sessions.
            // After hiddenGraceMs we start issuing warnings so long sessions get reviewed,
            // but we do not hard-pause until heartbeats actually stop.
            if (browserActivityState === 'hidden_connected') {
                const hiddenSinceMs = timer.last_client_activity_at
                    ? now.getTime() - new Date(timer.last_client_activity_at).getTime()
                    : hiddenGraceMs + 1; // treat unknown as past grace

                if (missedHeartbeats >= policy.missedHeartbeatWarningThreshold) {
                    // Heartbeats starting to slip even in hidden mode — warn.
                    await maybeIssueIdleWarning(timer, now, heartbeatAgeMs, missedHeartbeats);
                } else if (hiddenSinceMs >= hiddenGraceMs) {
                    // Long session with no in-tab activity — soft warning only, no pause.
                    await maybeIssueIdleWarning(timer, now, heartbeatAgeMs, missedHeartbeats);
                }
                // Otherwise: session is healthy, skip any pause logic.
                continue;
            }

            // idle_candidate: client says it thinks it might be idle.
            // Respect the traditional threshold but give a small bonus grace.
            if (browserActivityState === 'idle_candidate') {
                const clientActivityAgeMs = timer.last_client_activity_at
                    ? now.getTime() - new Date(timer.last_client_activity_at).getTime()
                    : idlePauseThresholdMs + 1;

                if (clientActivityAgeMs >= idlePauseThresholdMs) {
                    await pauseActiveTimer(timer.user_id, timer.organization_id, 'idle_timeout');
                    console.log(`[Worker/Enhanced] Timer paused (idle_timeout via idle_candidate) for user ${timer.user_id}`);
                    continue;
                }
                if (clientActivityAgeMs >= warningThresholdMs || missedHeartbeats >= policy.missedHeartbeatWarningThreshold) {
                    await maybeIssueIdleWarning(timer, now, heartbeatAgeMs, missedHeartbeats);
                }
                continue;
            }

            // active / visible_inactive / null (legacy fallback): use traditional logic.
            const baseActivityTime = timer.last_client_activity_at
                ? new Date(timer.last_client_activity_at)
                : new Date(timer.start_time);
            const clientActivityAgeMs = now.getTime() - baseActivityTime.getTime();

            if (
                missedHeartbeats >= policy.missedHeartbeatPauseThreshold ||
                clientActivityAgeMs >= idlePauseThresholdMs
            ) {
                const reason = missedHeartbeats >= policy.missedHeartbeatPauseThreshold
                    ? 'missed_heartbeat_threshold'
                    : (timer.client_visibility === 'hidden' || timer.client_has_focus === false)
                        ? 'browser_inactive'
                        : 'idle_timeout';
                await pauseActiveTimer(timer.user_id, timer.organization_id, reason);
                console.log(`[Worker/Enhanced] Timer paused (${reason}) for user ${timer.user_id}`);
                continue;
            }

            if (clientActivityAgeMs >= warningThresholdMs || missedHeartbeats >= policy.missedHeartbeatWarningThreshold) {
                await maybeIssueIdleWarning(timer, now, heartbeatAgeMs, missedHeartbeats);
            }
        }
    } catch (error) {
        console.error('[Worker/Enhanced] Error running idle tracker:', error);
    }
};

// ---------------------------------------------------------------------------
// Helper: issue idle warning notification if one hasn't been sent recently.
// ---------------------------------------------------------------------------
const maybeIssueIdleWarning = async (
    timer: {
        id: string;
        user_id: string;
        organization_id: string;
        client_visibility: string | null;
        client_has_focus: boolean | null;
        heartbeat_state: unknown;
    },
    now: Date,
    heartbeatAgeMs: number,
    missedHeartbeats: number,
) => {
    const existingNote = await prisma.notification.findFirst({
        where: {
            organization_id: timer.organization_id,
            user_id: timer.user_id,
            type: 'idle_warning',
            deleted_at: null,
            created_at: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
        },
    });

    if (existingNote) return;

    const browserActivityState = getBrowserActivityState(timer.heartbeat_state);
    const isHiddenConnected = browserActivityState === 'hidden_connected';

    const message = isHiddenConnected
        ? `Your timer is running while the browser tab is in the background. If you've stepped away, it will pause automatically once activity stops.`
        : `You have an active timer running but appear inactive. If activity does not resume, it will be paused automatically.`;

    await prisma.notification.create({
        data: {
            user_id: timer.user_id,
            organization_id: timer.organization_id,
            message,
            type: 'idle_warning',
        },
    });

    await prisma.activeTimer.update({
        where: { user_id: timer.user_id },
        data: { idle_warning_shown_at: now },
    });

    await prisma.auditLog.create({
        data: {
            user_id: timer.user_id,
            organization_id: timer.organization_id,
            action: 'timer_idle_warning_issued',
            resource: 'active_timer',
            metadata: {
                active_timer_id: timer.id,
                heartbeat_age_ms: heartbeatAgeMs,
                missed_heartbeats: missedHeartbeats,
                browser_activity_state: browserActivityState,
                client_visibility: timer.client_visibility,
                client_has_focus: timer.client_has_focus,
            },
        },
    });

    console.log(`[Worker] Idle warning dispatched to user ${timer.user_id} (state: ${browserActivityState ?? 'unknown'})`);
};

// ---------------------------------------------------------------------------
// Legacy idle-check logic (TIMER_ENHANCED_ACTIVITY_DETECTION=false / default)
// Identical to original implementation — no functional changes.
// ---------------------------------------------------------------------------
const checkIdleTimersLegacy = async () => {
    console.log('[Worker] Running Idle Tracker Checks...');
    try {
        const activeTimers = await prisma.activeTimer.findMany();
        const now = new Date();
        const policy = await getGlobalTimerPolicy();
        const warningThresholdMs = policy.idleWarningAfterMinutes * 60 * 1000;
        const idlePauseThresholdMs = policy.idlePauseAfterMinutes * 60 * 1000;
        const heartbeatIntervalMs = policy.heartbeatIntervalSeconds * 1000;
        const maxPauseMs = env.maxPauseHours * 60 * 60 * 1000;
        const maxActiveTimerMs = policy.maxSessionDurationHours * 60 * 60 * 1000;

        const abandonedAfterMs = Math.max(idlePauseThresholdMs * 2, heartbeatIntervalMs * 10);

        for (const timer of activeTimers) {
            const activeForMs = computeCountedSeconds(timer, now) * 1000;

            if (activeForMs >= maxActiveTimerMs) {
                await stopActiveTimerWithReason({
                    userId: timer.user_id,
                    reason: 'active_duration_limit',
                    triggeredAt: now,
                    organizationId: timer.organization_id,
                });
                console.log(`[Worker] Timer auto-stopped (active_duration_limit, ${Math.round(activeForMs / 3600000)}h active) for user ${timer.user_id}`);
                continue;
            }

            // Guard 1: max pause duration ---
            if (timer.is_paused) {
                if (timer.paused_at) {
                    const pausedForMs = now.getTime() - new Date(timer.paused_at).getTime();
                    if (pausedForMs >= maxPauseMs) {
                        await stopActiveTimerWithReason({
                            userId: timer.user_id,
                            reason: 'pause_expired',
                            triggeredAt: now,
                            organizationId: timer.organization_id,
                        });
                        console.log(`[Worker] Timer auto-stopped (pause_expired, ${Math.round(pausedForMs / 3600000)}h paused) for user ${timer.user_id}`);
                    }
                }
                continue;
            }

            // Bot-started timers never send heartbeats — see isBotStartedTimer.
            if (isBotStartedTimer(timer)) continue;

            const lastSignal = timer.last_heartbeat_at ?? timer.last_client_activity_at ?? timer.last_active_ping;
            const silenceMs = lastSignal
                ? now.getTime() - new Date(lastSignal).getTime()
                : now.getTime() - new Date(timer.start_time).getTime();

            if (silenceMs >= abandonedAfterMs) {
                await stopActiveTimerWithReason({
                    userId: timer.user_id,
                    reason: 'abandoned_timer',
                    triggeredAt: now,
                    organizationId: timer.organization_id,
                });
                console.log(`[Worker] Timer auto-stopped (abandoned_timer, silent ${Math.round(silenceMs / 60000)}m) for user ${timer.user_id}`);
                continue;
            }

            const lastHeartbeat = timer.last_heartbeat_at
                ? new Date(timer.last_heartbeat_at)
                : (timer.last_active_ping ? new Date(timer.last_active_ping) : new Date(timer.start_time));

            const baseActivityTime = timer.last_client_activity_at
                ? new Date(timer.last_client_activity_at)
                : new Date(timer.start_time);

            const heartbeatAgeMs = now.getTime() - lastHeartbeat.getTime();
            const clientActivityAgeMs = now.getTime() - baseActivityTime.getTime();
            const missedHeartbeats = Math.max(Math.floor(heartbeatAgeMs / heartbeatIntervalMs) - 1, 0);

            if (missedHeartbeats !== timer.heartbeat_miss_count) {
                await prisma.activeTimer.update({
                    where: { user_id: timer.user_id },
                    data: { heartbeat_miss_count: missedHeartbeats },
                });
            }

            if (
                missedHeartbeats >= policy.missedHeartbeatPauseThreshold ||
                clientActivityAgeMs >= idlePauseThresholdMs
            ) {
                const reason = missedHeartbeats >= policy.missedHeartbeatPauseThreshold
                    ? 'missed_heartbeat_threshold'
                    : (timer.client_visibility === 'hidden' || timer.client_has_focus === false)
                        ? 'browser_inactive'
                        : 'idle_timeout';
                await pauseActiveTimer(timer.user_id, timer.organization_id, reason);
                console.log(`[Worker] Timer paused (${reason}) for user ${timer.user_id}`);
                continue;
            }

            if (clientActivityAgeMs >= warningThresholdMs || missedHeartbeats >= policy.missedHeartbeatWarningThreshold) {
                await maybeIssueIdleWarning(timer, now, heartbeatAgeMs, missedHeartbeats);
            }
        }
    } catch (error) {
        console.error('[Worker] Error running idle tracker:', error);
    }
};

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------
export const checkIdleTimers = env.timerEnhancedActivityDetection
    ? checkIdleTimersEnhanced
    : checkIdleTimersLegacy;

export const startIdleTracker = () => {
    cron.schedule('*/5 * * * *', checkIdleTimers);
};
