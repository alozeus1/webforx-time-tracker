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
exports.resetDemoData = exports.runDailyReport = exports.runWorkloadChecks = exports.runIdleChecks = void 0;
const burnoutTracker_1 = require("../workers/burnoutTracker");
const idleTracker_1 = require("../workers/idleTracker");
const reporterService_1 = require("../services/reporterService");
const db_1 = __importDefault(require("../config/db"));
const runIdleChecks = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('[Cron] Running idle timer checks...');
        yield (0, idleTracker_1.checkIdleTimers)();
        res.status(200).json({ status: 'success', message: 'Idle checks completed successfully' });
    }
    catch (error) {
        console.error('[Cron] Error during idle checks:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run idle checks' });
    }
});
exports.runIdleChecks = runIdleChecks;
const runWorkloadChecks = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('[Cron] Running workload burnout checks...');
        yield (0, burnoutTracker_1.checkBurnout)();
        res.status(200).json({ status: 'success', message: 'Workload checks completed successfully' });
    }
    catch (error) {
        console.error('[Cron] Error during workload checks:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run workload checks' });
    }
});
exports.runWorkloadChecks = runWorkloadChecks;
const runDailyReport = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('[Cron] Running daily PDF report generation...');
        yield (0, reporterService_1.generateAndEmailDailyReport)();
        const scheduledReports = yield (0, reporterService_1.processDueScheduledReports)();
        const status = scheduledReports.failed > 0 ? 'partial_failure' : 'success';
        const message = scheduledReports.failed > 0
            ? 'Daily report completed, but one or more scheduled reports failed'
            : 'Daily report completed successfully';
        res.status(scheduledReports.failed > 0 ? 500 : 200).json({
            status,
            message,
            scheduledReports,
        });
    }
    catch (error) {
        console.error('[Cron] Error during daily report:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run daily report' });
    }
});
exports.runDailyReport = runDailyReport;
const resetDemoData = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const DEMO_EMAIL = 'demo@webforxtech.com';
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    try {
        const demoUser = yield db_1.default.user.findUnique({ where: { email: DEMO_EMAIL } });
        if (!demoUser) {
            res.status(200).json({ status: 'skipped', message: 'Demo user not found.' });
            return;
        }
        const userId = demoUser.id;
        // Always delete active timer for demo user (prevents stuck timers)
        yield db_1.default.activeTimer.deleteMany({ where: { user_id: userId } });
        // Delete time entries older than 24h
        const deletedEntries = yield db_1.default.timeEntry.deleteMany({
            where: { user_id: userId, start_time: { lt: cutoff } },
        });
        // Delete notifications older than 24h
        yield db_1.default.notification.deleteMany({
            where: { user_id: userId, created_at: { lt: cutoff } },
        });
        console.log(`[Cron] Demo reset: deleted ${deletedEntries.count} entries for ${DEMO_EMAIL}`);
        res.status(200).json({
            status: 'success',
            deletedEntries: deletedEntries.count,
        });
    }
    catch (error) {
        console.error('[Cron] Demo reset failed:', error);
        res.status(500).json({ status: 'error', message: 'Demo reset failed.' });
    }
});
exports.resetDemoData = resetDemoData;
