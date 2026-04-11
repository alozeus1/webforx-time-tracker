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
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDailyReport = exports.runWorkloadChecks = exports.runIdleChecks = void 0;
const burnoutTracker_1 = require("../workers/burnoutTracker");
const idleTracker_1 = require("../workers/idleTracker");
const reporterService_1 = require("../services/reporterService");
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
