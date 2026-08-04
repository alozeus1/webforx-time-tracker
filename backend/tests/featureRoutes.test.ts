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
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        timeEntry: {
            findMany: jest.fn(),
        },
        expense: {
            findMany: jest.fn(),
        },
        invoiceLineItem: {
            createMany: jest.fn(),
        },
        projectTemplate: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
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

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
const TEST_ORG_ID = 'org-1';
const managerToken = jwt.sign({ userId: 'user-mgr', email: 'mgr@test.com', role: 'Manager', organization_id: TEST_ORG_ID }, JWT_SECRET);
const adminToken = jwt.sign({ userId: 'user-admin', email: 'admin@test.com', role: 'Admin', organization_id: TEST_ORG_ID }, JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/templates', templateRoutes);
app.use('/api/v1/scheduled-reports', scheduledReportRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

beforeEach(() => {
    jest.clearAllMocks();

    (prisma.invoice.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.expense.findMany as jest.Mock).mockResolvedValue([]);
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
    (prisma.invoice.findFirst as jest.Mock).mockResolvedValue({
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

    (prisma.projectTemplate.findFirst as jest.Mock).mockResolvedValue(null);
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

    it('POST /api/v1/invoices accepts approved billable expense IDs', async () => {
        (prisma.expense.findMany as jest.Mock).mockResolvedValue([{ id: 'expense-1', description: 'Client travel', amount: 75 }]);
        const res = await request(app)
            .post('/api/v1/invoices')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ client_name: 'Acme Corp', expense_ids: ['expense-1'] });

        expect(res.status).toBe(201);
        expect(prisma.expense.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ organization_id: TEST_ORG_ID, status: 'approved', is_billable: true }),
        }));
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

    // Regression (Codex review): a non-Monday day_of_week used to be silently
    // rewritten to Monday and returned 201, so the response described a schedule the
    // caller never asked for. The export window is a fixed Monday-to-Sunday week, so
    // the only honest options are to reject or to expose Monday alone; it now rejects.
    it('POST /api/v1/scheduled-reports rejects a non-Monday generation day instead of silently rewriting it', async () => {
        for (const day of [2, 3, 4, 5, 6]) {
            const res = await request(app)
                .post('/api/v1/scheduled-reports')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ frequency: 'weekly', day_of_week: day, recipients: ['ops@webforx.com'] });

            expect(res.status).toBe(400);
            expect(res.body.message || res.body.error).toMatch(/Monday/i);
        }
    });

    it('POST /api/v1/scheduled-reports rejects Sunday with the window-close explanation', async () => {
        const res = await request(app)
            .post('/api/v1/scheduled-reports')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ frequency: 'weekly', day_of_week: 0, recipients: ['ops@webforx.com'] });

        expect(res.status).toBe(400);
        expect(res.body.message || res.body.error).toMatch(/closing day of the export window/i);
    });

    it('POST /api/v1/scheduled-reports accepts an omitted day_of_week and defaults to Monday', async () => {
        const res = await request(app)
            .post('/api/v1/scheduled-reports')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ frequency: 'weekly', recipients: ['ops@webforx.com'] });

        expect(res.status).toBe(201);
    });

    it('POST /api/v1/scheduled-reports rejects an invalid IANA timezone', async () => {
        const res = await request(app)
            .post('/api/v1/scheduled-reports')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ frequency: 'weekly', recipients: ['ops@webforx.com'], reporting_timezone: 'Mars/Olympus_Mons' });

        expect(res.status).toBe(400);
        expect(res.body.message || res.body.error).toMatch(/IANA/i);
    });

    // ICU resolves "CST"/"EST" to real zones, so a naive validity check lets them
    // through. EST in particular resolves to America/Panama, which has no DST.
    it('POST /api/v1/scheduled-reports rejects legacy timezone abbreviations', async () => {
        for (const abbreviation of ['CST', 'EST', 'MST']) {
            const res = await request(app)
                .post('/api/v1/scheduled-reports')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ frequency: 'weekly', recipients: ['ops@webforx.com'], reporting_timezone: abbreviation });

            expect(res.status).toBe(400);
            expect(res.body.message || res.body.error).toMatch(/Area\/Location/i);
        }
    });

    it('POST /api/v1/scheduled-reports accepts a canonical zone and UTC', async () => {
        for (const zone of ['America/Chicago', 'Africa/Lagos', 'UTC']) {
            const res = await request(app)
                .post('/api/v1/scheduled-reports')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ frequency: 'weekly', recipients: ['ops@webforx.com'], reporting_timezone: zone });

            expect(res.status).toBe(201);
        }
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
