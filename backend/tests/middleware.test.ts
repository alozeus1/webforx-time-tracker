import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken, requireRole } from '../src/middlewares/auth';
import { AuthRequest, AuthenticatedUser } from '../src/types/auth';

const JWT_SECRET = 'test-jwt-secret';

const makeRes = () => {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
};

const makeNext = () => jest.fn() as NextFunction;

// ─── authenticateToken ──────────────────────────────────────────────────────

describe('authenticateToken middleware', () => {
    it('calls next() and populates req.user when token is valid', () => {
        const payload: AuthenticatedUser = {
            userId: 'user-1',
            email: 'user@test.com',
            role: 'Employee',
        };
        const token = jwt.sign(payload, JWT_SECRET);

        const req = {
            headers: { authorization: `Bearer ${token}` },
        } as unknown as AuthRequest;
        const res = makeRes();
        const next = makeNext();

        authenticateToken(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toBeDefined();
        expect(req.user?.userId).toBe('user-1');
        expect(req.user?.role).toBe('Employee');
    });

    it('returns 401 when Authorization header is missing', () => {
        const req = { headers: {} } as unknown as AuthRequest;
        const res = makeRes();
        const next = makeNext();

        authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/no token/i),
                error: expect.objectContaining({ code: 'TOKEN_MISSING' }),
            })
        );
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when token is invalid/expired', () => {
        const req = {
            headers: { authorization: 'Bearer totally-invalid-token' },
        } as unknown as AuthRequest;
        const res = makeRes();
        const next = makeNext();

        authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/invalid/i),
                error: expect.objectContaining({ code: 'TOKEN_INVALID' }),
            })
        );
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when token is signed with wrong secret', () => {
        const token = jwt.sign({ userId: 'u1', role: 'Admin' }, 'wrong-secret');
        const req = {
            headers: { authorization: `Bearer ${token}` },
        } as unknown as AuthRequest;
        const res = makeRes();
        const next = makeNext();

        authenticateToken(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});

// ─── requireRole ────────────────────────────────────────────────────────────

describe('requireRole middleware', () => {
    it('calls next() when user has an allowed role', () => {
        const req = {
            user: { userId: 'user-1', email: 'mgr@test.com', role: 'Manager' },
        } as unknown as AuthRequest;
        const res = makeRes();
        const next = makeNext();

        requireRole(['Manager', 'Admin'])(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next() when user has Admin role', () => {
        const req = {
            user: { userId: 'user-admin', email: 'admin@test.com', role: 'Admin' },
        } as unknown as AuthRequest;
        const res = makeRes();
        const next = makeNext();

        requireRole(['Admin'])(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 403 when user role is not in allowed roles', () => {
        const req = {
            user: { userId: 'user-emp', email: 'emp@test.com', role: 'Employee' },
        } as unknown as AuthRequest;
        const res = makeRes();
        const next = makeNext();

        requireRole(['Manager', 'Admin'])(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringMatching(/forbidden/i) })
        );
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when req.user is undefined', () => {
        const req = {} as unknown as AuthRequest;
        const res = makeRes();
        const next = makeNext();

        requireRole(['Admin'])(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 for Intern role when only Employee is allowed', () => {
        const req = {
            user: { userId: 'intern-1', email: 'intern@test.com', role: 'Intern' },
        } as unknown as AuthRequest;
        const res = makeRes();
        const next = makeNext();

        requireRole(['Employee'])(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
});
