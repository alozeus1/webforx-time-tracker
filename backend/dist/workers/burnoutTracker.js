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
exports.startBurnoutTracker = exports.checkBurnout = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = __importDefault(require("../config/db"));
const wellbeingService_1 = require("../services/wellbeingService");
const checkBurnout = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('[Worker] Running Burnout Metrics Checks...');
    try {
        const users = yield db_1.default.user.findMany({ where: { is_active: true } });
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        for (const user of users) {
            const recentEntries = yield db_1.default.timeEntry.findMany({
                where: {
                    user_id: user.id,
                    start_time: { gte: oneWeekAgo }
                }
            });
            let totalSecondsLogged = 0;
            for (const entry of recentEntries) {
                totalSecondsLogged += entry.duration;
            }
            const totalHours = totalSecondsLogged / 3600;
            if (totalHours > wellbeingService_1.BURNOUT_THRESHOLD_HOURS) {
                const existingAlert = yield db_1.default.notification.findFirst({
                    where: {
                        user_id: user.id,
                        type: 'burnout_alert',
                        created_at: {
                            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                        },
                    },
                });
                if (existingAlert) {
                    continue;
                }
                console.log(`[Worker] User ${user.email} exceeded ${wellbeingService_1.BURNOUT_THRESHOLD_HOURS} hours (${totalHours.toFixed(1)}h). Dispatching Burnout Alert.`);
                yield db_1.default.notification.create({
                    data: {
                        user_id: user.id,
                        message: `Burnout Alert: You have logged ${totalHours.toFixed(1)} hours in the last 7 days. Please prioritize rest and taking breaks.`,
                        type: 'burnout_alert',
                    }
                });
            }
        }
    }
    catch (error) {
        console.error('[Worker] Error running burnout tracker:', error);
    }
});
exports.checkBurnout = checkBurnout;
const startBurnoutTracker = () => {
    node_cron_1.default.schedule('0 0 * * *', exports.checkBurnout);
};
exports.startBurnoutTracker = startBurnoutTracker;
