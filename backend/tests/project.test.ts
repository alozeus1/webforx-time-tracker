import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import projectRoutes from '../src/routes/projectRoutes';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        project: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        auditLog: {
            create: jest.fn(),
        },
    },
}));

import prisma from '../src/config/db';

const JWT_SECRET = 'test-jwt-secret';
const makeToken = (userId: string, role: string) =>
    jwt.sign({ userId, email: `${userId}@test.com`, role }, JWT_SECRET);

const adminToken = makeToken('user-admin-1', 'Admin');
const employeeToken = makeToken('user-emp-1', 'Employee');

const app = express();
app.use(express.json());
app.use('/api/v1/projects', projectRoutes);

const mockProject = {
    id: 'proj-1',
    name: 'EDUSUC',
    description: 'Education success platform',
    logo_url: null,
    budget_hours: 200,
    budget_amount: 50000,
    is_active: true,
    created_at: new Date(),
    _count: { members: 5 },
    time_entries: [
        { duration: 7200, status: 'approved', user: { hourly_rate: '50.00' } },
    ],
};

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
});

// ─── getAllProjects ──────────────────────────────────────────────────────────

describe('GET /api/v1/projects', () => {
    it('returns 200 with enriched projects array including hours_burned', async () => {
        (prisma.project.findMany as jest.Mock).mockResolvedValue([mockProject]);

        const res = await request(app)
            .get('/api/v1/projects')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].name).toBe('EDUSUC');
        expect(typeof res.body[0].hours_burned).toBe('number');
        expect(res.body[0].hours_burned).toBeCloseTo(2); // 7200s = 2hrs
    });

    it('returns 200 with empty array when no active projects', async () => {
        (prisma.project.findMany as jest.Mock).mockResolvedValue([]);

        const res = await request(app)
            .get('/api/v1/projects')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it('returns 401 when unauthenticated', async () => {
        const res = await request(app).get('/api/v1/projects');
        expect(res.status).toBe(401);
    });
});

// ─── createProject ──────────────────────────────────────────────────────────

describe('POST /api/v1/projects', () => {
    it('admin can create project and returns 201', async () => {
        (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);
        (prisma.project.create as jest.Mock).mockResolvedValue({
            id: 'proj-2',
            name: 'New Project',
            description: 'A fresh project',
            logo_url: null,
            budget_hours: 100,
            budget_amount: null,
            is_active: true,
            created_at: new Date(),
        });

        const res = await request(app)
            .post('/api/v1/projects')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'New Project', description: 'A fresh project', budget_hours: 100 });

        expect(res.status).toBe(201);
        expect(res.body.name).toBe('New Project');
    });

    it('returns 400 when project name already exists', async () => {
        (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject);

        const res = await request(app)
            .post('/api/v1/projects')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'EDUSUC', description: 'Duplicate' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already exists/i);
    });

    it('returns 403 when Employee tries to create a project', async () => {
        const res = await request(app)
            .post('/api/v1/projects')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ name: 'Employee Project', description: 'Not allowed' });

        expect(res.status).toBe(403);
    });
});

// ─── updateProject ──────────────────────────────────────────────────────────

describe('PUT /api/v1/projects/:id', () => {
    it('returns 200 with updated project on success', async () => {
        const updatedProject = { ...mockProject, description: 'Updated description' };
        (prisma.project.update as jest.Mock).mockResolvedValue(updatedProject);

        const res = await request(app)
            .put('/api/v1/projects/proj-1')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ description: 'Updated description' });

        expect(res.status).toBe(200);
        expect(res.body.description).toBe('Updated description');
    });

    it('returns 400 when no valid fields provided', async () => {
        const res = await request(app)
            .put('/api/v1/projects/proj-1')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/no valid fields/i);
    });
});

// ─── deleteProject ──────────────────────────────────────────────────────────

describe('DELETE /api/v1/projects/:id', () => {
    it('returns 200 and soft-deletes the project', async () => {
        (prisma.project.update as jest.Mock).mockResolvedValue({
            ...mockProject,
            is_active: false,
        });

        const res = await request(app)
            .delete('/api/v1/projects/proj-1')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/deactivated/i);

        expect(prisma.project.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'proj-1' },
                data: { is_active: false },
            })
        );
    });

    it('returns 403 when Employee tries to delete a project', async () => {
        const res = await request(app)
            .delete('/api/v1/projects/proj-1')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
    });
});
