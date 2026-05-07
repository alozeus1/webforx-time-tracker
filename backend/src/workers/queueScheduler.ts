import { queues } from '../config/queue';

export const scheduleIdleCheck = async (): Promise<void> => {
  await queues.idleTracker.add('check-idle-timers', {}, { repeat: { pattern: '*/5 * * * *' } });
};

export const scheduleBurnoutCheck = async (): Promise<void> => {
  await queues.burnoutTracker.add('check-burnout', {}, { repeat: { pattern: '0 0 * * *' } });
};

export const scheduleDailyNotifications = async (): Promise<void> => {
  await queues.notifications.add('daily-notifications', {}, { repeat: { pattern: '0 9 * * *' } });
};
