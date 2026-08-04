import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import scheduleRoutes from '../src/routes/scheduleRoutes';
import expenseRoutes from '../src/routes/expenseRoutes';
import geofenceRoutes from '../src/routes/geofenceRoutes';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        scheduleEntry: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
        expense: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
        expenseAttachment: { findFirst: jest.fn() },
        geofenceZone: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
        organization: { findUnique: jest.fn(), update: jest.fn() },
        user: { findFirst: jest.fn() },
        project: { findFirst: jest.fn() },
    },
}));

import prisma from '../src/config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
const token = (userId: string, role: string) => jwt.sign({ userId, email: `${userId}@test.com`, role, organization_id: 'org-1' }, JWT_SECRET);
const employeeToken = token('employee-1', 'Employee');
const managerToken = token('manager-1', 'Manager');
const adminToken = token('admin-1', 'Admin');

const app = express();
app.use(express.json());
app.use('/api/v1/schedules', scheduleRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/geofences', geofenceRoutes);

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.scheduleEntry.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'employee-1' });
    (prisma.project.findFirst as jest.Mock).mockResolvedValue({ id: 'project-1' });
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ settings: {} });
});

describe('schedule routes', () => {
    it('scopes employee calendar reads to the authenticated user', async () => {
        const response = await request(app)
            .get('/api/v1/schedules?start=2026-08-01T00:00:00.000Z&end=2026-08-08T00:00:00.000Z')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(response.status).toBe(200);
        expect(prisma.scheduleEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ organization_id: 'org-1', user_id: 'employee-1' }),
        }));
    });

    it('allows a manager to create a tenant-owned shift', async () => {
        (prisma.scheduleEntry.create as jest.Mock).mockResolvedValue({ id: 'shift-1', title: 'Support shift' });
        const response = await request(app)
            .post('/api/v1/schedules')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ user_id: 'employee-1', project_id: 'project-1', title: 'Support shift', entry_type: 'shift', start_time: '2026-08-03T14:00:00.000Z', end_time: '2026-08-03T22:00:00.000Z' });

        expect(response.status).toBe(201);
        expect(prisma.scheduleEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organization_id: 'org-1', created_by: 'manager-1' }) }));
    });
});

describe('expense routes', () => {
    it('creates a tenant-scoped expense without requiring a receipt', async () => {
        (prisma.expense.create as jest.Mock).mockResolvedValue({ id: 'expense-1', description: 'Airport taxi', status: 'pending', attachments: [] });
        const response = await request(app)
            .post('/api/v1/expenses')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ description: 'Airport taxi', category: 'travel', amount: 42.50, currency: 'USD', incurred_on: '2026-08-03T12:00:00.000Z', is_billable: true });

        expect(response.status).toBe(201);
        expect(prisma.expense.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organization_id: 'org-1', user_id: 'employee-1', is_billable: true }) }));
    });

    it('allows a manager to approve a pending expense', async () => {
        (prisma.expense.findFirst as jest.Mock).mockResolvedValue({ id: 'expense-1', status: 'pending' });
        (prisma.expense.update as jest.Mock).mockResolvedValue({ id: 'expense-1', status: 'approved' });
        const response = await request(app)
            .post('/api/v1/expenses/expense-1/review')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ status: 'approved' });

        expect(response.status).toBe(200);
        expect(prisma.expense.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'approved', reviewed_by: 'manager-1' }) }));
    });
});

describe('geofence administration', () => {
    it('keeps geofencing disabled by default', async () => {
        const response = await request(app).get('/api/v1/geofences/policy').set('Authorization', `Bearer ${employeeToken}`);
        expect(response.status).toBe(200);
        expect(response.body.policy.enabled).toBe(false);
    });

    it('requires at least one active zone before enabling enforcement', async () => {
        (prisma.geofenceZone.count as jest.Mock).mockResolvedValue(0);
        const response = await request(app)
            .put('/api/v1/geofences/policy')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ enabled: true, enforce_on_clock_in: true, max_accuracy_meters: 500 });
        expect(response.status).toBe(409);
        expect(prisma.organization.update).not.toHaveBeenCalled();
    });
});
