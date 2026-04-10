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
exports.getOperationsInsights = exports.scoreTimeEntryRisk = exports.createEmptyOperationsInsights = void 0;
const db_1 = __importDefault(require("../config/db"));
const wellbeingService_1 = require("./wellbeingService");
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const roundHours = (seconds) => Number((seconds / 3600).toFixed(1));
const createEmptyOperationsInsights = () => ({
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
exports.createEmptyOperationsInsights = createEmptyOperationsInsights;
const scoreTimeEntryRisk = (entry) => {
    let score = 0;
    const reasons = [];
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
    }
    else if (durationHours <= 0.08) {
        score += 8;
        reasons.push('very short duration');
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
    const level = normalizedScore >= 60 ? 'high' : normalizedScore >= 30 ? 'medium' : 'low';
    return {
        score: normalizedScore,
        level,
        reasons,
    };
};
exports.scoreTimeEntryRisk = scoreTimeEntryRisk;
const getOperationsInsights = () => __awaiter(void 0, void 0, void 0, function* () {
    const degradedWarnings = [];
    const safeQuery = (label, query, fallback) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            return yield query();
        }
        catch (error) {
            console.error(`Operations insights dataset failed: ${label}`, error);
            degradedWarnings.push(label);
            return fallback;
        }
    });
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(now.getDate() - 14);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const [users, pendingEntries, rejectedEntries, notifications, projects, auditLogs, approvedEntries] = yield Promise.all([
        safeQuery('users', () => db_1.default.user.findMany({
            where: { is_active: true },
            select: {
                id: true,
                first_name: true,
                last_name: true,
                weekly_hour_limit: true,
                role: { select: { name: true } },
            },
        }), []),
        safeQuery('pending_entries', () => db_1.default.timeEntry.findMany({
            where: { status: 'pending' },
            include: {
                user: { select: { id: true, first_name: true, last_name: true, email: true } },
                project: { select: { id: true, name: true } },
            },
            orderBy: { created_at: 'desc' },
        }), []),
        safeQuery('rejected_entries', () => db_1.default.timeEntry.findMany({
            where: { status: 'rejected', updated_at: { gte: fourteenDaysAgo } },
            include: {
                user: { select: { first_name: true, last_name: true } },
                project: { select: { name: true } },
            },
            orderBy: { updated_at: 'desc' },
            take: 12,
        }), []),
        safeQuery('notifications', () => db_1.default.notification.findMany({
            where: {
                type: { in: ['idle_warning', 'overtime_alert', 'burnout_alert'] },
                created_at: { gte: fourteenDaysAgo },
            },
            include: {
                user: { select: { id: true, first_name: true, last_name: true } },
            },
            orderBy: { created_at: 'desc' },
        }), []),
        safeQuery('projects', () => db_1.default.project.findMany({
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
        safeQuery('audit_logs', () => db_1.default.auditLog.findMany({
            where: {
                action: { in: ['timesheet_approve', 'timesheet_reject'] },
                created_at: { gte: thirtyDaysAgo },
            },
            orderBy: { created_at: 'desc' },
        }), []),
        safeQuery('approved_entries', () => db_1.default.timeEntry.findMany({
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
    const sevenDayEntryRows = yield safeQuery('seven_day_entry_rows', () => db_1.default.timeEntry.groupBy({
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
        intelligence: (0, exports.scoreTimeEntryRisk)(entry),
    }));
    const memberForecast = users.map((user) => {
        var _a;
        const sevenDayHours = hoursByUser.get(user.id) || 0;
        const projectedFourteenDayHours = Number((sevenDayHours * 2).toFixed(1));
        const threshold = user.weekly_hour_limit ? user.weekly_hour_limit * 2 : 100;
        const remainingCapacityHours = Number((threshold - projectedFourteenDayHours).toFixed(1));
        return {
            user_id: user.id,
            name: `${user.first_name} ${user.last_name}`,
            role: ((_a = user.role) === null || _a === void 0 ? void 0 : _a.name) || 'Employee',
            sevenDayHours,
            projectedFourteenDayHours,
            remainingCapacityHours,
            projectedStatus: (0, wellbeingService_1.deriveWellbeingStatus)(sevenDayHours),
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
    const referencedEntryIds = Array.from(new Set(auditLogs
        .map((log) => (log.metadata || {}).entry_id)
        .filter((entryId) => Boolean(entryId))));
    const referencedEntries = referencedEntryIds.length > 0
        ? yield safeQuery('referenced_entries', () => db_1.default.timeEntry.findMany({
            where: { id: { in: referencedEntryIds } },
            select: { id: true, created_at: true },
        }), [])
        : [];
    const entryCreatedAt = new Map(referencedEntries.map((entry) => [entry.id, new Date(entry.created_at)]));
    const approvalLatencies = auditLogs
        .map((log) => {
        const metadata = (log.metadata || {});
        if (!metadata.entry_id) {
            return null;
        }
        const createdAt = entryCreatedAt.get(metadata.entry_id);
        if (!createdAt) {
            return null;
        }
        return (new Date(log.created_at).getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    })
        .filter((value) => value !== null && Number.isFinite(value) && value >= 0);
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
});
exports.getOperationsInsights = getOperationsInsights;
