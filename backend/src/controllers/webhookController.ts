import crypto from 'crypto';
import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

export const listWebhooks = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const subs = await prisma.webhookSubscription.findMany({ orderBy: { created_at: 'desc' } });
        res.status(200).json({ webhooks: subs });
    } catch (error) {
        console.error('Failed to list webhooks:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createWebhook = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
        const events = Array.isArray(req.body?.events) ? req.body.events : [];

        if (!url) {
            res.status(400).json({ message: 'Webhook URL is required' });
            return;
        }

        const secret = crypto.randomBytes(32).toString('hex');
        const sub = await prisma.webhookSubscription.create({
            data: { url, events, secret },
        });

        res.status(201).json(sub);
    } catch (error) {
        console.error('Failed to create webhook:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteWebhook = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        await prisma.webhookSubscription.delete({ where: { id } });
        res.status(200).json({ message: 'Webhook deleted' });
    } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
            res.status(404).json({ message: 'Webhook not found' });
            return;
        }
        console.error('Failed to delete webhook:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
