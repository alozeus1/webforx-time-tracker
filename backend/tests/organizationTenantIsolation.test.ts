import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import organizationRoutes from '../src/routes/organizationRoutes';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        organization: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        role: {
            createMany: jest.fn(),
        },
    },
}));

import prisma from '../src/config/db';

const JWT_SECRET = 'test-jwt-secret';
const makeToken = (role: string, organizationId = 'org-a') =>
    jwt.sign({ userId: `${role.toLowerCase()}-1`, email: `${role}@test.com`, role, organization_id: organizationId }, JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/api/v1/organizations', organizationRoutes);

describe('organization tenant isolation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (prisma.organization.findMany as jest.Mock).mockResolvedValue([{ id: 'org-a', billing_email: 'billing-a@test.com' }]);
        (prisma.organization.update as jest.Mock).mockResolvedValue({ id: 'org-a', name: 'Org A' });
    });

    it('scopes Manager organization listing to their own organization', async () => {
        const res = await request(app)
            .get('/api/v1/organizations')
            .set('Authorization', `Bearer ${makeToken('Manager', 'org-a')}`);

        expect(res.status).toBe(200);
        expect(prisma.organization.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'org-a' },
        }));
    });

    it('scopes Admin organization listing to their own organization', async () => {
        const res = await request(app)
            .get('/api/v1/organizations')
            .set('Authorization', `Bearer ${makeToken('Admin', 'org-b')}`);

        expect(res.status).toBe(200);
        expect(prisma.organization.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'org-b' },
        }));
    });

    it('rejects unauthenticated organization listing', async () => {
        const res = await request(app).get('/api/v1/organizations');

        expect(res.status).toBe(401);
        expect(prisma.organization.findMany).not.toHaveBeenCalled();
    });

    it('allowlists organization update fields', async () => {
        const res = await request(app)
            .put('/api/v1/organizations/me')
            .set('Authorization', `Bearer ${makeToken('Admin', 'org-a')}`)
            .send({
                name: 'Org A',
                billing_email: 'billing@test.com',
                plan: 'enterprise',
                status: 'suspended',
                organization_id: 'org-b',
            });

        expect(res.status).toBe(200);
        expect(prisma.organization.update).toHaveBeenCalledWith({
            where: { id: 'org-a' },
            data: { name: 'Org A', billing_email: 'billing@test.com' },
        });
    });
});
