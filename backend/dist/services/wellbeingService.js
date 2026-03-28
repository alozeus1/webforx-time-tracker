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
exports.getUserWellbeingSummary = exports.deriveWellbeingStatus = exports.BURNOUT_CAUTION_THRESHOLD_HOURS = exports.BURNOUT_THRESHOLD_HOURS = void 0;
const db_1 = __importDefault(require("../config/db"));
exports.BURNOUT_THRESHOLD_HOURS = 50;
exports.BURNOUT_CAUTION_THRESHOLD_HOURS = 45;
const ALERT_HISTORY_DAYS = 30;
const deriveWellbeingStatus = (sevenDayHours) => {
    if (sevenDayHours >= exports.BURNOUT_THRESHOLD_HOURS) {
        return 'burnout_risk';
    }
    if (sevenDayHours >= exports.BURNOUT_CAUTION_THRESHOLD_HOURS) {
        return 'approaching_burnout';
    }
    return 'balanced';
};
exports.deriveWellbeingStatus = deriveWellbeingStatus;
const getLookbackStart = (days) => {
    const value = new Date();
    value.setDate(value.getDate() - days);
    return value;
};
const roundHours = (value) => Number(value.toFixed(value >= 10 ? 1 : 2));
const getUserWellbeingSummary = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const sevenDaysAgo = getLookbackStart(7);
    const alertsSince = getLookbackStart(ALERT_HISTORY_DAYS);
    const [user, recentEntries, workloadAlerts] = yield Promise.all([
        db_1.default.user.findUnique({
            where: { id: userId },
            select: { weekly_hour_limit: true },
        }),
        db_1.default.timeEntry.findMany({
            where: {
                user_id: userId,
                start_time: { gte: sevenDaysAgo },
            },
            select: { duration: true },
        }),
        db_1.default.notification.findMany({
            where: {
                user_id: userId,
                type: { in: ['burnout_alert', 'overtime_alert'] },
                created_at: { gte: alertsSince },
            },
            orderBy: { created_at: 'desc' },
            take: 10,
            select: {
                id: true,
                type: true,
                message: true,
                is_read: true,
                created_at: true,
            },
        }),
    ]);
    const totalSeconds = recentEntries.reduce((sum, entry) => sum + entry.duration, 0);
    const sevenDayHours = roundHours(totalSeconds / 3600);
    const averageDailyHours = roundHours(sevenDayHours / 7);
    return {
        sevenDayHours,
        averageDailyHours,
        burnoutThresholdHours: exports.BURNOUT_THRESHOLD_HOURS,
        cautionThresholdHours: exports.BURNOUT_CAUTION_THRESHOLD_HOURS,
        hoursUntilBurnout: Math.max(roundHours(exports.BURNOUT_THRESHOLD_HOURS - sevenDayHours), 0),
        weeklyHourLimit: (_a = user === null || user === void 0 ? void 0 : user.weekly_hour_limit) !== null && _a !== void 0 ? _a : null,
        status: (0, exports.deriveWellbeingStatus)(sevenDayHours),
        workloadAlerts,
    };
});
exports.getUserWellbeingSummary = getUserWellbeingSummary;
