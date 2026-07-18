import crypto from 'crypto';
import prisma from '../config/db';
import { publicHttpsFetch } from '../utils/outboundHttp';

export const emitWebhookEvent = async (
    eventName: string,
    payload: Record<string, unknown>,
    context?: { organizationId?: string | null },
) => {
    const organizationId = context?.organizationId;
    if (!organizationId) {
        throw new Error('Webhook event organization context is required');
    }

    try {
        const subscriptions = await prisma.webhookSubscription.findMany({
            where: { organization_id: organizationId, is_active: true },
        });

        const matching = subscriptions.filter(sub => {
            const events = sub.events as string[];
            return events.includes(eventName) || events.includes('*');
        });

        for (const sub of matching) {
            const body = JSON.stringify({ event: eventName, data: payload, timestamp: new Date().toISOString() });
            const signature = crypto.createHmac('sha256', sub.secret).update(body).digest('hex');

            publicHttpsFetch(sub.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signature },
                body,
            }).catch(err => console.error(`Webhook delivery failed for ${sub.url}:`, err));
        }
    } catch (error) {
        console.error('Failed to emit webhook event:', error);
    }
};
