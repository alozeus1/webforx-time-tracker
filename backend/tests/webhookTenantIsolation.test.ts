jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        webhookSubscription: {
            findMany: jest.fn(),
        },
    },
}));

jest.mock('../src/utils/outboundHttp', () => ({
    publicHttpsFetch: jest.fn().mockResolvedValue({ ok: true }),
}));

import prisma from '../src/config/db';
import { publicHttpsFetch } from '../src/utils/outboundHttp';
import { deliverWebhookWithRetry, emitWebhookEvent } from '../src/services/webhookService';

const fetchMock = publicHttpsFetch as jest.Mock;

describe('webhook tenant isolation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('queries only active subscriptions for the event organization', async () => {
        (prisma.webhookSubscription.findMany as jest.Mock).mockResolvedValue([
            { id: 'org-a-sub', url: 'https://hooks.example.com/a', secret: 'secret-a', events: ['timer.stopped'] },
            { id: 'org-a-wildcard', url: 'https://hooks.example.com/a-all', secret: 'secret-all', events: ['*'] },
        ]);

        await emitWebhookEvent('timer.stopped', { time_entry_id: 'entry-a' }, { organizationId: 'org-a' });

        expect(prisma.webhookSubscription.findMany).toHaveBeenCalledWith({
            where: { organization_id: 'org-a', is_active: true },
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            'https://hooks.example.com/a',
            'https://hooks.example.com/a-all',
        ]);
    });

    it('fails closed when organization context is missing', async () => {
        await expect(emitWebhookEvent('timer.stopped', { time_entry_id: 'entry-a' })).rejects.toThrow(
            'Webhook event organization context is required',
        );
        expect(prisma.webhookSubscription.findMany).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('retries transient failures within a bounded attempt count', async () => {
        fetchMock
            .mockRejectedValueOnce(new Error('request timed out'))
            .mockResolvedValueOnce({ ok: false, status: 503 })
            .mockResolvedValueOnce({ ok: true, status: 204 });
        const sleep = jest.fn().mockResolvedValue(undefined);

        await expect(deliverWebhookWithRetry({
            subscriptionId: 'sub-1',
            url: 'https://hooks.example.com/a',
            body: '{}',
            signature: 'signature',
            deliveryId: 'delivery-1',
        }, { sleep })).resolves.toEqual({ attempts: 3, status: 204 });

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(sleep).toHaveBeenCalledTimes(2);
    });

    it('does not retry a permanent client failure', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 400 });

        await expect(deliverWebhookWithRetry({
            subscriptionId: 'sub-1',
            url: 'https://hooks.example.com/a',
            body: '{}',
            signature: 'signature',
            deliveryId: 'delivery-1',
        }, { sleep: jest.fn() })).rejects.toMatchObject({
            attempts: 1,
            status: 400,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('logs exhausted failures by subscription ID without exposing the endpoint URL', async () => {
        (prisma.webhookSubscription.findMany as jest.Mock).mockResolvedValue([
            { id: 'sub-secret-path', url: 'https://hooks.example.com/private-token-path', secret: 'secret', events: ['timer.stopped'] },
        ]);
        fetchMock.mockResolvedValue({ ok: false, status: 400 });
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await emitWebhookEvent('timer.stopped', { id: 'entry-a' }, { organizationId: 'org-a' });

        expect(consoleError).toHaveBeenCalledWith('Webhook delivery exhausted', expect.objectContaining({
            subscriptionId: 'sub-secret-path',
            attempts: 1,
            status: 400,
        }));
        expect(JSON.stringify(consoleError.mock.calls)).not.toContain('private-token-path');
        consoleError.mockRestore();
    });
});
