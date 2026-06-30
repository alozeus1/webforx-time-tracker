import prisma from '../config/db';

export type ComplianceMode = 'none' | 'dcaa' | 'flsa' | 'wtd';

interface OrgSettings {
    compliance_mode?: ComplianceMode;
    [key: string]: unknown;
}

/**
 * Returns the compliance mode configured for the organisation.
 * Stored in Organization.settings JSON as `{ compliance_mode: "none" | "dcaa" | "flsa" | "wtd" }`.
 */
export const getOrgComplianceMode = async (organizationId: string): Promise<ComplianceMode> => {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
    });
    const settings = (org?.settings as OrgSettings) ?? {};
    const mode = settings.compliance_mode;
    if (mode === 'dcaa' || mode === 'flsa' || mode === 'wtd') return mode;
    return 'none';
};

interface EntryLike {
    status: string;
    project_id: string | null;
}

/**
 * DCAA mode: approved entries are immutable — cannot be edited.
 * FLSA / WTD: no edit restrictions beyond standard rules.
 */
export const assertComplianceAllowsEdit = async (
    organizationId: string,
    entry: EntryLike,
): Promise<void> => {
    const mode = await getOrgComplianceMode(organizationId);
    if (mode === 'dcaa' && entry.status === 'approved') {
        const err = new Error(
            'DCAA compliance mode: approved time entries cannot be modified. Submit a correction request instead.',
        );
        (err as NodeJS.ErrnoException).code = 'COMPLIANCE_BLOCKED';
        throw err;
    }
};

/**
 * DCAA mode: approved entries cannot be deleted.
 */
export const assertComplianceAllowsDelete = async (
    organizationId: string,
    entry: EntryLike,
): Promise<void> => {
    const mode = await getOrgComplianceMode(organizationId);
    if (mode === 'dcaa' && entry.status === 'approved') {
        const err = new Error(
            'DCAA compliance mode: approved time entries cannot be deleted. Records must be retained for audit purposes.',
        );
        (err as NodeJS.ErrnoException).code = 'COMPLIANCE_BLOCKED';
        throw err;
    }
};

/**
 * WTD (EU Working Time Directive): 48h average over a rolling 17-week window.
 * Returns a warning notification if the user is approaching or over the limit.
 * Does NOT block the request — sends a notification instead.
 */
export const checkWtdCompliance = async (
    organizationId: string,
    userId: string,
): Promise<{ exceeded: boolean; averageWeeklyHours: number } | null> => {
    const mode = await getOrgComplianceMode(organizationId);
    if (mode !== 'wtd') return null;

    const seventeenWeeksAgo = new Date();
    seventeenWeeksAgo.setDate(seventeenWeeksAgo.getDate() - 17 * 7);

    const entries = await prisma.timeEntry.findMany({
        where: {
            organization_id: organizationId,
            user_id: userId,
            start_time: { gte: seventeenWeeksAgo },
        },
        select: { duration: true },
    });

    const totalSeconds = entries.reduce((acc, e) => acc + e.duration, 0);
    const avgWeeklyHours = totalSeconds / 3600 / 17;

    return { exceeded: avgWeeklyHours > 48, averageWeeklyHours: parseFloat(avgWeeklyHours.toFixed(1)) };
};

/**
 * Dispatch a WTD notification if average hours exceed 48h.
 * Call after a new entry is created — fire-and-forget.
 */
export const notifyWtdIfNeeded = async (
    organizationId: string,
    userId: string,
): Promise<void> => {
    try {
        const result = await checkWtdCompliance(organizationId, userId);
        if (!result || !result.exceeded) return;

        // Dedup: only notify once per day
        const recent = await prisma.notification.findFirst({
            where: {
                organization_id: organizationId,
                user_id: userId,
                type: 'wtd_alert',
                created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
        });
        if (recent) return;

        await prisma.notification.create({
            data: {
                user_id: userId,
                organization_id: organizationId,
                message: `WTD Compliance Alert: Your average working time over the past 17 weeks is ${result.averageWeeklyHours}h/week, which exceeds the 48h EU Working Time Directive limit.`,
                type: 'wtd_alert',
            },
        });
    } catch (err) {
        console.error('[complianceService] notifyWtdIfNeeded error:', err);
    }
};
