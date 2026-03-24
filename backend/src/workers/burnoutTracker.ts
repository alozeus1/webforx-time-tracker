import cron from 'node-cron';
import prisma from '../config/db';

export const checkBurnout = async () => {
    console.log('[Worker] Running Burnout Metrics Checks...');
    try {
        const users = await prisma.user.findMany({ where: { is_active: true } });

        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        for (const user of users) {
            const recentEntries = await prisma.timeEntry.findMany({
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

            if (totalHours > 50) {
                console.log(`[Worker] User ${user.email} exceeded 50 hours (${totalHours.toFixed(1)}h). Dispatching Burnout Alert.`);

                await prisma.notification.create({
                    data: {
                        user_id: user.id,
                        message: `Burnout Alert: You have logged ${totalHours.toFixed(1)} hours in the last 7 days. Please prioritize rest and taking breaks.`,
                        type: 'burnout_alert',
                    }
                });
            }
        }
    } catch (error) {
        console.error('[Worker] Error running burnout tracker:', error);
    }
};

export const startBurnoutTracker = () => {
    cron.schedule('0 0 * * *', checkBurnout);
};
