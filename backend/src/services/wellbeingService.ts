import prisma from '../config/db';

export const BURNOUT_THRESHOLD_HOURS = 50;
export const BURNOUT_CAUTION_THRESHOLD_HOURS = 45;
const ALERT_HISTORY_DAYS = 30;

export type WellbeingStatus = 'balanced' | 'approaching_burnout' | 'burnout_risk';

export interface WorkloadAlertSummary {
    id: string;
    type: string;
    message: string;
    is_read: boolean;
    created_at: Date;
}

export interface UserWellbeingSummary {
    sevenDayHours: number;
    averageDailyHours: number;
    burnoutThresholdHours: number;
    cautionThresholdHours: number;
    hoursUntilBurnout: number;
    weeklyHourLimit: number | null;
    status: WellbeingStatus;
    workloadAlerts: WorkloadAlertSummary[];
}

export const deriveWellbeingStatus = (sevenDayHours: number): WellbeingStatus => {
    if (sevenDayHours >= BURNOUT_THRESHOLD_HOURS) {
        return 'burnout_risk';
    }

    if (sevenDayHours >= BURNOUT_CAUTION_THRESHOLD_HOURS) {
        return 'approaching_burnout';
    }

    return 'balanced';
};

const getLookbackStart = (days: number) => {
    const value = new Date();
    value.setDate(value.getDate() - days);
    return value;
};

const roundHours = (value: number) => Number(value.toFixed(value >= 10 ? 1 : 2));

export const getUserWellbeingSummary = async (userId: string): Promise<UserWellbeingSummary> => {
    const sevenDaysAgo = getLookbackStart(7);
    const alertsSince = getLookbackStart(ALERT_HISTORY_DAYS);

    const [user, recentEntries, workloadAlerts] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: { weekly_hour_limit: true },
        }),
        prisma.timeEntry.findMany({
            where: {
                user_id: userId,
                start_time: { gte: sevenDaysAgo },
            },
            select: { duration: true },
        }),
        prisma.notification.findMany({
            where: {
                user_id: userId,
                type: { in: ['burnout_alert', 'overtime_alert'] },
                created_at: { gte: alertsSince },
            },
            orderBy: { created_at: 'desc' },
            take: 10,
            select: {
                id: true,
                type: true,
                message: true,
                is_read: true,
                created_at: true,
            },
        }),
    ]);

    const totalSeconds = recentEntries.reduce((sum, entry) => sum + entry.duration, 0);
    const sevenDayHours = roundHours(totalSeconds / 3600);
    const averageDailyHours = roundHours(sevenDayHours / 7);

    return {
        sevenDayHours,
        averageDailyHours,
        burnoutThresholdHours: BURNOUT_THRESHOLD_HOURS,
        cautionThresholdHours: BURNOUT_CAUTION_THRESHOLD_HOURS,
        hoursUntilBurnout: Math.max(roundHours(BURNOUT_THRESHOLD_HOURS - sevenDayHours), 0),
        weeklyHourLimit: user?.weekly_hour_limit ?? null,
        status: deriveWellbeingStatus(sevenDayHours),
        workloadAlerts,
    };
};
