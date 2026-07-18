import crypto from 'crypto';
import { Response } from 'express';
import type { Prisma } from '@prisma/client/index';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { sendApiError } from '../utils/http';
import { validatePublicHttpsUrl } from '../utils/outboundHttp';

export const listWebhooks = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const subs = await prisma.webhookSubscription.findMany({ where: { organization_id: req.user!.organization_id }, orderBy: { created_at: 'desc' } });
        res.status(200).json({ webhooks: subs });
    } catch (error) {
        console.error('Failed to list webhooks:', error);
        sendApiError(res, 500, 'WEBHOOK_LIST_FAILED', 'Internal server error');
    }
};

export const createWebhook = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
        const rawEvents: unknown[] = Array.isArray(req.body?.events) ? req.body.events : [];
        const events = rawEvents
            .filter((event: unknown): event is string => typeof event === 'string')
            .map((event: string) => event.trim())
            .filter((event: string) => event.length > 0);

        if (!url) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'Webhook URL is required');
            return;
        }

        try {
            await validatePublicHttpsUrl(url);
        } catch {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'Webhook URL must be a public HTTPS URL');
            return;
        }

        if (events.length === 0) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'At least one webhook event is required');
            return;
        }

        const secret = crypto.randomBytes(32).toString('hex');
        const uniqueEvents = Array.from(new Set(events));
        const sub = await prisma.webhookSubscription.create({
            data: {
                url,
                events: uniqueEvents as Prisma.InputJsonValue,
                secret,
                organization_id: req.user!.organization_id,
            },
        });

        res.status(201).json(sub);
    } catch (error) {
        console.error('Failed to create webhook:', error);
        sendApiError(res, 500, 'WEBHOOK_CREATE_FAILED', 'Internal server error');
    }
};

export const deleteWebhook = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        await prisma.webhookSubscription.delete({ where: { id, organization_id: req.user!.organization_id } });
        res.status(200).json({ message: 'Webhook deleted' });
    } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
            sendApiError(res, 404, 'WEBHOOK_NOT_FOUND', 'Webhook not found');
            return;
        }
        console.error('Failed to delete webhook:', error);
        sendApiError(res, 500, 'WEBHOOK_DELETE_FAILED', 'Internal server error');
    }
};
