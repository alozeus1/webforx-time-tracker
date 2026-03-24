import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

export const getAuditLogs = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const logs = await prisma.auditLog.findMany({
            orderBy: { created_at: 'desc' },
            take: 100,
            include: {
                user: { select: { email: true, first_name: true, last_name: true } }
            }
        });

        res.status(200).json({ logs });
    } catch (error) {
        console.error('Failed to get audit logs:', error);
        res.status(500).json({ message: 'Internal server error while loading audit logs' });
    }
};

export const getSystemNotifications = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const notifications = await prisma.notification.findMany({
            orderBy: { created_at: 'desc' },
            take: 100,
            include: {
                user: { select: { email: true, first_name: true, last_name: true } }
            }
        });

        res.status(200).json({ notifications });
    } catch (error) {
        console.error('Failed to get system notifications:', error);
        res.status(500).json({ message: 'Internal server error while loading system notifications' });
    }
};
