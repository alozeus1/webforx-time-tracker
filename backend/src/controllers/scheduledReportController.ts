import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { sendApiError } from '../utils/http';

const normalizeRecipients = (value: unknown): string[] | null => {
    if (!Array.isArray(value)) {
        return null;
    }

    const emails = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);

    if (emails.length === 0) {
        return null;
    }

    return Array.from(new Set(emails));
};

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
        sendApiError(res, 500, 'SCHEDULED_REPORT_LIST_FAILED', 'Internal server error');
    }
};

export const createScheduledReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            sendApiError(res, 401, 'AUTH_REQUIRED', 'Authenticated user required');
            return;
        }

        const { frequency, day_of_week, recipients, report_type } = req.body ?? {};

        if (!['weekly', 'monthly'].includes(frequency)) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'Frequency must be weekly or monthly');
            return;
        }

        const parsedDayOfWeek = day_of_week !== undefined ? Number(day_of_week) : null;
        if (frequency === 'weekly') {
            if (
                parsedDayOfWeek === null
                || !Number.isInteger(parsedDayOfWeek)
                || parsedDayOfWeek < 0
                || parsedDayOfWeek > 6
            ) {
                sendApiError(res, 400, 'VALIDATION_ERROR', 'day_of_week must be between 0 and 6 for weekly reports');
                return;
            }
        }

        const normalizedRecipients = normalizeRecipients(recipients);
        if (!normalizedRecipients) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'At least one recipient email is required');
            return;
        }

        const report = await prisma.scheduledReport.create({
            data: {
                user_id: userId,
                frequency,
                day_of_week: frequency === 'weekly' ? parsedDayOfWeek : null,
                recipients: normalizedRecipients,
                report_type: typeof report_type === 'string' && report_type.trim() ? report_type.trim() : 'summary',
            },
        });

        res.status(201).json(report);
    } catch (error) {
        console.error('Failed to create scheduled report:', error);
        sendApiError(res, 500, 'SCHEDULED_REPORT_CREATE_FAILED', 'Internal server error');
    }
};

export const updateScheduledReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data: Record<string, unknown> = {};
        if (req.body.frequency) {
            if (!['weekly', 'monthly'].includes(req.body.frequency)) {
                sendApiError(res, 400, 'VALIDATION_ERROR', 'Frequency must be weekly or monthly');
                return;
            }
            data.frequency = req.body.frequency;
        }
        if (req.body.day_of_week !== undefined) {
            const day = Number(req.body.day_of_week);
            if (!Number.isInteger(day) || day < 0 || day > 6) {
                sendApiError(res, 400, 'VALIDATION_ERROR', 'day_of_week must be between 0 and 6');
                return;
            }
            data.day_of_week = day;
        }
        if (req.body.recipients !== undefined) {
            const normalizedRecipients = normalizeRecipients(req.body.recipients);
            if (!normalizedRecipients) {
                sendApiError(res, 400, 'VALIDATION_ERROR', 'At least one recipient email is required');
                return;
            }
            data.recipients = normalizedRecipients;
        }
        if (req.body.report_type) data.report_type = req.body.report_type;
        if (typeof req.body.is_active === 'boolean') data.is_active = req.body.is_active;

        if (Object.keys(data).length === 0) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'No valid fields provided');
            return;
        }

        const reportId = req.params.id as string;
        const report = await prisma.scheduledReport.update({
            where: { id: reportId },
            data,
        });

        res.status(200).json(report);
    } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
            sendApiError(res, 404, 'SCHEDULED_REPORT_NOT_FOUND', 'Scheduled report not found');
            return;
        }
        console.error('Failed to update scheduled report:', error);
        sendApiError(res, 500, 'SCHEDULED_REPORT_UPDATE_FAILED', 'Internal server error');
    }
};

export const deleteScheduledReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const reportId = req.params.id as string;
        await prisma.scheduledReport.delete({ where: { id: reportId } });
        res.status(200).json({ message: 'Scheduled report deleted' });
    } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
            sendApiError(res, 404, 'SCHEDULED_REPORT_NOT_FOUND', 'Scheduled report not found');
            return;
        }
        console.error('Failed to delete scheduled report:', error);
        sendApiError(res, 500, 'SCHEDULED_REPORT_DELETE_FAILED', 'Internal server error');
    }
};
