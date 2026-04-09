import cron from 'node-cron';
import prisma from '../config/db';
import { env } from '../config/env';
import { stopActiveTimerWithReason } from '../services/activeTimerService';

export const checkIdleTimers = async () => {
    console.log('[Worker] Running Idle Tracker Checks...');
    try {
        const activeTimers = await prisma.activeTimer.findMany();
        const now = new Date();
        const warningThresholdMs = env.idleWarningMinutes * 60 * 1000;
        const staleThresholdMs = env.heartbeatStaleMinutes * 60 * 1000;
        const autoStopThresholdMs = staleThresholdMs + (env.autoStopGraceMinutes * 60 * 1000);

        for (const timer of activeTimers) {
            const lastHeartbeat = timer.last_heartbeat_at
                ? new Date(timer.last_heartbeat_at)
                : (timer.last_active_ping ? new Date(timer.last_active_ping) : new Date(timer.start_time));
            const lastClientActivity = timer.last_client_activity_at ? new Date(timer.last_client_activity_at) : null;
            const heartbeatAgeMs = now.getTime() - lastHeartbeat.getTime();
            const clientActivityAgeMs = lastClientActivity ? now.getTime() - lastClientActivity.getTime() : Number.POSITIVE_INFINITY;
            const browserInactive = timer.client_visibility === 'hidden' || timer.client_has_focus === false;

            if (clientActivityAgeMs >= autoStopThresholdMs || heartbeatAgeMs >= autoStopThresholdMs) {
                await stopActiveTimerWithReason({
                    userId: timer.user_id,
                    reason: browserInactive
                        ? 'browser_inactive'
                        : (clientActivityAgeMs >= autoStopThresholdMs ? 'idle_timeout' : 'heartbeat_missing'),
                    triggeredAt: now,
                });
                console.log(`[Worker] Timer auto-stopped for user ${timer.user_id}`);
                continue;
            }

            if (clientActivityAgeMs >= warningThresholdMs || heartbeatAgeMs >= staleThresholdMs) {
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
                            message: `You have an active timer running but appear inactive. If activity does not resume, it will be stopped automatically.`,
                            type: 'idle_warning',
                        }
                    });
                    await prisma.auditLog.create({
                        data: {
                            user_id: timer.user_id,
                            action: 'timer_idle_warning_issued',
                            resource: 'active_timer',
                            metadata: {
                                active_timer_id: timer.id,
                                heartbeat_age_ms: heartbeatAgeMs,
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
