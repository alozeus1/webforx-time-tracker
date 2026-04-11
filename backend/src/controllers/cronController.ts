import { Request, Response } from 'express';
import { checkBurnout } from '../workers/burnoutTracker';
import { checkIdleTimers } from '../workers/idleTracker';
import { generateAndEmailDailyReport, processDueScheduledReports } from '../services/reporterService';

export const runIdleChecks = async (_req: Request, res: Response): Promise<void> => {
    try {
        console.log('[Cron] Running idle timer checks...');
        await checkIdleTimers();
        res.status(200).json({ status: 'success', message: 'Idle checks completed successfully' });
    } catch (error) {
        console.error('[Cron] Error during idle checks:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run idle checks' });
    }
};

export const runWorkloadChecks = async (_req: Request, res: Response): Promise<void> => {
    try {
        console.log('[Cron] Running workload burnout checks...');
        await checkBurnout();
        res.status(200).json({ status: 'success', message: 'Workload checks completed successfully' });
    } catch (error) {
        console.error('[Cron] Error during workload checks:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run workload checks' });
    }
};

export const runDailyReport = async (_req: Request, res: Response): Promise<void> => {
    try {
        console.log('[Cron] Running daily PDF report generation...');
        await generateAndEmailDailyReport();
        const scheduledReports = await processDueScheduledReports();
        const status = scheduledReports.failed > 0 ? 'partial_failure' : 'success';
        const message = scheduledReports.failed > 0
            ? 'Daily report completed, but one or more scheduled reports failed'
            : 'Daily report completed successfully';

        res.status(scheduledReports.failed > 0 ? 500 : 200).json({
            status,
            message,
            scheduledReports,
        });
    } catch (error) {
        console.error('[Cron] Error during daily report:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run daily report' });
    }
};
