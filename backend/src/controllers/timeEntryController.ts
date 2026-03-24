import { Request, Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

const requireUserId = (req: AuthRequest): string => {
    if (!req.user?.userId) {
        throw new Error('Authenticated user is required');
    }

    return req.user.userId;
};

export const startTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { project_id, task_description } = req.body;
        const user_id = requireUserId(req);

        const existingTimer = await prisma.activeTimer.findUnique({ where: { user_id } });
        if (existingTimer) {
            res.status(400).json({ message: 'A timer is already running for this user' });
            return;
        }

        const newTimer = await prisma.activeTimer.create({
            data: {
                user_id,
                project_id,
                task_description,
                start_time: new Date(),
            },
        });

        res.status(201).json(newTimer);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const stopTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const { notes } = req.body;

        const activeTimer = await prisma.activeTimer.findUnique({ where: { user_id } });
        if (!activeTimer) {
            res.status(404).json({ message: 'No active timer found' });
            return;
        }

        const end_time = new Date();
        const duration = Math.floor((end_time.getTime() - new Date(activeTimer.start_time).getTime()) / 1000);

        const timeEntry = await prisma.timeEntry.create({
            data: {
                user_id,
                project_id: activeTimer.project_id,
                task_description: activeTimer.task_description,
                start_time: activeTimer.start_time,
                end_time,
                duration,
                entry_type: 'timer',
                notes,
            },
        });

        await prisma.activeTimer.delete({ where: { user_id } });

        res.status(200).json(timeEntry);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const manualEntry = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { project_id, task_description, start_time, end_time, notes } = req.body;
        const user_id = requireUserId(req);

        const start = new Date(start_time);
        const end = new Date(end_time);
        const duration = Math.floor((end.getTime() - start.getTime()) / 1000);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || duration <= 0) {
            res.status(400).json({ message: 'Invalid manual time entry window' });
            return;
        }

        const timeEntry = await prisma.timeEntry.create({
            data: {
                user_id,
                project_id,
                task_description,
                start_time: start,
                end_time: end,
                duration,
                entry_type: 'manual',
                notes,
            },
        });

        await prisma.auditLog.create({
            data: {
                user_id,
                action: 'manual_time_entry_created',
                resource: 'time_entry',
                metadata: {
                    entry_id: timeEntry.id,
                    project_id,
                    start_time,
                    end_time,
                },
            },
        });

        res.status(201).json(timeEntry);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getMyEntries = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const entries = await prisma.timeEntry.findMany({
            where: { user_id },
            orderBy: { start_time: 'desc' },
            include: { project: { select: { name: true } } },
        });

        // Also fetch active timer
        const activeTimer = await prisma.activeTimer.findUnique({
            where: { user_id },
            include: { project: { select: { name: true } } },
        });

        res.status(200).json({ entries, activeTimer });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const pingTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);

        const activeTimer = await prisma.activeTimer.findUnique({
            where: { user_id },
        });

        if (!activeTimer) {
            res.status(404).json({ message: 'No active timer found to ping' });
            return;
        }

        await prisma.activeTimer.update({
            where: { user_id },
            data: { last_active_ping: new Date() }
        });

        res.status(200).json({ message: 'Ping successful' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

// --- Timesheet Approvals (Managers/Admins) ---
export const getPendingTimesheets = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Find all time entries with 'pending' status
        const pendingEntries = await prisma.timeEntry.findMany({
            where: { status: 'pending' },
            include: {
                user: { select: { id: true, first_name: true, last_name: true, email: true } },
                project: { select: { name: true } }
            },
            orderBy: { created_at: 'desc' },
        });

        res.status(200).json({ entries: pendingEntries });
    } catch (error) {
        console.error('Failed to get pending timesheets:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const reviewTimesheet = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const entryId = req.params.entryId as string;
        const { action } = req.body; // 'approve' or 'reject'

        if (!['approve', 'reject'].includes(action)) {
            res.status(400).json({ message: 'Invalid action. Must be approve or reject.' });
            return;
        }

        const statusMap = { approve: 'approved', reject: 'rejected' };

        const updatedEntry = await prisma.timeEntry.update({
            where: { id: entryId },
            data: { status: statusMap[action as keyof typeof statusMap] }
        });

        // Notify the user about the decision
        await prisma.notification.create({
            data: {
                user_id: updatedEntry.user_id,
                message: `Your timesheet for ${updatedEntry.task_description} was ${statusMap[action as keyof typeof statusMap]} by your manager.`,
                type: 'approval_status'
            }
        });

        res.status(200).json(updatedEntry);
    } catch (error) {
        console.error('Failed to review timesheet:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
