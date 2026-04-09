import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import userRoutes from '../src/routes/userRoutes';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        user: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        timeEntry: {
            findMany: jest.fn(),
        },
        notification: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        role: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
        },
        auditLog: {
            create: jest.fn(),
        },
        authEvent: {
            findMany: jest.fn(),
            create: jest.fn(),
        },
    },
}));

import prisma from '../src/config/db';

const JWT_SECRET = 'test-jwt-secret';
const makeToken = (userId: string, role: string) =>
    jwt.sign({ userId, email: `${userId}@test.com`, role }, JWT_SECRET);

const adminToken = makeToken('user-admin-1', 'Admin');
const managerToken = makeToken('user-mgr-1', 'Manager');
const employeeToken = makeToken('user-emp-1', 'Employee');

const app = express();
app.use(express.json());
app.use('/api/v1/users', userRoutes);

const mockUser = {
    id: 'user-emp-1',
    email: 'alice@test.com',
    first_name: 'Alice',
    last_name: 'Smith',
    is_active: true,
    role: { name: 'Employee' },
    password_hash: 'hashed',
};

const mockRole = { id: 'role-emp-1', name: 'Employee' };

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.authEvent.create as jest.Mock).mockResolvedValue({});
    (prisma.authEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.notification.update as jest.Mock).mockResolvedValue({});
});

// ─── getMe ───────────────────────────────────────────────────────────────────

describe('GET /api/v1/users/me', () => {
    it('returns 200 with user profile for authenticated user', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

        const res = await request(app)
            .get('/api/v1/users/me')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(200);
        expect(res.body.email).toBe('alice@test.com');
        expect(res.body.role).toBe('Employee');
        expect(res.body.password_hash).toBeUndefined(); // sensitive field stripped
    });

    it('returns 404 when user not found in DB', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .get('/api/v1/users/me')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(404);
        expect(res.body.message).toMatch(/user not found/i);
    });

    it('returns 401 when not authenticated', async () => {
        const res = await request(app).get('/api/v1/users/me');
        expect(res.status).toBe(401);
    });
});

describe('GET /api/v1/users/me/wellbeing', () => {
    it('returns a structured wellbeing summary for the authenticated user', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({
            ...mockUser,
            weekly_hour_limit: 40,
        });
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([
            { duration: 18_000 },
            { duration: 14_400 },
        ]);
        (prisma.notification.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'alert-1',
                type: 'burnout_alert',
                message: 'Burnout Alert: You have logged 9.0 hours in the last 7 days.',
                is_read: false,
                created_at: new Date('2026-03-28T10:00:00.000Z'),
            },
        ]);

        const res = await request(app)
            .get('/api/v1/users/me/wellbeing')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(200);
        expect(res.body.sevenDayHours).toBe(9);
        expect(res.body.weeklyHourLimit).toBe(40);
        expect(res.body.status).toBe('balanced');
        expect(res.body.workloadAlerts).toHaveLength(1);
    });
});

describe('Notification lifecycle routes', () => {
    it('lists only active notifications for the authenticated user', async () => {
        (prisma.notification.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'notif-1',
                message: 'Unread notification',
                type: 'idle_warning',
                is_read: false,
                read_at: null,
                deleted_at: null,
                created_at: new Date('2026-04-09T10:00:00.000Z'),
                user: { email: 'alice@test.com', first_name: 'Alice', last_name: 'Smith' },
            },
        ]);

        const res = await request(app)
            .get('/api/v1/users/me/notifications')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(200);
        expect(res.body.notifications).toHaveLength(1);
        expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                user_id: 'user-emp-1',
                deleted_at: null,
            }),
        }));
    });

    it('opens a notification and marks it as read', async () => {
        const notification = {
            id: 'notif-1',
            user_id: 'user-emp-1',
            message: 'Timer stopped automatically',
            type: 'timer_auto_stopped',
            is_read: false,
            read_at: null,
            deleted_at: null,
            created_at: new Date('2026-04-09T10:00:00.000Z'),
            user: { email: 'alice@test.com', first_name: 'Alice', last_name: 'Smith' },
        };
        (prisma.notification.findFirst as jest.Mock).mockResolvedValue(notification);
        (prisma.notification.update as jest.Mock).mockResolvedValue({ ...notification, is_read: true, read_at: new Date('2026-04-09T10:05:00.000Z') });

        const res = await request(app)
            .get('/api/v1/users/me/notifications/notif-1')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(200);
        expect(res.body.notification.is_read).toBe(true);
        expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ is_read: true }),
        }));
    });

    it('soft deletes a notification for the authenticated user', async () => {
        (prisma.notification.findFirst as jest.Mock).mockResolvedValue({
            id: 'notif-1',
            user_id: 'user-emp-1',
            is_read: false,
            read_at: null,
            deleted_at: null,
        });

        const res = await request(app)
            .delete('/api/v1/users/me/notifications/notif-1')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(200);
        expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                deleted_at: expect.any(Date),
                is_read: true,
            }),
        }));
    });
});

// ─── getAllUsers ──────────────────────────────────────────────────────────────

describe('GET /api/v1/users', () => {
    it('returns 200 with users list for Admin', async () => {
        (prisma.user.findMany as jest.Mock).mockResolvedValue([
            { id: 'user-1', email: 'alice@test.com', first_name: 'Alice', last_name: 'Smith', is_active: true, role: { name: 'Employee' } },
            { id: 'user-2', email: 'bob@test.com', first_name: 'Bob', last_name: 'Jones', is_active: true, role: { name: 'Manager' } },
        ]);

        const res = await request(app)
            .get('/api/v1/users')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
    });

    it('returns 200 with users list for Manager', async () => {
        (prisma.user.findMany as jest.Mock).mockResolvedValue([mockUser]);

        const res = await request(app)
            .get('/api/v1/users')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 403 for Employee role', async () => {
        const res = await request(app)
            .get('/api/v1/users')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
    });
});

describe('GET /api/v1/users/:id/auth-events', () => {
    it('returns auth events for Admin and Manager users', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
        (prisma.authEvent.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'auth-1',
                user_id: 'user-emp-1',
                email: 'alice@test.com',
                event_type: 'login_attempt',
                outcome: 'failure',
                reason: 'invalid_password',
                created_at: new Date('2026-04-07T08:00:00.000Z'),
            },
        ]);

        const adminRes = await request(app)
            .get('/api/v1/users/user-emp-1/auth-events')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(adminRes.status).toBe(200);
        expect(adminRes.body.events).toHaveLength(1);

        const managerRes = await request(app)
            .get('/api/v1/users/user-emp-1/auth-events')
            .set('Authorization', `Bearer ${managerToken}`);

        expect(managerRes.status).toBe(200);
        expect(managerRes.body.user.email).toBe('alice@test.com');
    });

    it('returns 403 for Employee role', async () => {
        const res = await request(app)
            .get('/api/v1/users/user-emp-1/auth-events')
            .set('Authorization', `Bearer ${employeeToken}`);

        expect(res.status).toBe(403);
    });
});

// ─── createUser ──────────────────────────────────────────────────────────────

describe('POST /api/v1/users', () => {
    it('Admin can create a new user and returns 201', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
        (prisma.role.findUnique as jest.Mock).mockResolvedValue(mockRole);
        (prisma.user.create as jest.Mock).mockResolvedValue({
            id: 'user-new-1',
            email: 'newuser@test.com',
            first_name: 'New',
            last_name: 'User',
            is_active: true,
            role: { name: 'Employee' },
        });

        const res = await request(app)
            .post('/api/v1/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                email: 'newuser@test.com',
                password: 'securePass123!',
                first_name: 'New',
                last_name: 'User',
                role: 'Employee',
            });

        expect(res.status).toBe(201);
        expect(res.body.email).toBe('newuser@test.com');
    });

    it('returns 400 when email already exists', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

        const res = await request(app)
            .post('/api/v1/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                email: 'alice@test.com',
                password: 'pass123',
                first_name: 'Alice',
                last_name: 'Copy',
                role: 'Employee',
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already exists/i);
    });

    it('returns 400 when required fields are missing', async () => {
        const res = await request(app)
            .post('/api/v1/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ email: 'incomplete@test.com' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/missing/i);
    });

    it('returns 403 for Employee role', async () => {
        const res = await request(app)
            .post('/api/v1/users')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ email: 'x@test.com', password: 'pass', first_name: 'X', last_name: 'Y', role: 'Employee' });

        expect(res.status).toBe(403);
    });
});

// ─── updateUser ──────────────────────────────────────────────────────────────

describe('PUT /api/v1/users/:id', () => {
    it('returns 200 with updated user on success', async () => {
        const updatedUser = { ...mockUser, first_name: 'Alicia' };
        (prisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

        const res = await request(app)
            .put('/api/v1/users/user-emp-1')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ first_name: 'Alicia' });

        expect(res.status).toBe(200);
        expect(res.body.first_name).toBe('Alicia');
    });

    it('returns 400 when no valid update fields are provided', async () => {
        const res = await request(app)
            .put('/api/v1/users/user-emp-1')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/no valid fields/i);
    });
});

// ─── updateMe ────────────────────────────────────────────────────────────────

describe('PUT /api/v1/users/me', () => {
    it('returns 200 with updated own profile', async () => {
        const updatedUser = {
            ...mockUser,
            first_name: 'AliceUpdated',
            role: { name: 'Employee' },
        };
        (prisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

        const res = await request(app)
            .put('/api/v1/users/me')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({ first_name: 'AliceUpdated' });

        expect(res.status).toBe(200);
        expect(res.body.first_name).toBe('AliceUpdated');
    });

    it('returns 400 when no valid update fields are provided', async () => {
        const res = await request(app)
            .put('/api/v1/users/me')
            .set('Authorization', `Bearer ${employeeToken}`)
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/no valid fields/i);
    });
});
