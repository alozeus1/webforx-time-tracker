import prisma from '../config/db';
import { deriveWellbeingStatus } from './wellbeingService';

type RiskLevel = 'low' | 'medium' | 'high';

export interface ApprovalIntelligence {
    score: number;
    level: RiskLevel;
    reasons: string[];
}

export interface OperationsInsights {
    managerExceptions: {
        pendingApprovals: Array<Record<string, unknown>>;
        idleWarnings: Array<Record<string, unknown>>;
        overtimeAlerts: Array<Record<string, unknown>>;
        burnoutAlerts: Array<Record<string, unknown>>;
        rejectedEntries: Array<Record<string, unknown>>;
        budgetAlerts: Array<{
            project_id: string;
            project_name: string;
            budgetHours: number | null;
            projectedHours: number;
            trackedHours: number;
        }>;
    };
    teamForecast: {
        members: Array<{
            user_id: string;
            name: string;
            role: string;
            sevenDayHours: number;
            projectedFourteenDayHours: number;
            remainingCapacityHours: number;
            projectedStatus: ReturnType<typeof deriveWellbeingStatus>;
            overloadRisk: boolean;
        }>;
        projects: Array<{
            project_id: string;
            name: string;
            budgetHours: number | null;
            trackedHours: number;
            approvedBillableHours: number;
            projectedFourteenDayHours: number;
            planningAccuracy: number | null;
            burnRisk: boolean;
        }>;
    };
    teamBenchmarks: {
        planningAccuracyPct: number;
        approvalLatencyHours: number;
        billableLeakageHours: number;
        overloadRiskCount: number;
        byPerson: Array<{
            user_id: string;
            name: string;
            role: string;
            projectedFourteenDayHours: number;
            remainingCapacityHours: number;
            overloadRisk: boolean;
        }>;
    };
    meta?: {
        degraded: boolean;
        warnings: string[];
    };
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const roundHours = (seconds: number) => Number((seconds / 3600).toFixed(1));

export const createEmptyOperationsInsights = (): OperationsInsights => ({
    managerExceptions: {
        pendingApprovals: [],
        idleWarnings: [],
        overtimeAlerts: [],
        burnoutAlerts: [],
        rejectedEntries: [],
        budgetAlerts: [],
    },
    teamForecast: {
        members: [],
        projects: [],
    },
    teamBenchmarks: {
        planningAccuracyPct: 0,
        approvalLatencyHours: 0,
        billableLeakageHours: 0,
        overloadRiskCount: 0,
        byPerson: [],
    },
    meta: {
        degraded: false,
        warnings: [],
    },
});

export const scoreTimeEntryRisk = (entry: {
    duration: number;
    entry_type: string;
    task_description: string;
    notes?: string | null;
    start_time: Date | string;
    end_time: Date | string;
    project_id?: string | null;
    created_at?: Date | string;
    updated_at?: Date | string;
    auto_stopped?: boolean;
    stop_reason?: string | null;
}): ApprovalIntelligence => {
    let score = 0;
    const reasons: string[] = [];
    const start = new Date(entry.start_time);
    const end = new Date(entry.end_time);
    const durationHours = entry.duration / 3600;

    if (entry.entry_type === 'manual') {
        score += 24;
        reasons.push('manual entry');
    }

    if (durationHours >= 8) {
        score += 24;
        reasons.push('very long duration');
    } else if (durationHours <= 0.08) {
        score += 8;
        reasons.push('very short duration');
    }

    if (entry.auto_stopped) {
        score += 18;
        reasons.push('auto-stopped entry');
    }

    if (entry.stop_reason === 'active_duration_limit') {
        score += 28;
        reasons.push('hit 8h active timer cap');
    } else if (entry.stop_reason === 'idle_timeout' || entry.stop_reason === 'heartbeat_missing') {
        score += 14;
        reasons.push('stopped after inactivity');
    } else if (entry.stop_reason === 'pause_expired') {
        score += 10;
        reasons.push('paused too long before stop');
    }

    if (!entry.project_id) {
        score += 10;
        reasons.push('missing project');
    }

    if (!entry.notes && entry.entry_type === 'manual') {
        score += 10;
        reasons.push('manual entry has no notes');
    }

    const outsideCoreHours = start.getHours() < 6 || end.getHours() > 22;
    if (outsideCoreHours) {
        score += 10;
        reasons.push('outside standard hours');
    }

    if ([0, 6].includes(start.getDay())) {
        score += 8;
        reasons.push('weekend work');
    }

    if (entry.created_at && entry.updated_at) {
        const createdAt = new Date(entry.created_at);
        const updatedAt = new Date(entry.updated_at);
        if (updatedAt.getTime() - createdAt.getTime() > 5 * 60 * 1000) {
            score += 8;
            reasons.push('entry was edited after creation');
        }
    }

    const normalizedScore = clamp(score, 0, 100);
    const level: RiskLevel = normalizedScore >= 60 ? 'high' : normalizedScore >= 30 ? 'medium' : 'low';

    return {
        score: normalizedScore,
        level,
        reasons,
    };
};

export const getOperationsInsights = async (): Promise<OperationsInsights> => {
    const degradedWarnings: string[] = [];
    const safeQuery = async <T>(label: string, query: () => Promise<T>, fallback: T): Promise<T> => {
        try {
            return await query();
        } catch (error) {
            console.error(`Operations insights dataset failed: ${label}`, error);
            degradedWarnings.push(label);
            return fallback;
        }
    };

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(now.getDate() - 14);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const [users, pendingEntries, rejectedEntries, notifications, projects, auditLogs, approvedEntries] = await Promise.all([
        safeQuery('users', () => prisma.user.findMany({
            where: { is_active: true },
            select: {
                id: true,
                first_name: true,
                last_name: true,
                weekly_hour_limit: true,
                role: { select: { name: true } },
            },
        }), []),
        safeQuery('pending_entries', () => prisma.timeEntry.findMany({
            where: { status: 'pending' },
            include: {
                user: { select: { id: true, first_name: true, last_name: true, email: true } },
                project: { select: { id: true, name: true } },
            },
            orderBy: { created_at: 'desc' },
        }), []),
        safeQuery('rejected_entries', () => prisma.timeEntry.findMany({
            where: { status: 'rejected', updated_at: { gte: fourteenDaysAgo } },
            include: {
                user: { select: { first_name: true, last_name: true } },
                project: { select: { name: true } },
            },
            orderBy: { updated_at: 'desc' },
            take: 12,
        }), []),
        safeQuery('notifications', () => prisma.notification.findMany({
            where: {
                type: { in: ['idle_warning', 'overtime_alert', 'burnout_alert'] },
                created_at: { gte: fourteenDaysAgo },
            },
            include: {
                user: { select: { id: true, first_name: true, last_name: true } },
            },
            orderBy: { created_at: 'desc' },
        }), []),
        safeQuery('projects', () => prisma.project.findMany({
            where: { is_active: true },
            select: {
                id: true,
                name: true,
                budget_hours: true,
                time_entries: {
                    select: {
                        duration: true,
                        is_billable: true,
                    },
                },
            },
        }), []),
        safeQuery('audit_logs', () => prisma.auditLog.findMany({
            where: {
                action: { in: ['timesheet_approve', 'timesheet_reject'] },
                created_at: { gte: thirtyDaysAgo },
            },
            orderBy: { created_at: 'desc' },
        }), []),
        safeQuery('approved_entries', () => prisma.timeEntry.findMany({
            where: { status: 'approved' },
            select: {
                id: true,
                user_id: true,
                duration: true,
                is_billable: true,
                created_at: true,
                invoice_line_items: { select: { id: true } },
            },
        }), []),
    ]);

    const sevenDayEntryRows = await safeQuery('seven_day_entry_rows', () => prisma.timeEntry.groupBy({
        by: ['user_id'],
        where: { start_time: { gte: sevenDaysAgo } },
        _sum: { duration: true },
    }), []);

    const hoursByUser = new Map(sevenDayEntryRows.map((row) => [row.user_id, roundHours(row._sum.duration || 0)]));

    const pendingApprovals = pendingEntries.map((entry) => ({
        id: entry.id,
        task_description: entry.task_description,
        duration_hours: roundHours(entry.duration),
        entry_type: entry.entry_type,
        created_at: entry.created_at,
        user: entry.user,
        project: entry.project,
        intelligence: scoreTimeEntryRisk(entry),
    }));

    const memberForecast = users.map((user) => {
        const sevenDayHours = hoursByUser.get(user.id) || 0;
        const projectedFourteenDayHours = Number((sevenDayHours * 2).toFixed(1));
        const threshold = user.weekly_hour_limit ? user.weekly_hour_limit * 2 : 100;
        const remainingCapacityHours = Number((threshold - projectedFourteenDayHours).toFixed(1));

        return {
            user_id: user.id,
            name: `${user.first_name} ${user.last_name}`,
            role: user.role?.name || 'Employee',
            sevenDayHours,
            projectedFourteenDayHours,
            remainingCapacityHours,
            projectedStatus: deriveWellbeingStatus(sevenDayHours),
            overloadRisk: projectedFourteenDayHours > threshold,
        };
    }).sort((left, right) => right.projectedFourteenDayHours - left.projectedFourteenDayHours);

    const projectForecast = projects.map((project) => {
        const trackedHours = Number((project.time_entries.reduce((sum, entry) => sum + entry.duration, 0) / 3600).toFixed(1));
        const approvedBillableHours = Number((project.time_entries
            .filter((entry) => entry.is_billable !== false)
            .reduce((sum, entry) => sum + entry.duration, 0) / 3600).toFixed(1));
        const projectedFourteenDayHours = Number((trackedHours + memberForecast.reduce((sum, member) => sum + (member.projectedFourteenDayHours / Math.max(projects.length, 1)), 0)).toFixed(1));
        const planningAccuracy = project.budget_hours
            ? clamp(Math.round(100 - (Math.abs(trackedHours - project.budget_hours) / project.budget_hours) * 100), 0, 100)
            : null;

        return {
            project_id: project.id,
            name: project.name,
            budgetHours: project.budget_hours,
            trackedHours,
            approvedBillableHours,
            projectedFourteenDayHours,
            planningAccuracy,
            burnRisk: Boolean(project.budget_hours && projectedFourteenDayHours > project.budget_hours),
        };
    }).sort((left, right) => right.trackedHours - left.trackedHours);

    const budgetAlerts = projectForecast
        .filter((project) => project.budgetHours && project.burnRisk)
        .map((project) => ({
            project_id: project.project_id,
            project_name: project.name,
            budgetHours: project.budgetHours,
            projectedHours: project.projectedFourteenDayHours,
            trackedHours: project.trackedHours,
        }));

    const referencedEntryIds = Array.from(
        new Set(
            auditLogs
                .map((log) => ((log.metadata || {}) as { entry_id?: string }).entry_id)
                .filter((entryId): entryId is string => Boolean(entryId)),
        ),
    );

    const referencedEntries = referencedEntryIds.length > 0
        ? await safeQuery('referenced_entries', () => prisma.timeEntry.findMany({
            where: { id: { in: referencedEntryIds } },
            select: { id: true, created_at: true },
        }), [])
        : [];

    const entryCreatedAt = new Map(referencedEntries.map((entry) => [entry.id, new Date(entry.created_at)]));
    const approvalLatencies = auditLogs
        .map((log) => {
            const metadata = (log.metadata || {}) as { entry_id?: string };
            if (!metadata.entry_id) {
                return null;
            }
            const createdAt = entryCreatedAt.get(metadata.entry_id);
            if (!createdAt) {
                return null;
            }
            return (new Date(log.created_at).getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        })
        .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);

    const approvalLatencyHours = approvalLatencies.length > 0
        ? Number((approvalLatencies.reduce((sum, value) => sum + value, 0) / approvalLatencies.length).toFixed(1))
        : 0;

    const billableLeakageHours = Number((approvedEntries.reduce((sum, entry) => {
        const uninvoiced = entry.invoice_line_items.length === 0;
        if (entry.is_billable === false || uninvoiced) {
            return sum + entry.duration;
        }
        return sum;
    }, 0) / 3600).toFixed(1));

    const planningProjects = projectForecast.filter((project) => project.planningAccuracy !== null);
    const planningAccuracyPct = planningProjects.length > 0
        ? Math.round(planningProjects.reduce((sum, project) => sum + (project.planningAccuracy || 0), 0) / planningProjects.length)
        : 0;

    return {
        managerExceptions: {
            pendingApprovals,
            idleWarnings: notifications.filter((notification) => notification.type === 'idle_warning').slice(0, 8),
            overtimeAlerts: notifications.filter((notification) => notification.type === 'overtime_alert').slice(0, 8),
            burnoutAlerts: notifications.filter((notification) => notification.type === 'burnout_alert').slice(0, 8),
            rejectedEntries: rejectedEntries.map((entry) => ({
                id: entry.id,
                task_description: entry.task_description,
                updated_at: entry.updated_at,
                user: entry.user,
                project: entry.project,
            })),
            budgetAlerts,
        },
        teamForecast: {
            members: memberForecast,
            projects: projectForecast,
        },
        teamBenchmarks: {
            planningAccuracyPct,
            approvalLatencyHours,
            billableLeakageHours,
            overloadRiskCount: memberForecast.filter((member) => member.overloadRisk).length,
            byPerson: memberForecast.map((member) => ({
                user_id: member.user_id,
                name: member.name,
                role: member.role,
                projectedFourteenDayHours: member.projectedFourteenDayHours,
                remainingCapacityHours: member.remainingCapacityHours,
                overloadRisk: member.overloadRisk,
            })),
        },
        meta: {
            degraded: degradedWarnings.length > 0,
            warnings: degradedWarnings,
        },
    };
};
