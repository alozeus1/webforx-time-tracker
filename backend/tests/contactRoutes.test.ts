import request from 'supertest';
import express from 'express';

const mockEnv = {
    nodeEnv: 'test',
    jwtSecret: 'test-secret',
    resendApiKey: '',
    emailFrom: 'test@webforxtech.com',
};

jest.mock('../src/config/env', () => ({ __esModule: true, env: mockEnv }));
jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        accessRequest: { create: jest.fn() },
    },
}));
jest.mock('../src/services/emailService', () => ({
    sendAccessRequestNotification: jest.fn().mockResolvedValue(undefined),
    sendAccessRequestReceipt: jest.fn().mockResolvedValue(undefined),
}));

import prisma from '../src/config/db';
import contactRoutes from '../src/routes/contactRoutes';

const app = express();
app.use(express.json());
app.use('/api/v1/contact', contactRoutes);

describe('POST /api/v1/contact/request-access', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 200 and persists the request when input is valid', async () => {
        (prisma.accessRequest.create as jest.Mock).mockResolvedValue({ id: 'req-1' });

        const res = await request(app)
            .post('/api/v1/contact/request-access')
            .send({
                fullName: 'Test User',
                workEmail: 'test@company.com',
                company: 'Acme Corp',
                teamSize: '1-10',
                details: 'Looking forward to using this.',
            });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(prisma.accessRequest.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    fullName: 'Test User',
                    workEmail: 'test@company.com',
                    company: 'Acme Corp',
                }),
            }),
        );
    });

    it('returns 400 when required fields are missing', async () => {
        const res = await request(app)
            .post('/api/v1/contact/request-access')
            .send({ fullName: 'Test' });

        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
    });

    it('returns 400 for invalid email format', async () => {
        const res = await request(app)
            .post('/api/v1/contact/request-access')
            .send({
                fullName: 'Test User',
                workEmail: 'not-an-email',
                company: 'Acme',
                teamSize: '1-10',
            });

        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
    });
});
