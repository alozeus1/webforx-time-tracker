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
                user: { select: { id: true, first_name: true, last_name: true, role_id: true, hourly_rate: true } },
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
        const avgProductivity = 88; // Placeholder for now, could be dynamic (billable ratio)

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

        // Compute Hours Trend (Weekly buckets over the period)
        const weeksMap = new Map<string, number>(); // format: "Wk X" -> hours
        // Simplistic grouping by week diff from start
        entries.forEach(entry => {
            const entryDate = new Date(entry.start_time);
            const diffTime = entryDate.getTime() - startDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            const weekNumber = Math.floor(diffDays / 7) + 1;
            const weekKey = `Week ${weekNumber}`;
            weeksMap.set(weekKey, (weeksMap.get(weekKey) || 0) + (entry.duration / 3600));
        });

        const hoursTrend = Array.from(weeksMap.entries())
            .map(([week, hours]) => ({ name: week, hours }))
            .sort((a, b) => a.name.localeCompare(b.name));

        // Compute User Productivity Breakdown
        const userMap = new Map<string, any>();
        entries.forEach(entry => {
            const uId = entry.user.id;
            if (!userMap.has(uId)) {
                userMap.set(uId, {
                    id: uId,
                    name: `${entry.user.first_name} ${entry.user.last_name}`,
                    role: entry.user.role_id, // Could map to role name if fetched
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

        const userBreakdown = Array.from(userMap.values()).map(u => {
            let primaryProject = 'Unassigned';
            let maxDur = 0;
            for (const [pName, dur] of u.projectMap.entries()) {
                if (dur > maxDur) {
                    maxDur = dur;
                    primaryProject = pName;
                }
            }
            return {
                id: u.id,
                name: u.name,
                role: 'Engineer', // Fallback
                initials: u.initials,
                primaryProject,
                totalHours: u.totalHours.toFixed(1),
                efficiency: 90, // Placeholder
                status: 'On Track'
            };
        }).sort((a, b) => parseFloat(b.totalHours) - parseFloat(a.totalHours));

        res.status(200).json({
            metrics: {
                totalHours: totalHours.toFixed(1),
                activeProjects: activeProjectsCount,
                avgProductivity,
                billableAmount: billableAmount.toFixed(2),
                trends: {
                    hours: "+5%", // Placeholder trends
                    projects: "0%",
                    productivity: "+2%",
                    billable: "+8%"
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
