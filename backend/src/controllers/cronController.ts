import { Request, Response } from 'express';
import { checkBurnout } from '../workers/burnoutTracker';
import { checkIdleTimers } from '../workers/idleTracker';
import { generateAndEmailDailyReport } from '../services/reporterService';

export const runHourlyChecks = async (_req: Request, res: Response): Promise<void> => {
    try {
        console.log('[Cron] Running hourly checks for burnout and idle timers...');
        await checkBurnout();
        await checkIdleTimers();
        res.status(200).json({ status: 'success', message: 'Hourly checks completed successfully' });
    } catch (error) {
        console.error('[Cron] Error during hourly checks:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run hourly checks' });
    }
};

export const runDailyReport = async (_req: Request, res: Response): Promise<void> => {
    try {
        console.log('[Cron] Running daily PDF report generation...');
        await generateAndEmailDailyReport();
        res.status(200).json({ status: 'success', message: 'Daily report completed successfully' });
    } catch (error) {
        console.error('[Cron] Error during daily report:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run daily report' });
    }
};
