import prisma from '../config/db';
import { BURNOUT_THRESHOLD_HOURS } from '../services/wellbeingService';

export const checkBurnout = async () => {
    console.log('[Worker] Running Burnout Metrics Checks...');
    try {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // ── Fix N+1 ────────────────────────────────────────────────────────────
        // Old: user.findMany() then timeEntry.findMany() per user = O(n) queries.
        // New: single groupBy aggregate → O(1) queries total.
        const weeklyTotals = await prisma.timeEntry.groupBy({
            by: ['user_id'],
            where: { start_time: { gte: oneWeekAgo } },
            _sum: { duration: true },
        });

        // Map user_id → total seconds logged this week
        const totalByUserId = new Map<string, number>(
            weeklyTotals.map((row) => [row.user_id, row._sum.duration ?? 0]),
        );

        // Only fetch users who actually exceeded the threshold — avoids loading entire user table
        const overloadedUserIds = [...totalByUserId.entries()]
            .filter(([, secs]) => secs / 3600 > BURNOUT_THRESHOLD_HOURS)
            .map(([userId]) => userId);

        if (overloadedUserIds.length === 0) {
            console.log('[Worker] No burnout risk detected this cycle.');
            return;
        }

        // Batch-fetch recent burnout alerts so we don't send duplicate notifications
        const recentAlerts = await prisma.notification.findMany({
            where: {
                user_id: { in: overloadedUserIds },
                type: 'burnout_alert',
                created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
            select: { user_id: true },
        });
        const alreadyNotified = new Set(recentAlerts.map((n) => n.user_id));

        // Fetch user details (email, org) only for users who need a notification
        const usersNeedingAlert = overloadedUserIds.filter((id) => !alreadyNotified.has(id));
        if (usersNeedingAlert.length === 0) {
            console.log('[Worker] Burnout alerts already dispatched for all over-threshold users today.');
            return;
        }

        const users = await prisma.user.findMany({
            where: { id: { in: usersNeedingAlert }, is_active: true },
            select: { id: true, email: true, organization_id: true },
        });

        // Create all notifications in a single batch
        const notifications = users.map((user) => {
            const totalHours = (totalByUserId.get(user.id) ?? 0) / 3600;
            console.log(`[Worker] User ${user.email} exceeded ${BURNOUT_THRESHOLD_HOURS}h (${totalHours.toFixed(1)}h). Dispatching Burnout Alert.`);
            return {
                user_id: user.id,
                organization_id: user.organization_id,
                message: `Burnout Alert: You have logged ${totalHours.toFixed(1)} hours in the last 7 days. Please prioritize rest and taking breaks.`,
                type: 'burnout_alert',
            };
        });

        if (notifications.length > 0) {
            await prisma.notification.createMany({ data: notifications, skipDuplicates: true });
        }
    } catch (error) {
        console.error('[Worker] Error running burnout tracker:', error);
    }
};

// startBurnoutTracker is intentionally a no-op — the Vercel Cron Job entry in
// vercel.json (schedule "0 0 * * *" → /api/v1/cron/workload) calls checkBurnout
// via an HTTP endpoint. In-process node-cron is unreliable on serverless.
export const startBurnoutTracker = () => {};
