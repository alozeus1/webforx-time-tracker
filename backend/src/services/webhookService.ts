import crypto from 'crypto';
import prisma from '../config/db';

export const emitWebhookEvent = async (eventName: string, payload: Record<string, unknown>) => {
    try {
        const subscriptions = await prisma.webhookSubscription.findMany({
            where: { is_active: true },
        });

        const matching = subscriptions.filter(sub => {
            const events = sub.events as string[];
            return events.includes(eventName) || events.includes('*');
        });

        for (const sub of matching) {
            const body = JSON.stringify({ event: eventName, data: payload, timestamp: new Date().toISOString() });
            const signature = crypto.createHmac('sha256', sub.secret).update(body).digest('hex');

            fetch(sub.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signature },
                body,
            }).catch(err => console.error(`Webhook delivery failed for ${sub.url}:`, err));
        }
    } catch (error) {
        console.error('Failed to emit webhook event:', error);
    }
};
