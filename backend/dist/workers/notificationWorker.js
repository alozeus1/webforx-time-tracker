"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationWorker = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = __importDefault(require("../config/db"));
class NotificationWorker {
    start() {
        console.log('🔄 Starting Background Notification Worker...');
        // Run every day at 09:00 AM server time (Daily Reminder)
        node_cron_1.default.schedule('0 9 * * 1-5', () => __awaiter(this, void 0, void 0, function* () {
            console.log('⏰ Running daily tracker reminder job...');
            yield this.sendDailyReminders();
        }));
        // Run every Friday at 17:00 (Weekly Timesheet Submission Reminder)
        node_cron_1.default.schedule('0 17 * * 5', () => __awaiter(this, void 0, void 0, function* () {
            console.log('⏰ Running weekly timesheet reminder job...');
            yield this.sendTimesheetReminders();
        }));
        // Run every day at 18:00 (End of day Admin summary)
        node_cron_1.default.schedule('0 18 * * *', () => __awaiter(this, void 0, void 0, function* () {
            console.log('⏰ Running daily Admin Summary report...');
            yield this.sendAdminDailySummary();
        }));
    }
    sendDailyReminders() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Find active users
                const users = yield db_1.default.user.findMany({
                    where: { is_active: true }
                });
                // Here you would hook into email or a chat system (e.g. Mattermost)
                // For MVP, we log the action or insert into the notifications table
                for (const user of users) {
                    yield db_1.default.notification.create({
                        data: {
                            user_id: user.id,
                            message: 'Good morning! Remember to start tracking your time for today.',
                            type: 'SYSTEM',
                        }
                    });
                }
                console.log(`✅ Sent daily reminders to ${users.length} users.`);
            }
            catch (error) {
                console.error('❌ Error sending daily reminders:', error);
            }
        });
    }
    sendTimesheetReminders() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const users = yield db_1.default.user.findMany({
                    where: { is_active: true }
                });
                for (const user of users) {
                    yield db_1.default.notification.create({
                        data: {
                            user_id: user.id,
                            message: 'Don\'t forget to review and submit your timesheet for this week.',
                            type: 'SYSTEM',
                        }
                    });
                }
                console.log(`✅ Sent weekly timesheet reminders to ${users.length} users.`);
            }
            catch (error) {
                console.error('❌ Error sending weekly reminders:', error);
            }
        });
    }
    sendAdminDailySummary() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Find all managers/admins
                const admins = yield db_1.default.user.findMany({
                    where: {
                        is_active: true,
                        role: { name: { in: ['Admin', 'Manager'] } }
                    }
                });
                for (const admin of admins) {
                    yield db_1.default.notification.create({
                        data: {
                            user_id: admin.id,
                            message: 'The daily organization timesheet summary is ready.',
                            type: 'REPORT',
                        }
                    });
                }
                console.log(`✅ Sent Admin summary to ${admins.length} users.`);
            }
            catch (error) {
                console.error('❌ Error sending Admin Summary:', error);
            }
        });
    }
}
exports.notificationWorker = new NotificationWorker();
