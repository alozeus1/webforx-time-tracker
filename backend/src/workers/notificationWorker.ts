import cron from 'node-cron';
import prisma from '../config/db';
import { getPasswordExpiryInfo, resolvePasswordPolicy } from '../services/passwordPolicyService';

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

        // Run every day at 09:15 (Password expiry warnings — only for orgs with expiration enabled)
        cron.schedule('15 9 * * *', async () => {
            console.log('⏰ Running password expiry warning job...');
            await this.sendPasswordExpiryWarnings();
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
                        organization_id: user.organization_id,
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
                        organization_id: user.organization_id,
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

    private async sendPasswordExpiryWarnings() {
        try {
            const MS_PER_DAY = 24 * 60 * 60 * 1000;
            const orgs = await prisma.organization.findMany({ select: { id: true, settings: true } });
            let warned = 0;

            for (const org of orgs) {
                const policy = resolvePasswordPolicy(org.settings);
                if (policy.expiration_days <= 0) continue; // expiration disabled (default)

                // A user's password "clock" starts at password_changed_at ?? created_at.
                // Warn when it is older than (expiration_days - expiry_warning_days).
                const warnThreshold = new Date(
                    Date.now() - (policy.expiration_days - policy.expiry_warning_days) * MS_PER_DAY,
                );

                const users = await prisma.user.findMany({
                    where: {
                        organization_id: org.id,
                        is_active: true,
                        OR: [
                            { password_changed_at: { lte: warnThreshold } },
                            { password_changed_at: null, created_at: { lte: warnThreshold } },
                        ],
                    },
                    select: { id: true, password_changed_at: true, created_at: true },
                });

                if (users.length === 0) continue;

                // Dedupe: skip anyone already warned within the last 20 hours.
                const recentlyWarned = await prisma.notification.findMany({
                    where: {
                        organization_id: org.id,
                        type: 'password_expiry_warning',
                        created_at: { gte: new Date(Date.now() - 20 * 60 * 60 * 1000) },
                    },
                    select: { user_id: true },
                });
                const recentlyWarnedIds = new Set(recentlyWarned.map((n) => n.user_id));

                for (const user of users) {
                    if (recentlyWarnedIds.has(user.id)) continue;

                    const expiry = getPasswordExpiryInfo(user, policy);
                    if (expiry.days_until_expiry === null) continue;

                    const message = expiry.expired
                        ? 'Your password has expired. Please change it.'
                        : `Your password expires in ${expiry.days_until_expiry} day(s). Please change it soon.`;

                    await prisma.notification.create({
                        data: {
                            user_id: user.id,
                            organization_id: org.id,
                            message,
                            type: 'password_expiry_warning',
                        },
                    });
                    warned += 1;
                }
            }

            console.log(`✅ Sent password expiry warnings to ${warned} users.`);
        } catch (error) {
            console.error('❌ Error sending password expiry warnings:', error);
        }
    }

    private async sendAdminDailySummary() {
        try {
            // Find all managers/admins
            const admins = await prisma.user.findMany({
                where: {
                    is_active: true,
                    role: { name: { in: ['Admin', 'Manager'] } }
                },
                include: { role: true }
            });

            for (const admin of admins) {
                await prisma.notification.create({
                    data: {
                        user_id: admin.id,
                        organization_id: admin.organization_id,
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
