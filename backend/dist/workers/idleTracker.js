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
        for (const timer of activeTimers) {
            const lastHeartbeat = timer.last_heartbeat_at
                ? new Date(timer.last_heartbeat_at)
                : (timer.last_active_ping ? new Date(timer.last_active_ping) : new Date(timer.start_time));
            const lastClientActivity = timer.last_client_activity_at ? new Date(timer.last_client_activity_at) : null;
            const heartbeatAgeMs = now.getTime() - lastHeartbeat.getTime();
            const clientActivityAgeMs = lastClientActivity ? now.getTime() - lastClientActivity.getTime() : Number.POSITIVE_INFINITY;
            const browserInactive = timer.client_visibility === 'hidden' || timer.client_has_focus === false;
            if (clientActivityAgeMs >= autoStopThresholdMs || heartbeatAgeMs >= autoStopThresholdMs) {
                yield (0, activeTimerService_1.stopActiveTimerWithReason)({
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
