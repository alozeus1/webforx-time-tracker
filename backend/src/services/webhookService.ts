import crypto from 'crypto';
import prisma from '../config/db';
import { publicHttpsFetch } from '../utils/outboundHttp';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAYS_MS = [250, 1000];

interface WebhookDelivery {
    subscriptionId: string;
    url: string;
    body: string;
    signature: string;
    deliveryId: string;
}

interface DeliveryOptions {
    maxAttempts?: number;
    retryDelaysMs?: number[];
    sleep?: (milliseconds: number) => Promise<void>;
}

export class WebhookDeliveryError extends Error {
    constructor(
        message: string,
        public readonly attempts: number,
        public readonly status?: number,
    ) {
        super(message);
        this.name = 'WebhookDeliveryError';
    }
}

const isRetryableStatus = (status: number): boolean => (
    status === 408 || status === 425 || status === 429 || status >= 500
);

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
});

export const deliverWebhookWithRetry = async (
    delivery: WebhookDelivery,
    options: DeliveryOptions = {},
): Promise<{ attempts: number; status: number }> => {
    const maxAttempts = Math.min(Math.max(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, 1), 5);
    const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    const sleep = options.sleep ?? defaultSleep;
    let lastStatus: number | undefined;
    let lastMessage = 'Webhook request failed';

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const response = await publicHttpsFetch(delivery.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': delivery.signature,
                    'X-Webhook-Delivery': delivery.deliveryId,
                },
                body: delivery.body,
            });
            lastStatus = response.status;

            if (response.ok) return { attempts: attempt, status: response.status };

            lastMessage = `Webhook endpoint returned status ${response.status}`;
            if (!isRetryableStatus(response.status)) {
                throw new WebhookDeliveryError(lastMessage, attempt, response.status);
            }
        } catch (error) {
            if (error instanceof WebhookDeliveryError) throw error;
            lastMessage = error instanceof Error ? error.message : 'Webhook request failed';
        }

        if (attempt < maxAttempts) {
            await sleep(retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? 0);
        }
    }

    throw new WebhookDeliveryError(lastMessage, maxAttempts, lastStatus);
};

export const emitWebhookEvent = async (
    eventName: string,
    payload: Record<string, unknown>,
    context?: { organizationId?: string | null },
) => {
    const organizationId = context?.organizationId;
    if (!organizationId) throw new Error('Webhook event organization context is required');

    try {
        const subscriptions = await prisma.webhookSubscription.findMany({
            where: { organization_id: organizationId, is_active: true },
        });

        const matching = subscriptions.filter((subscription) => {
            const events = subscription.events as string[];
            return events.includes(eventName) || events.includes('*');
        });

        await Promise.all(matching.map(async (subscription) => {
            const body = JSON.stringify({ event: eventName, data: payload, timestamp: new Date().toISOString() });
            const signature = crypto.createHmac('sha256', subscription.secret).update(body).digest('hex');

            try {
                await deliverWebhookWithRetry({
                    subscriptionId: subscription.id,
                    url: subscription.url,
                    body,
                    signature,
                    deliveryId: crypto.randomUUID(),
                });
            } catch (error) {
                const deliveryError = error instanceof WebhookDeliveryError ? error : null;
                console.error('Webhook delivery exhausted', {
                    subscriptionId: subscription.id,
                    event: eventName,
                    attempts: deliveryError?.attempts ?? 1,
                    status: deliveryError?.status ?? null,
                    error: error instanceof Error ? error.message : 'Unknown delivery error',
                });
            }
        }));
    } catch (error) {
        console.error('Failed to emit webhook event:', error);
    }
};
