import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

export const listScheduledReports = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const role = req.user?.role;
        const canViewAll = role === 'Manager' || role === 'Admin';

        const reports = await prisma.scheduledReport.findMany({
            where: canViewAll ? undefined : { user_id: userId },
            orderBy: { created_at: 'desc' },
            include: { user: { select: { first_name: true, last_name: true, email: true } } },
        });

        res.status(200).json({ reports });
    } catch (error) {
        console.error('Failed to list scheduled reports:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createScheduledReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ message: 'Authenticated user required' }); return; }

        const { frequency, day_of_week, recipients, report_type } = req.body ?? {};

        if (!['weekly', 'monthly'].includes(frequency)) {
            res.status(400).json({ message: 'Frequency must be weekly or monthly' });
            return;
        }

        const report = await prisma.scheduledReport.create({
            data: {
                user_id: userId,
                frequency,
                day_of_week: typeof day_of_week === 'number' ? day_of_week : null,
                recipients: Array.isArray(recipients) ? recipients : [],
                report_type: report_type || 'summary',
            },
        });

        res.status(201).json(report);
    } catch (error) {
        console.error('Failed to create scheduled report:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateScheduledReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data: Record<string, unknown> = {};
        if (req.body.frequency) data.frequency = req.body.frequency;
        if (req.body.day_of_week !== undefined) data.day_of_week = req.body.day_of_week;
        if (req.body.recipients) data.recipients = req.body.recipients;
        if (req.body.report_type) data.report_type = req.body.report_type;
        if (typeof req.body.is_active === 'boolean') data.is_active = req.body.is_active;

        const reportId = req.params.id as string;
        const report = await prisma.scheduledReport.update({
            where: { id: reportId },
            data,
        });

        res.status(200).json(report);
    } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
            res.status(404).json({ message: 'Scheduled report not found' });
            return;
        }
        console.error('Failed to update scheduled report:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteScheduledReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const reportId = req.params.id as string;
        await prisma.scheduledReport.delete({ where: { id: reportId } });
        res.status(200).json({ message: 'Scheduled report deleted' });
    } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
            res.status(404).json({ message: 'Scheduled report not found' });
            return;
        }
        console.error('Failed to delete scheduled report:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
