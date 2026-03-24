import cron from 'node-cron';
import prisma from '../config/db';

export const checkIdleTimers = async () => {
    console.log('[Worker] Running Idle Tracker Checks...');
    try {
        const activeTimers = await prisma.activeTimer.findMany();
        const now = new Date();
        const IDLE_THRESHOLD_MS = 15 * 60 * 1000;

        for (const timer of activeTimers) {
            const lastPing = timer.last_active_ping ? new Date(timer.last_active_ping) : new Date(timer.start_time);
            const timeSinceLastPing = now.getTime() - lastPing.getTime();

            if (timeSinceLastPing > IDLE_THRESHOLD_MS) {
                const existingNote = await prisma.notification.findFirst({
                    where: {
                        user_id: timer.user_id,
                        type: 'idle_warning',
                        created_at: {
                            gte: new Date(now.getTime() - 60 * 60 * 1000)
                        }
                    }
                });

                if (!existingNote) {
                    await prisma.notification.create({
                        data: {
                            user_id: timer.user_id,
                            message: `You have an active timer running but seem idle. Do you want to pause it?`,
                            type: 'idle_warning',
                        }
                    });
                    console.log(`[Worker] Idle warning dispatched to user ${timer.user_id}`);
                }
            }
        }
    } catch (error) {
        console.error('[Worker] Error running idle tracker:', error);
    }
};

export const startIdleTracker = () => {
    cron.schedule('*/5 * * * *', checkIdleTimers);
};
