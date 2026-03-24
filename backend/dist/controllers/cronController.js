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
exports.runDailyReport = exports.runHourlyChecks = void 0;
const burnoutTracker_1 = require("../workers/burnoutTracker");
const idleTracker_1 = require("../workers/idleTracker");
const reporterService_1 = require("../services/reporterService");
const runHourlyChecks = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('[Cron] Running hourly checks for burnout and idle timers...');
        yield (0, burnoutTracker_1.checkBurnout)();
        yield (0, idleTracker_1.checkIdleTimers)();
        res.status(200).json({ status: 'success', message: 'Hourly checks completed successfully' });
    }
    catch (error) {
        console.error('[Cron] Error during hourly checks:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run hourly checks' });
    }
});
exports.runHourlyChecks = runHourlyChecks;
const runDailyReport = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('[Cron] Running daily PDF report generation...');
        yield (0, reporterService_1.generateAndEmailDailyReport)();
        res.status(200).json({ status: 'success', message: 'Daily report completed successfully' });
    }
    catch (error) {
        console.error('[Cron] Error during daily report:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run daily report' });
    }
});
exports.runDailyReport = runDailyReport;
