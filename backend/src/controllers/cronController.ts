import { Request, Response } from 'express';
import { checkBurnout } from '../workers/burnoutTracker';
import { checkIdleTimers } from '../workers/idleTracker';
import { generateAndEmailDailyReport, processDueScheduledReports } from '../services/reporterService';
import prisma from '../config/db';

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

export const resetDemoData = async (_req: Request, res: Response): Promise<void> => {
    const DEMO_EMAIL = 'demo@webforxtech.com';
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    try {
        const demoUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
        if (!demoUser) {
            res.status(200).json({ status: 'skipped', message: 'Demo user not found.' });
            return;
        }

        const userId = demoUser.id;

        // Always delete active timer for demo user (prevents stuck timers)
        await prisma.activeTimer.deleteMany({ where: { user_id: userId } });

        // Delete time entries older than 24h
        const deletedEntries = await prisma.timeEntry.deleteMany({
            where: { user_id: userId, start_time: { lt: cutoff } },
        });

        // Delete notifications older than 24h
        await prisma.notification.deleteMany({
            where: { user_id: userId, created_at: { lt: cutoff } },
        });

        console.log(`[Cron] Demo reset: deleted ${deletedEntries.count} entries for ${DEMO_EMAIL}`);
        res.status(200).json({
            status: 'success',
            deletedEntries: deletedEntries.count,
        });
    } catch (error) {
        console.error('[Cron] Demo reset failed:', error);
        res.status(500).json({ status: 'error', message: 'Demo reset failed.' });
    }
};
