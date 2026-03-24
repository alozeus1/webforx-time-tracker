import cron from 'node-cron';
import prisma from '../config/db';

class NotificationWorker {
    public start() {
        console.log('🔄 Starting Background Notification Worker...');

        // Run every day at 09:00 AM server time (Daily Reminder)
        cron.schedule('0 9 * * 1-5', async () => {
            console.log('⏰ Running daily tracker reminder job...');
            await this.sendDailyReminders();
        });

        // Run every Friday at 17:00 (Weekly Timesheet Submission Reminder)
        cron.schedule('0 17 * * 5', async () => {
            console.log('⏰ Running weekly timesheet reminder job...');
            await this.sendTimesheetReminders();
        });

        // Run every day at 18:00 (End of day Admin summary)
        cron.schedule('0 18 * * *', async () => {
            console.log('⏰ Running daily Admin Summary report...');
            await this.sendAdminDailySummary();
        });
    }

    private async sendDailyReminders() {
        try {
            // Find active users
            const users = await prisma.user.findMany({
                where: { is_active: true }
            });

            // Here you would hook into email or a chat system (e.g. Mattermost)
            // For MVP, we log the action or insert into the notifications table
            for (const user of users) {
                await prisma.notification.create({
                    data: {
                        user_id: user.id,
                        message: 'Good morning! Remember to start tracking your time for today.',
                        type: 'SYSTEM',
                    }
                });
            }
            console.log(`✅ Sent daily reminders to ${users.length} users.`);
        } catch (error) {
            console.error('❌ Error sending daily reminders:', error);
        }
    }

    private async sendTimesheetReminders() {
        try {
            const users = await prisma.user.findMany({
                where: { is_active: true }
            });

            for (const user of users) {
                await prisma.notification.create({
                    data: {
                        user_id: user.id,
                        message: 'Don\'t forget to review and submit your timesheet for this week.',
                        type: 'SYSTEM',
                    }
                });
            }
            console.log(`✅ Sent weekly timesheet reminders to ${users.length} users.`);
        } catch (error) {
            console.error('❌ Error sending weekly reminders:', error);
        }
    }

    private async sendAdminDailySummary() {
        try {
            // Find all managers/admins
            const admins = await prisma.user.findMany({
                where: {
                    is_active: true,
                    role: { name: { in: ['Admin', 'Manager'] } }
                }
            });

            for (const admin of admins) {
                await prisma.notification.create({
                    data: {
                        user_id: admin.id,
                        message: 'The daily organization timesheet summary is ready.',
                        type: 'REPORT',
                    }
                });
            }
            console.log(`✅ Sent Admin summary to ${admins.length} users.`);
        } catch (error) {
            console.error('❌ Error sending Admin Summary:', error);
        }
    }
}

export const notificationWorker = new NotificationWorker();
