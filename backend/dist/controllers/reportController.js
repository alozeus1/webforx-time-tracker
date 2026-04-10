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
exports.getSharedArtifact = exports.createShareLink = exports.getOperationsDashboard = exports.getAnalyticsDashboard = exports.exportTimeEntries = void 0;
const db_1 = __importDefault(require("../config/db"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const opsInsightsService_1 = require("../services/opsInsightsService");
const formatHoursMetric = (hours) => {
    if (hours > 0 && hours < 0.1) {
        return hours.toFixed(2);
    }
    return hours.toFixed(1);
};
const exportTimeEntries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        const canExportAllEntries = role === 'Manager' || role === 'Admin';
        if (!userId) {
            res.status(401).json({ message: 'Authenticated user is required' });
            return;
        }
        const entries = yield db_1.default.timeEntry.findMany({
            where: canExportAllEntries ? undefined : { user_id: userId },
            include: {
                user: { select: { first_name: true, last_name: true, email: true, hourly_rate: true } },
                project: { select: { name: true } }
            },
            orderBy: { start_time: 'desc' }
        });
        // Generate CSV content
        let csvContent = 'Date,Employee,Email,Project,Task,Duration (Hours),Status,Billable Amount ($)\n';
        entries.forEach(entry => {
            var _a, _b;
            const date = new Date(entry.start_time).toLocaleDateString();
            const name = `"${entry.user.first_name} ${entry.user.last_name}"`;
            const email = entry.user.email;
            const project = `"${((_a = entry.project) === null || _a === void 0 ? void 0 : _a.name) || 'Unassigned'}"`;
            const task = `"${entry.task_description}"`;
            const hours = (entry.duration / 3600).toFixed(2);
            const status = entry.status;
            // Calculate billable if hourly rate exists
            const rate = parseFloat(((_b = entry.user.hourly_rate) === null || _b === void 0 ? void 0 : _b.toString()) || '0');
            const billable = (parseFloat(hours) * rate).toFixed(2);
            csvContent += `${date},${name},${email},${project},${task},${hours},${status},${billable}\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="timesheet_export.csv"');
        res.status(200).send(csvContent);
    }
    catch (error) {
        console.error('Failed to export entries:', error);
        res.status(500).json({ message: 'Internal server error while exporting' });
    }
});
exports.exportTimeEntries = exportTimeEntries;
const getAnalyticsDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        const canViewAll = role === 'Manager' || role === 'Admin';
        if (!userId) {
            res.status(401).json({ message: 'Authenticated user is required' });
            return;
        }
        const { range = '30d', projectId, queryUserId } = req.query;
        const selectedProjectId = projectId && projectId !== 'all' ? String(projectId) : null;
        // Build where clause
        const whereClause = {};
        // 1. Role / User filter
        if (!canViewAll) {
            whereClause.user_id = userId;
        }
        else if (queryUserId && queryUserId !== 'all') {
            whereClause.user_id = String(queryUserId);
        }
        // 2. Project filter
        if (selectedProjectId) {
            whereClause.project_id = selectedProjectId;
        }
        // 3. Date Range
        const now = new Date();
        const startDate = new Date();
        if (range === '7d')
            startDate.setDate(now.getDate() - 7);
        else if (range === '30d')
            startDate.setDate(now.getDate() - 30);
        else if (range === '90d')
            startDate.setDate(now.getDate() - 90);
        else
            startDate.setDate(now.getDate() - 30); // Default 30d
        whereClause.start_time = { gte: startDate };
        // Fetch entries
        const entries = yield db_1.default.timeEntry.findMany({
            where: whereClause,
            include: {
                user: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        hourly_rate: true,
                        role: { select: { name: true } },
                    },
                },
                project: { select: { id: true, name: true } }
            }
        });
        // Compute Metric Cards
        let totalDurationSec = 0;
        let billableAmount = 0;
        entries.forEach(entry => {
            var _a;
            totalDurationSec += entry.duration;
            const rate = parseFloat(((_a = entry.user.hourly_rate) === null || _a === void 0 ? void 0 : _a.toString()) || '0');
            billableAmount += (entry.duration / 3600) * rate;
        });
        const totalHours = totalDurationSec / 3600;
        const activeProjectsCount = yield db_1.default.project.count({
            where: selectedProjectId
                ? { id: selectedProjectId, is_active: true }
                : { is_active: true },
        });
        let billableSeconds = 0;
        entries.forEach(entry => {
            if (entry.is_billable !== false) {
                billableSeconds += entry.duration;
            }
        });
        const avgProductivity = totalDurationSec > 0
            ? Math.round((billableSeconds / totalDurationSec) * 100)
            : 0;
        // Compute Project Distribution
        const projectHoursMap = new Map();
        entries.forEach(entry => {
            if (!entry.project)
                return;
            const existing = projectHoursMap.get(entry.project.id) || { id: entry.project.id, name: entry.project.name, hours: 0 };
            existing.hours += (entry.duration / 3600);
            projectHoursMap.set(entry.project.id, existing);
        });
        const projectDistribution = Array.from(projectHoursMap.values())
            .map(p => (Object.assign(Object.assign({}, p), { percentage: totalHours > 0 ? Math.round((p.hours / totalHours) * 100) : 0 })))
            .sort((a, b) => b.hours - a.hours);
        // Compute Hours Trend (Weekly buckets over the period, including zero-hour weeks)
        const totalDays = Math.max(Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)), 1);
        const weekCount = Math.max(Math.ceil(totalDays / 7), 1);
        const weekBuckets = Array.from({ length: weekCount }, (_, index) => ({
            name: `Week ${index + 1}`,
            hours: 0,
        }));
        entries.forEach(entry => {
            const entryDate = new Date(entry.start_time);
            const diffTime = entryDate.getTime() - startDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            const weekIndex = Math.min(Math.max(Math.floor(diffDays / 7), 0), weekCount - 1);
            weekBuckets[weekIndex].hours += (entry.duration / 3600);
        });
        const hoursTrend = weekBuckets;
        // Compute period-over-period trends
        const periodDays = Math.max(Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)), 1);
        const prevStart = new Date(startDate);
        prevStart.setDate(prevStart.getDate() - periodDays);
        const prevWhereClause = Object.assign(Object.assign({}, whereClause), { start_time: { gte: prevStart, lt: startDate } });
        const prevEntries = yield db_1.default.timeEntry.findMany({
            where: prevWhereClause,
            include: {
                user: { select: { hourly_rate: true } },
                project: { select: { id: true } },
            },
        });
        let prevTotalSec = 0;
        let prevBillable = 0;
        const prevProjectIds = new Set();
        let prevBillableSec = 0;
        prevEntries.forEach(entry => {
            var _a;
            prevTotalSec += entry.duration;
            if (entry.project_id)
                prevProjectIds.add(entry.project_id);
            const rate = parseFloat(((_a = entry.user.hourly_rate) === null || _a === void 0 ? void 0 : _a.toString()) || '0');
            prevBillable += (entry.duration / 3600) * rate;
            if (entry.is_billable !== false) {
                prevBillableSec += entry.duration;
            }
        });
        const prevHours = prevTotalSec / 3600;
        const prevAvgProd = prevTotalSec > 0 ? Math.round((prevBillableSec / prevTotalSec) * 100) : 0;
        const pctChange = (current, previous) => {
            if (previous === 0)
                return current > 0 ? '+100%' : '0%';
            const change = Math.round(((current - previous) / previous) * 100);
            return change >= 0 ? `+${change}%` : `${change}%`;
        };
        // Compute User Productivity Breakdown
        const userMap = new Map();
        entries.forEach(entry => {
            var _a;
            const uId = entry.user.id;
            if (!userMap.has(uId)) {
                userMap.set(uId, {
                    id: uId,
                    name: `${entry.user.first_name} ${entry.user.last_name}`,
                    role: ((_a = entry.user.role) === null || _a === void 0 ? void 0 : _a.name) || 'Employee',
                    initials: `${entry.user.first_name[0]}${entry.user.last_name[0]}`,
                    totalHours: 0,
                    projectMap: new Map()
                });
            }
            const uData = userMap.get(uId);
            uData.totalHours += (entry.duration / 3600);
            if (entry.project) {
                uData.projectMap.set(entry.project.name, (uData.projectMap.get(entry.project.name) || 0) + entry.duration);
            }
        });
        const usersList = Array.from(userMap.values());
        const maxUserHours = Math.max(...usersList.map((user) => user.totalHours), 0);
        const userBreakdown = usersList.map(u => {
            let primaryProject = 'Unassigned';
            let maxDur = 0;
            for (const [pName, dur] of u.projectMap.entries()) {
                if (dur > maxDur) {
                    maxDur = dur;
                    primaryProject = pName;
                }
            }
            const efficiency = maxUserHours > 0 ? Math.round((u.totalHours / maxUserHours) * 100) : 0;
            return {
                id: u.id,
                name: u.name,
                role: u.role,
                initials: u.initials,
                primaryProject,
                totalHours: formatHoursMetric(u.totalHours),
                efficiency,
                status: efficiency >= 85 ? 'On Track' : 'Needs Attention'
            };
        }).sort((a, b) => parseFloat(b.totalHours) - parseFloat(a.totalHours));
        res.status(200).json({
            metrics: {
                totalHours: formatHoursMetric(totalHours),
                activeProjects: activeProjectsCount,
                avgProductivity,
                billableAmount: billableAmount.toFixed(2),
                trends: {
                    hours: pctChange(totalHours, prevHours),
                    projects: pctChange(activeProjectsCount, prevProjectIds.size),
                    productivity: pctChange(avgProductivity, prevAvgProd),
                    billable: pctChange(billableAmount, prevBillable),
                }
            },
            hoursTrend,
            projectDistribution,
            userBreakdown
        });
    }
    catch (error) {
        console.error('Failed to generate analytics dashboard:', error);
        res.status(500).json({ message: 'Internal server error while generating analytics' });
    }
});
exports.getAnalyticsDashboard = getAnalyticsDashboard;
const getOperationsDashboard = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const insights = yield (0, opsInsightsService_1.getOperationsInsights)();
        res.status(200).json(insights);
    }
    catch (error) {
        console.error('Failed to load operations dashboard:', error);
        res.status(200).json(Object.assign(Object.assign({}, (0, opsInsightsService_1.createEmptyOperationsInsights)()), { meta: {
                degraded: true,
                warnings: ['operations_dashboard'],
            } }));
    }
});
exports.getOperationsDashboard = getOperationsDashboard;
const buildSharedArtifactPayload = (type, id) => __awaiter(void 0, void 0, void 0, function* () {
    if (type === 'operations') {
        const operations = yield (0, opsInsightsService_1.getOperationsInsights)();
        return {
            type,
            title: 'Operations trust summary',
            description: 'Client-facing summary of team health, review hygiene, and delivery risk.',
            generatedAt: new Date().toISOString(),
            data: operations,
        };
    }
    if (type === 'project-burn') {
        if (!id) {
            throw new Error('project_id is required');
        }
        const project = yield db_1.default.project.findUnique({
            where: { id },
            include: {
                time_entries: {
                    select: {
                        duration: true,
                        is_billable: true,
                        status: true,
                    },
                },
            },
        });
        if (!project) {
            throw new Error('Project not found');
        }
        const trackedHours = Number((project.time_entries.reduce((sum, entry) => sum + entry.duration, 0) / 3600).toFixed(1));
        const approvedBillableHours = Number((project.time_entries
            .filter((entry) => entry.is_billable !== false && entry.status === 'approved')
            .reduce((sum, entry) => sum + entry.duration, 0) / 3600).toFixed(1));
        return {
            type,
            title: `${project.name} burn report`,
            description: 'Approved effort, billable progress, and budget burn for a single project.',
            generatedAt: new Date().toISOString(),
            data: {
                id: project.id,
                name: project.name,
                description: project.description,
                budgetHours: project.budget_hours,
                trackedHours,
                approvedBillableHours,
                overBudget: Boolean(project.budget_hours && trackedHours > project.budget_hours),
            },
        };
    }
    if (!id) {
        throw new Error('invoice_id is required');
    }
    const invoice = yield db_1.default.invoice.findUnique({
        where: { id },
        include: {
            project: { select: { name: true } },
            creator: { select: { first_name: true, last_name: true } },
            line_items: {
                include: {
                    time_entry: {
                        select: {
                            start_time: true,
                            end_time: true,
                            task_description: true,
                            status: true,
                        },
                    },
                },
            },
        },
    });
    if (!invoice) {
        throw new Error('Invoice not found');
    }
    return {
        type,
        title: `${invoice.invoice_number} invoice evidence`,
        description: 'Approved line-item evidence for this invoice.',
        generatedAt: new Date().toISOString(),
        data: invoice,
    };
});
const createShareLink = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const type = (_a = req.body) === null || _a === void 0 ? void 0 : _a.type;
        const id = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.id) === 'string' ? req.body.id : undefined;
        if (!type || !['operations', 'project-burn', 'invoice-evidence'].includes(type)) {
            res.status(400).json({ message: 'Valid share artifact type is required' });
            return;
        }
        const payload = yield buildSharedArtifactPayload(type, id);
        const token = jsonwebtoken_1.default.sign({
            type,
            id,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
        }, env_1.env.jwtSecret);
        res.status(201).json({
            token,
            url: `${env_1.env.frontendUrl.replace(/\/+$/, '')}/share/${token}`,
            preview: payload,
        });
    }
    catch (error) {
        console.error('Failed to create share link:', error);
        res.status(500).json({ message: error instanceof Error ? error.message : 'Internal server error while creating share link' });
    }
});
exports.createShareLink = createShareLink;
const getSharedArtifact = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = req.params.token;
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
        const artifact = yield buildSharedArtifactPayload(payload.type, payload.id);
        res.status(200).json(artifact);
    }
    catch (error) {
        console.error('Failed to load shared artifact:', error);
        res.status(404).json({ message: 'Shared artifact not found or expired' });
    }
});
exports.getSharedArtifact = getSharedArtifact;
