import cron from 'node-cron';
import prisma from '../config/db';
import { env } from '../config/env';
import { stopActiveTimerWithReason, pauseActiveTimer } from '../services/activeTimerService';
import { getGlobalTimerPolicy } from '../services/timerPolicyService';

export const checkIdleTimers = async () => {
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

        for (const timer of activeTimers) {
            const startedAt = new Date(timer.start_time);
            const activeForMs = now.getTime() - startedAt.getTime();

            if (activeForMs >= maxActiveTimerMs) {
                await stopActiveTimerWithReason({ userId: timer.user_id, reason: 'active_duration_limit', triggeredAt: now });
                console.log(`[Worker] Timer auto-stopped (active_duration_limit, ${Math.round(activeForMs / 3600000)}h active) for user ${timer.user_id}`);
                continue;
            }

            // --- Guard 1: max pause duration ---
            // A paused timer that has been paused longer than maxPauseHours is auto-stopped.
            // This runs before all other checks; paused-but-not-expired timers are skipped entirely.
            if (timer.is_paused) {
                if (timer.paused_at) {
                    const pausedForMs = now.getTime() - new Date(timer.paused_at).getTime();
                    if (pausedForMs >= maxPauseMs) {
                        await stopActiveTimerWithReason({ userId: timer.user_id, reason: 'pause_expired', triggeredAt: now });
                        console.log(`[Worker] Timer auto-stopped (pause_expired, ${Math.round(pausedForMs / 3600000)}h paused) for user ${timer.user_id}`);
                    }
                }
                continue; // Never run idle checks against a paused timer
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
                await pauseActiveTimer(timer.user_id, reason);
                console.log(`[Worker] Timer paused (${reason}) for user ${timer.user_id}`);
                continue;
            }

            if (clientActivityAgeMs >= warningThresholdMs || missedHeartbeats >= policy.missedHeartbeatWarningThreshold) {
                const existingNote = await prisma.notification.findFirst({
                    where: {
                        user_id: timer.user_id,
                        type: 'idle_warning',
                        deleted_at: null,
                        created_at: {
                            gte: new Date(now.getTime() - 60 * 60 * 1000)
                        }
                    }
                });

                if (!existingNote) {
                    await prisma.notification.create({
                        data: {
                            user_id: timer.user_id,
                            message: `You have an active timer running but appear inactive. If activity does not resume, it will be paused automatically.`,
                            type: 'idle_warning',
                        }
                    });
                    await prisma.activeTimer.update({
                        where: { user_id: timer.user_id },
                        data: { idle_warning_shown_at: now },
                    });
                    await prisma.auditLog.create({
                        data: {
                            user_id: timer.user_id,
                            action: 'timer_idle_warning_issued',
                            resource: 'active_timer',
                            metadata: {
                                active_timer_id: timer.id,
                                heartbeat_age_ms: heartbeatAgeMs,
                                missed_heartbeats: missedHeartbeats,
                                client_activity_age_ms: Number.isFinite(clientActivityAgeMs) ? clientActivityAgeMs : null,
                                client_visibility: timer.client_visibility,
                                client_has_focus: timer.client_has_focus,
                            },
                        },
                    });
                    console.log(`[Worker] Idle warning dispatched to user ${timer.user_id}`);
                }
            }
        }
    } catch (error) {
        console.error('[Worker] Error running idle tracker:', error);
    }
};

export const startIdleTracker = () => {
    cron.schedule('*/5 * * * *', checkIdleTimers);
};
