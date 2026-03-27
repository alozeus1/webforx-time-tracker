import { Request, Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { Prisma } from '@prisma/client';

export const exportTimeEntries = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const role = req.user?.role;
        const canExportAllEntries = role === 'Manager' || role === 'Admin';

        if (!userId) {
            res.status(401).json({ message: 'Authenticated user is required' });
            return;
        }

        const entries = await prisma.timeEntry.findMany({
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
            const date = new Date(entry.start_time).toLocaleDateString();
            const name = `"${entry.user.first_name} ${entry.user.last_name}"`;
            const email = entry.user.email;
            const project = `"${entry.project?.name || 'Unassigned'}"`;
            const task = `"${entry.task_description}"`;
            const hours = (entry.duration / 3600).toFixed(2);
            const status = entry.status;

            // Calculate billable if hourly rate exists
            const rate = parseFloat(entry.user.hourly_rate?.toString() || '0');
            const billable = (parseFloat(hours) * rate).toFixed(2);

            csvContent += `${date},${name},${email},${project},${task},${hours},${status},${billable}\n`;
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
        const role = req.user?.role;
        const canViewAll = role === 'Manager' || role === 'Admin';

        if (!userId) {
            res.status(401).json({ message: 'Authenticated user is required' });
            return;
        }

        const { range = '30d', projectId, queryUserId } = req.query;

        // Build where clause
        const whereClause: Prisma.TimeEntryWhereInput = {};

        // 1. Role / User filter
        if (!canViewAll) {
            whereClause.user_id = userId;
        } else if (queryUserId && queryUserId !== 'all') {
            whereClause.user_id = String(queryUserId);
        }

        // 2. Project filter
        if (projectId && projectId !== 'all') {
            whereClause.project_id = String(projectId);
        }

        // 3. Date Range
        const now = new Date();
        const startDate = new Date();
        if (range === '7d') startDate.setDate(now.getDate() - 7);
        else if (range === '30d') startDate.setDate(now.getDate() - 30);
        else if (range === '90d') startDate.setDate(now.getDate() - 90);
        else startDate.setDate(now.getDate() - 30); // Default 30d

        whereClause.start_time = { gte: startDate };

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
                        role: { select: { name: true } },
                    },
                },
                project: { select: { id: true, name: true } }
            }
        });

        // Compute Metric Cards
        let totalDurationSec = 0;
        let billableAmount = 0;
        const projectIds = new Set<string>();

        entries.forEach(entry => {
            totalDurationSec += entry.duration;
            if (entry.project_id) projectIds.add(entry.project_id);
            const rate = parseFloat(entry.user.hourly_rate?.toString() || '0');
            billableAmount += (entry.duration / 3600) * rate;
        });

        const totalHours = totalDurationSec / 3600;
        const activeProjectsCount = projectIds.size;
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
            include: {
                user: { select: { hourly_rate: true } },
                project: { select: { id: true } },
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
            if ((entry as any).is_billable !== false) {
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
                initials: u.initials,
                primaryProject,
                totalHours: u.totalHours.toFixed(1),
                efficiency,
                status: efficiency >= 85 ? 'On Track' : 'Needs Attention'
            };
        }).sort((a, b) => parseFloat(b.totalHours) - parseFloat(a.totalHours));

        res.status(200).json({
            metrics: {
                totalHours: totalHours.toFixed(1),
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
