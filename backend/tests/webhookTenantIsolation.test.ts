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
import { emitWebhookEvent } from '../src/services/webhookService';

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
});
