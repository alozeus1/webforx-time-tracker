"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startIdleTracker = exports.checkIdleTimers = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = __importDefault(require("../config/db"));
const env_1 = require("../config/env");
const activeTimerService_1 = require("../services/activeTimerService");
const checkIdleTimers = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('[Worker] Running Idle Tracker Checks...');
    try {
        const activeTimers = yield db_1.default.activeTimer.findMany();
        const now = new Date();
        const warningThresholdMs = env_1.env.idleWarningMinutes * 60 * 1000;
        const staleThresholdMs = env_1.env.heartbeatStaleMinutes * 60 * 1000;
        const autoStopThresholdMs = staleThresholdMs + (env_1.env.autoStopGraceMinutes * 60 * 1000);
        // Threshold: if no ping received in 2× heartbeat interval, don't trust last-known browser state
        const pingFrequencyThresholdMs = env_1.env.heartbeatIntervalMinutes * 2 * 60000;
        const maxPauseMs = env_1.env.maxPauseHours * 60 * 60 * 1000;
        const maxActiveTimerMs = env_1.env.maxActiveTimerHours * 60 * 60 * 1000;
        for (const timer of activeTimers) {
            const startedAt = new Date(timer.start_time);
            const activeForMs = now.getTime() - startedAt.getTime();
            if (activeForMs >= maxActiveTimerMs) {
                yield (0, activeTimerService_1.stopActiveTimerWithReason)({ userId: timer.user_id, reason: 'active_duration_limit', triggeredAt: now });
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
                        yield (0, activeTimerService_1.stopActiveTimerWithReason)({ userId: timer.user_id, reason: 'pause_expired', triggeredAt: now });
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
            // --- Guard 2: ping-frequency enforcement ---
            // If no ping is received in 2× heartbeat interval, browser state is stale.
            // Do not rely on old hidden/focus signals for soft-pause decisions.
            const pingIsTooOld = heartbeatAgeMs >= pingFrequencyThresholdMs;
            const browserExplicitlyInactive = timer.client_visibility === 'hidden' ||
                timer.client_has_focus === false;
            if (clientActivityAgeMs >= autoStopThresholdMs || heartbeatAgeMs >= autoStopThresholdMs) {
                if (!pingIsTooOld && browserExplicitlyInactive) {
                    yield (0, activeTimerService_1.pauseActiveTimer)(timer.user_id, 'browser_inactive');
                    console.log(`[Worker] Timer paused (browser_inactive) for user ${timer.user_id}`);
                    continue;
                }
                const reason = clientActivityAgeMs >= autoStopThresholdMs ? 'idle_timeout' : 'heartbeat_missing';
                yield (0, activeTimerService_1.stopActiveTimerWithReason)({ userId: timer.user_id, reason, triggeredAt: now });
                console.log(`[Worker] Timer auto-stopped (${reason}) for user ${timer.user_id}`);
                continue;
            }
            if (clientActivityAgeMs >= warningThresholdMs || heartbeatAgeMs >= staleThresholdMs) {
                const existingNote = yield db_1.default.notification.findFirst({
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
                    yield db_1.default.notification.create({
                        data: {
                            user_id: timer.user_id,
                            message: `You have an active timer running but appear inactive. If activity does not resume, it will be stopped automatically.`,
                            type: 'idle_warning',
                        }
                    });
                    yield db_1.default.auditLog.create({
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
    }
    catch (error) {
        console.error('[Worker] Error running idle tracker:', error);
    }
});
exports.checkIdleTimers = checkIdleTimers;
const startIdleTracker = () => {
    node_cron_1.default.schedule('*/5 * * * *', exports.checkIdleTimers);
};
exports.startIdleTracker = startIdleTracker;
