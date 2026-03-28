import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import invoiceRoutes from '../src/routes/invoiceRoutes';
import templateRoutes from '../src/routes/templateRoutes';
import scheduledReportRoutes from '../src/routes/scheduledReportRoutes';
import webhookRoutes from '../src/routes/webhookRoutes';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        invoice: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        timeEntry: {
            findMany: jest.fn(),
        },
        invoiceLineItem: {
            createMany: jest.fn(),
        },
        projectTemplate: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
        },
        project: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        scheduledReport: {
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        webhookSubscription: {
            findMany: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

import prisma from '../src/config/db';

const JWT_SECRET = 'test-jwt-secret';
const managerToken = jwt.sign({ userId: 'user-mgr', email: 'mgr@test.com', role: 'Manager' }, JWT_SECRET);
const adminToken = jwt.sign({ userId: 'user-admin', email: 'admin@test.com', role: 'Admin' }, JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/templates', templateRoutes);
app.use('/api/v1/scheduled-reports', scheduledReportRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

beforeEach(() => {
    jest.clearAllMocks();

    (prisma.invoice.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.projectTemplate.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.webhookSubscription.findMany as jest.Mock).mockResolvedValue([]);

    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
            invoice: { create: jest.fn().mockResolvedValue({ id: 'inv-1' }) },
            invoiceLineItem: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
        };
        return fn(tx);
    });

    (prisma.invoice.findUnique as jest.Mock).mockResolvedValue({
        id: 'inv-1',
        invoice_number: 'INV-20260101-1001',
        client_name: 'Acme Corp',
        status: 'draft',
        subtotal: 120,
        tax_rate: 10,
        total: 132,
        line_items: [],
        project: null,
    });

    (prisma.projectTemplate.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.projectTemplate.create as jest.Mock).mockResolvedValue({ id: 'tpl-1', name: 'Template A' });
    (prisma.scheduledReport.create as jest.Mock).mockResolvedValue({ id: 'sch-1', frequency: 'weekly' });
    (prisma.webhookSubscription.create as jest.Mock).mockResolvedValue({ id: 'wh-1', url: 'https://example.com/hook' });
});

describe('Route registration and availability', () => {
    it('GET /api/v1/invoices is mounted', async () => {
        const res = await request(app)
            .get('/api/v1/invoices')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('invoices');
    });

    it('POST /api/v1/invoices accepts manual line_items payload', async () => {
        const res = await request(app)
            .post('/api/v1/invoices')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({
                client_name: 'Acme Corp',
                tax_rate: 10,
                line_items: [{ description: 'Design work', hours: 2, rate: 60 }],
            });

        expect(res.status).toBe(201);
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('GET /api/v1/templates is mounted', async () => {
        const res = await request(app)
            .get('/api/v1/templates')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('templates');
    });

    it('POST /api/v1/templates is mounted for manager/admin', async () => {
        const res = await request(app)
            .post('/api/v1/templates')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ name: 'Default Client Template' });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
    });

    it('GET /api/v1/scheduled-reports is mounted', async () => {
        const res = await request(app)
            .get('/api/v1/scheduled-reports')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('reports');
    });

    it('POST /api/v1/scheduled-reports is mounted and validates payload', async () => {
        const bad = await request(app)
            .post('/api/v1/scheduled-reports')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ frequency: 'weekly', recipients: [] });

        expect(bad.status).toBe(400);

        const good = await request(app)
            .post('/api/v1/scheduled-reports')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({
                frequency: 'weekly',
                day_of_week: 1,
                recipients: ['ops@webforx.com'],
                report_type: 'summary',
            });

        expect(good.status).toBe(201);
    });

    it('GET /api/v1/webhooks is mounted for admin', async () => {
        const res = await request(app)
            .get('/api/v1/webhooks')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('webhooks');
    });

    it('POST /api/v1/webhooks is mounted and validates payload', async () => {
        const bad = await request(app)
            .post('/api/v1/webhooks')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ url: 'not-a-url', events: [] });

        expect(bad.status).toBe(400);

        const good = await request(app)
            .post('/api/v1/webhooks')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ url: 'https://example.com/hook', events: ['timer.stopped'] });

        expect(good.status).toBe(201);
    });
});
