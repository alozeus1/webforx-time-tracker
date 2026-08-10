import { Request, Response } from 'express';
import { checkBurnout } from '../workers/burnoutTracker';
import { checkIdleTimers } from '../workers/idleTracker';
import { generateAndEmailDailyReport, processDueScheduledReports } from '../services/reporterService';
import { runRetentionCleanup } from '../services/retentionService';
import { purgeResolvedCorrections } from '../services/correctionRetentionService';
import { env } from '../config/env';
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

export const runRetention = async (_req: Request, res: Response): Promise<void> => {
    try {
        console.log('[Cron] Running data retention cleanup...');
        const result = await runRetentionCleanup();

        // A per-table failure is recorded as -1 by the service. Surfacing it as a
        // partial_failure keeps a half-completed sweep from reading as a clean run.
        const hasFailures = Object.values(result.deleted).some((count) => count < 0);

        res.status(hasFailures ? 500 : 200).json({
            status: hasFailures ? 'partial_failure' : 'success',
            ...result,
        });
    } catch (error) {
        console.error('[Cron] Error during retention cleanup:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run retention cleanup' });
    }
};

export const runCorrectionRetention = async (_req: Request, res: Response): Promise<void> => {
    try {
        console.log('[Cron] Running correction retention cleanup...');
        const deleted = await purgeResolvedCorrections(undefined, env.correctionRetentionDays);
        console.log(`[Cron] Correction retention cleanup complete: ${deleted} deleted`);
        res.status(200).json({ status: 'success', deleted });
    } catch (error) {
        console.error('[Cron] Error during correction retention cleanup:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run correction retention cleanup' });
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

        // A blocked report is a *correct* outcome — the validation gate did its job —
        // so it must not be reported as a 500, or the cron platform will retry and the
        // operator will chase a phantom infrastructure fault instead of the data issue.
        // It is surfaced as `validation_blocked` with a 200 so it stays visible.
        const hasFailures = scheduledReports.failed > 0;
        const hasBlocked = scheduledReports.blocked > 0;

        const status = hasFailures
            ? 'partial_failure'
            : hasBlocked ? 'validation_blocked' : 'success';
        const message = hasFailures
            ? 'Daily report completed, but one or more scheduled reports failed'
            : hasBlocked
                ? 'Daily report completed. One or more scheduled reports were blocked by validation gates and were not sent.'
                : 'Daily report completed successfully';

        res.status(hasFailures ? 500 : 200).json({
            status,
            message,
            scheduledReports,
        });
    } catch (error) {
        console.error('[Cron] Error during daily report:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run daily report' });
    }
};

/**
 * Scheduled report tick.
 *
 * Runs hourly. A single daily tick cannot serve multiple reporting timezones: at
 * 23:59 UTC on a Monday it is already Tuesday in Pacific/Auckland, so an Auckland
 * report's Monday 06:00 slot would never be observed and the report would never
 * send. Ticking hourly lets every timezone's Monday-morning slot be seen, while
 * `isGenerationDue` plus window-based de-duplication keep delivery exactly-once.
 */
export const runScheduledReports = async (_req: Request, res: Response): Promise<void> => {
    try {
        const scheduledReports = await processDueScheduledReports();

        const hasFailures = scheduledReports.failed > 0;
        const hasBlocked = scheduledReports.blocked > 0;

        if (scheduledReports.sent > 0 || hasFailures || hasBlocked) {
            console.log('[Cron] Scheduled report tick:', JSON.stringify(scheduledReports));
        }

        res.status(hasFailures ? 500 : 200).json({
            status: hasFailures ? 'partial_failure' : hasBlocked ? 'validation_blocked' : 'success',
            scheduledReports,
        });
    } catch (error) {
        console.error('[Cron] Error during scheduled report tick:', error);
        res.status(500).json({ status: 'error', message: 'Failed to run scheduled reports' });
    }
};

export const resetDemoData = async (_req: Request, res: Response): Promise<void> => {
    const DEMO_EMAIL = 'demo@webforxtech.com';
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    try {
        const demoUser = await prisma.user.findFirst({ where: { email: DEMO_EMAIL } });
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
