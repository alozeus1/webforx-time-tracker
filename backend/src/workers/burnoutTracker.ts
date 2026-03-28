import cron from 'node-cron';
import prisma from '../config/db';
import { BURNOUT_THRESHOLD_HOURS } from '../services/wellbeingService';

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

            if (totalHours > BURNOUT_THRESHOLD_HOURS) {
                const existingAlert = await prisma.notification.findFirst({
                    where: {
                        user_id: user.id,
                        type: 'burnout_alert',
                        created_at: {
                            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                        },
                    },
                });

                if (existingAlert) {
                    continue;
                }

                console.log(`[Worker] User ${user.email} exceeded ${BURNOUT_THRESHOLD_HOURS} hours (${totalHours.toFixed(1)}h). Dispatching Burnout Alert.`);

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
