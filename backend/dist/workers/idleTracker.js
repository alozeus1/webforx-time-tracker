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
const checkIdleTimers = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('[Worker] Running Idle Tracker Checks...');
    try {
        const activeTimers = yield db_1.default.activeTimer.findMany();
        const now = new Date();
        const IDLE_THRESHOLD_MS = 15 * 60 * 1000;
        for (const timer of activeTimers) {
            const lastPing = timer.last_active_ping ? new Date(timer.last_active_ping) : new Date(timer.start_time);
            const timeSinceLastPing = now.getTime() - lastPing.getTime();
            if (timeSinceLastPing > IDLE_THRESHOLD_MS) {
                const existingNote = yield db_1.default.notification.findFirst({
                    where: {
                        user_id: timer.user_id,
                        type: 'idle_warning',
                        created_at: {
                            gte: new Date(now.getTime() - 60 * 60 * 1000)
                        }
                    }
                });
                if (!existingNote) {
                    yield db_1.default.notification.create({
                        data: {
                            user_id: timer.user_id,
                            message: `You have an active timer running but seem idle. Do you want to pause it?`,
                            type: 'idle_warning',
                        }
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
