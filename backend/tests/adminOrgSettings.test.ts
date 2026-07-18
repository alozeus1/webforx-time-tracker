import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import adminRoutes from '../src/routes/adminRoutes';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        organization: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        auditLog: {
            create: jest.fn(),
        },
    },
}));

import prisma from '../src/config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
const makeToken = (userId: string, role: string, organizationId = 'org-1') =>
    jwt.sign({ userId, email: `${userId}@test.com`, role, organization_id: organizationId }, JWT_SECRET);

const adminToken = makeToken('user-admin-1', 'Admin');
const managerToken = makeToken('user-mgr-1', 'Manager');

const app = express();
app.use(express.json());
app.use('/api/v1/admin', adminRoutes);

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ settings: {} });
    (prisma.organization.update as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
});

describe('PUT /api/v1/admin/org-settings — daily_report_recipient', () => {
    it('rejects a non-Manager/Admin caller', async () => {
        const employeeToken = makeToken('user-1', 'Employee');
        const res = await request(app)
            .put('/api/v1/admin/org-settings')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ daily_report_recipient: 'ops@acme.com' });

        expect(res.status).toBe(403);
    });

    it('rejects a Manager (Admin-only endpoint)', async () => {
        const res = await request(app)
            .put('/api/v1/admin/org-settings')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ daily_report_recipient: 'ops@acme.com' });

        expect(res.status).toBe(403);
    });

    it('saves a valid email and persists it under Organization.settings', async () => {
        const res = await request(app)
            .put('/api/v1/admin/org-settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ daily_report_recipient: 'ops@acme.com' });

        expect(res.status).toBe(200);
        expect(res.body.daily_report_recipient).toBe('ops@acme.com');
        expect(prisma.organization.update).toHaveBeenCalledWith({
            where: { id: 'org-1' },
            data: { settings: expect.objectContaining({ daily_report_recipient: 'ops@acme.com' }) },
        });
    });

    it('rejects a malformed email', async () => {
        const res = await request(app)
            .put('/api/v1/admin/org-settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ daily_report_recipient: 'not-an-email' });

        expect(res.status).toBe(400);
        expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('clears the recipient when sent null, falling back to the platform default', async () => {
        (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
            settings: { daily_report_recipient: 'ops@acme.com' },
        });

        const res = await request(app)
            .put('/api/v1/admin/org-settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ daily_report_recipient: null });

        expect(res.status).toBe(200);
        expect(res.body.daily_report_recipient).toBeNull();
        expect(prisma.organization.update).toHaveBeenCalledWith({
            where: { id: 'org-1' },
            data: { settings: expect.not.objectContaining({ daily_report_recipient: expect.anything() }) },
        });
    });

    it('leaves other settings keys untouched when only daily_report_recipient is sent', async () => {
        (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
            settings: { compliance_mode: 'dcaa' },
        });

        const res = await request(app)
            .put('/api/v1/admin/org-settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ daily_report_recipient: 'ops@acme.com' });

        expect(res.status).toBe(200);
        expect(res.body.compliance_mode).toBe('dcaa');
        expect(prisma.organization.update).toHaveBeenCalledWith({
            where: { id: 'org-1' },
            data: { settings: expect.objectContaining({ compliance_mode: 'dcaa', daily_report_recipient: 'ops@acme.com' }) },
        });
    });
});

describe('GET /api/v1/admin/org-settings — daily_report_recipient', () => {
    it('returns null when unconfigured', async () => {
        (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ settings: {} });

        const res = await request(app)
            .get('/api/v1/admin/org-settings')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.daily_report_recipient).toBeNull();
    });

    it('returns the configured recipient', async () => {
        (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
            settings: { daily_report_recipient: 'ops@acme.com' },
        });

        const res = await request(app)
            .get('/api/v1/admin/org-settings')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.daily_report_recipient).toBe('ops@acme.com');
    });
});
