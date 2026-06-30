import { Request, Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { createEmptyOperationsInsights, getOperationsInsights } from '../services/opsInsightsService';

const formatHoursMetric = (hours: number) => {
    if (hours > 0 && hours < 0.1) {
        return hours.toFixed(2);
    }

    return hours.toFixed(1);
};

const normalizeReportRangeStart = (range: unknown) => {
    const now = new Date();
    const startDate = new Date();
    if (range === '7d') startDate.setDate(now.getDate() - 7);
    else if (range === '30d') startDate.setDate(now.getDate() - 30);
    else if (range === '90d') startDate.setDate(now.getDate() - 90);
    else startDate.setDate(now.getDate() - 30);
    return { now, startDate };
};

const normalizeOptionalFilter = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed && trimmed !== 'all' ? trimmed : null;
};

const buildReportWhereClause = ({
    req,
    includeDateRange,
}: {
    req: AuthRequest;
    includeDateRange: boolean;
}) => {
    const userId = req.user?.userId;
    const role = req.user?.role;
    const canViewAll = role === 'Manager' || role === 'Admin';
    const selectedProjectId = normalizeOptionalFilter(req.query.projectId);
    const selectedUserId = normalizeOptionalFilter(req.query.queryUserId);
    const selectedTeamName = normalizeOptionalFilter(req.query.teamName);
    const whereClause: Prisma.TimeEntryWhereInput = {
        organization_id: req.user!.organization_id,
    };

    if (!canViewAll) {
        whereClause.user_id = userId;
    } else if (selectedUserId) {
        whereClause.user_id = selectedUserId;
    } else if (selectedTeamName) {
        whereClause.user = { team_name: selectedTeamName };
    }

    if (selectedProjectId) {
        whereClause.project_id = selectedProjectId;
    }

    const { now, startDate } = normalizeReportRangeStart(req.query.range);
    if (includeDateRange) {
        whereClause.start_time = { gte: startDate };
    }

    return { whereClause, now, startDate, selectedProjectId };
};

export const exportTimeEntries = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            res.status(401).json({ message: 'Authenticated user is required' });
            return;
        }

        const { whereClause } = buildReportWhereClause({ req, includeDateRange: true });

        const entries = await prisma.timeEntry.findMany({
            where: whereClause,
            include: {
                user: { select: { first_name: true, last_name: true, email: true, hourly_rate: true, team_name: true } },
                project: { select: { name: true } }
            },
            orderBy: { start_time: 'desc' }
        });

        // Generate CSV content
        let csvContent = 'Date,Employee,Email,Team,Project,Task,Duration (Hours),Status,Billable Amount ($)\n';

        entries.forEach(entry => {
            const date = new Date(entry.start_time).toLocaleDateString();
            const name = `"${entry.user.first_name} ${entry.user.last_name}"`;
            const email = entry.user.email;
            const team = `"${entry.user.team_name || 'Unassigned'}"`;
            const project = `"${entry.project?.name || 'Unassigned'}"`;
            const task = `"${entry.task_description}"`;
            const hours = (entry.duration / 3600).toFixed(2);
            const status = entry.status;

            // Calculate billable if hourly rate exists
            const rate = parseFloat(entry.user.hourly_rate?.toString() || '0');
            const billable = (parseFloat(hours) * rate).toFixed(2);

            csvContent += `${date},${name},${email},${team},${project},${task},${hours},${status},${billable}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="timesheet_export.csv"');
        res.status(200).send(csvContent);

    } catch (error) {
        console.error('Failed to export entries:', error);
        res.status(500).json({ message: 'Internal server error while exporting' });
    }
};

export const getAnalyticsDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            res.status(401).json({ message: 'Authenticated user is required' });
            return;
        }

        const { whereClause, now, startDate, selectedProjectId } = buildReportWhereClause({ req, includeDateRange: true });

        // Fetch entries
        const entries = await prisma.timeEntry.findMany({
            where: whereClause,
            include: {
                user: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        hourly_rate: true,
                        team_name: true,
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
            totalDurationSec += entry.duration;
            const rate = parseFloat(entry.user.hourly_rate?.toString() || '0');
            billableAmount += (entry.duration / 3600) * rate;
        });

        const totalHours = totalDurationSec / 3600;
        const activeProjectsCount = await prisma.project.count({
            where: selectedProjectId
                ? { id: selectedProjectId, is_active: true, organization_id: req.user!.organization_id }
                : { is_active: true, organization_id: req.user!.organization_id },
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
        const projectHoursMap = new Map<string, { id: string, name: string, hours: number }>();
        entries.forEach(entry => {
            if (!entry.project) return;
            const existing = projectHoursMap.get(entry.project.id) || { id: entry.project.id, name: entry.project.name, hours: 0 };
            existing.hours += (entry.duration / 3600);
            projectHoursMap.set(entry.project.id, existing);
        });

        const projectDistribution = Array.from(projectHoursMap.values())
            .map(p => ({
                ...p,
                percentage: totalHours > 0 ? Math.round((p.hours / totalHours) * 100) : 0
            }))
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

        const prevWhereClause: Prisma.TimeEntryWhereInput = {
            ...whereClause,
            start_time: { gte: prevStart, lt: startDate },
        };

        const prevEntries = await prisma.timeEntry.findMany({
            where: prevWhereClause,
            select: {
                duration: true,
                project_id: true,
                is_billable: true,
                user: { select: { hourly_rate: true } },
            },
        });

        let prevTotalSec = 0;
        let prevBillable = 0;
        const prevProjectIds = new Set<string>();
        let prevBillableSec = 0;

        prevEntries.forEach(entry => {
            prevTotalSec += entry.duration;
            if (entry.project_id) prevProjectIds.add(entry.project_id);
            const rate = parseFloat(entry.user.hourly_rate?.toString() || '0');
            prevBillable += (entry.duration / 3600) * rate;
            if (entry.is_billable !== false) {
                prevBillableSec += entry.duration;
            }
        });

        const prevHours = prevTotalSec / 3600;
        const prevAvgProd = prevTotalSec > 0 ? Math.round((prevBillableSec / prevTotalSec) * 100) : 0;

        const pctChange = (current: number, previous: number): string => {
            if (previous === 0) return current > 0 ? '+100%' : '0%';
            const change = Math.round(((current - previous) / previous) * 100);
            return change >= 0 ? `+${change}%` : `${change}%`;
        };

        // Compute User Productivity Breakdown
        const userMap = new Map<string, any>();
        entries.forEach(entry => {
            const uId = entry.user.id;
            if (!userMap.has(uId)) {
                userMap.set(uId, {
                    id: uId,
                    name: `${entry.user.first_name} ${entry.user.last_name}`,
                    teamName: entry.user.team_name || 'Unassigned',
                    role: entry.user.role?.name || 'Employee',
                    initials: `${entry.user.first_name[0]}${entry.user.last_name[0]}`,
                    totalHours: 0,
                    projectMap: new Map<string, number>()
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
                teamName: u.teamName,
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

    } catch (error) {
        console.error('Failed to generate analytics dashboard:', error);
        res.status(500).json({ message: 'Internal server error while generating analytics' });
    }
};

export const getOperationsDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const insights = await getOperationsInsights(req.user!.organization_id);
        res.status(200).json(insights);
    } catch (error) {
        console.error('Failed to load operations dashboard:', error);
        res.status(200).json({
            ...createEmptyOperationsInsights(),
            meta: {
                degraded: true,
                warnings: ['operations_dashboard'],
            },
        });
    }
};

type ShareArtifactType = 'operations' | 'project-burn' | 'invoice-evidence';

const buildSharedArtifactPayload = async (type: ShareArtifactType, id?: string, organizationId?: string) => {
    if (type === 'operations') {
        const operations = await getOperationsInsights();
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

        const project = await prisma.project.findFirst({
            where: { id, organization_id: organizationId },
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

    const invoice = await prisma.invoice.findFirst({
        where: { id, organization_id: organizationId },
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
};

export const createShareLink = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const type = req.body?.type as ShareArtifactType | undefined;
        const id = typeof req.body?.id === 'string' ? req.body.id : undefined;

        if (!type || !['operations', 'project-burn', 'invoice-evidence'].includes(type)) {
            res.status(400).json({ message: 'Valid share artifact type is required' });
            return;
        }

        const payload = await buildSharedArtifactPayload(type, id, req.user!.organization_id);
        const token = jwt.sign(
            {
                type,
                id,
                // Embed org_id so getSharedArtifact can enforce tenant isolation
                // when re-fetching the artifact from the database.
                organization_id: req.user!.organization_id,
                exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
            },
            env.jwtSecret,
        );

        res.status(201).json({
            token,
            url: `${env.frontendUrl.replace(/\/+$/, '')}/share/${token}`,
            preview: payload,
        });
    } catch (error) {
        console.error('Failed to create share link:', error);
        res.status(500).json({ message: error instanceof Error ? error.message : 'Internal server error while creating share link' });
    }
};

export const getSharedArtifact = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.params.token as string;
        const payload = jwt.verify(token, env.jwtSecret) as { type: ShareArtifactType; id?: string; organization_id?: string };
        // Pass organization_id from the token so every DB lookup is tenant-scoped.
        // Tokens created before this fix won't have organization_id — those will
        // receive a 404 (safe: they can re-share to generate a new scoped token).
        if (!payload.organization_id) {
            res.status(404).json({ message: 'Shared artifact not found or expired' });
            return;
        }
        const artifact = await buildSharedArtifactPayload(payload.type, payload.id, payload.organization_id);
        res.status(200).json(artifact);
    } catch (error) {
        console.error('Failed to load shared artifact:', error);
        res.status(404).json({ message: 'Shared artifact not found or expired' });
    }
};
