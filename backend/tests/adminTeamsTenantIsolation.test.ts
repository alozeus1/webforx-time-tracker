import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import adminRoutes from '../src/routes/adminRoutes';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        auditLog: {
            findMany: jest.fn(),
            create: jest.fn(),
        },
        authEvent: {
            findMany: jest.fn(),
        },
        notification: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        team: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        timerPolicyConfig: {
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
    },
}));

import prisma from '../src/config/db';

const JWT_SECRET = 'test-jwt-secret';
const makeToken = (role: string, organizationId = 'org-a') =>
    jwt.sign({ userId: `${role.toLowerCase()}-1`, email: `${role}@test.com`, role, organization_id: organizationId }, JWT_SECRET);

const app = express();
app.use(express.json());
app.use('/api/v1/admin', adminRoutes);

describe('admin teams tenant isolation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (prisma.team.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.team.findFirst as jest.Mock).mockResolvedValue({ id: 'team-a' });
        (prisma.team.create as jest.Mock).mockResolvedValue({ id: 'team-a', name: 'Engineering', organization_id: 'org-a' });
        (prisma.team.update as jest.Mock).mockResolvedValue({ id: 'team-a', name: 'Platform', organization_id: 'org-a' });
        (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
        (prisma.timerPolicyConfig.findFirst as jest.Mock).mockResolvedValue(null);
    });

    it('lists only teams in the caller organization', async () => {
        const res = await request(app)
            .get('/api/v1/admin/teams')
            .set('Authorization', `Bearer ${makeToken('Manager', 'org-a')}`);

        expect(res.status).toBe(200);
        expect(prisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { organization_id: 'org-a' },
        }));
    });

    it('creates teams under the caller organization', async () => {
        const res = await request(app)
            .post('/api/v1/admin/teams')
            .set('Authorization', `Bearer ${makeToken('Admin', 'org-a')}`)
            .send({ name: 'Engineering' });

        expect(res.status).toBe(201);
        expect(prisma.team.create).toHaveBeenCalledWith({
            data: { name: 'Engineering', description: null, organization_id: 'org-a' },
        });
    });

    it('pre-checks ownership before updating a team', async () => {
        const res = await request(app)
            .put('/api/v1/admin/teams/team-a')
            .set('Authorization', `Bearer ${makeToken('Admin', 'org-a')}`)
            .send({ name: 'Platform', is_active: false });

        expect(res.status).toBe(200);
        expect(prisma.team.findFirst).toHaveBeenCalledWith({
            where: { id: 'team-a', organization_id: 'org-a' },
            select: { id: true },
        });
        expect(prisma.team.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'team-a' },
            data: { name: 'Platform', is_active: false },
        }));
    });

    it('returns 404 instead of updating a cross-tenant team', async () => {
        (prisma.team.findFirst as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .put('/api/v1/admin/teams/team-b')
            .set('Authorization', `Bearer ${makeToken('Admin', 'org-a')}`)
            .send({ name: 'Platform' });

        expect(res.status).toBe(404);
        expect(prisma.team.update).not.toHaveBeenCalled();
    });
});
