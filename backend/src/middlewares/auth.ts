import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';
import { AuthRequest, AuthenticatedUser } from '../types/auth';
import { verifyToken } from '../services/tokenService';

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    // Support both Bearer header and httpOnly cookie
    const authHeader = req.headers['authorization'];
    const headerToken = authHeader && authHeader.split(' ')[1];
    const cookieToken = req.cookies?.access_token;
    const token = headerToken || cookieToken;

    if (!token) {
        res.status(401).json({
            message: 'Access denied: No token provided',
            error: { code: 'TOKEN_MISSING', message: 'Access denied: No token provided' },
        });
        return;
    }

    try {
        const authenticatedUser = verifyToken<AuthenticatedUser & { type?: string }>(token);
        if (authenticatedUser.type && authenticatedUser.type !== 'access') {
            res.status(401).json({
                message: 'Invalid or expired token',
                error: {
                    code: 'TOKEN_INVALID',
                    message: 'Invalid or expired token',
                },
            });
            return;
        }

        if (!authenticatedUser.organization_id && authenticatedUser.userId) {
            const dbUser = await prisma.user.findUnique({
                where: { id: authenticatedUser.userId },
                select: { organization_id: true },
            });

            if (!dbUser?.organization_id) {
                res.status(401).json({
                    message: 'Invalid or expired token',
                    error: {
                        code: 'TOKEN_INVALID',
                        message: 'Invalid or expired token',
                    },
                });
                return;
            }

            authenticatedUser.organization_id = dbUser.organization_id;
        }

        req.user = authenticatedUser;
        next();
    } catch (err) {
        res.status(401).json({
            message: 'Invalid or expired token',
            error: {
                code: (err as { name?: string }).name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
                message: 'Invalid or expired token',
            },
        });
    }
};

export const requireRole = (roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user || !roles.includes(req.user.role)) {
            res.status(403).json({ message: 'Forbidden: Insufficient privileges' });
            return;
        }
        next();
    };
};

/**
 * Privileged-role assignment guard (single source of truth for all user
 * write paths: createUser, importUsers, updateUser).
 *
 * Only an Admin may create or assign the `Admin` access role. This is enforced
 * server-side because hiding the option in the UI is not a security control —
 * the API can be called directly. Throws a typed error the controllers map to 403.
 */
export class RoleAssignmentError extends Error {
    code = 'ROLE_ASSIGNMENT_FORBIDDEN' as const;
    constructor(message: string) {
        super(message);
        this.name = 'RoleAssignmentError';
    }
}

export const assertCanAssignRole = (actorRole: string | undefined, targetRoleName: string): void => {
    const target = (targetRoleName || '').trim().toLowerCase();
    if (target === 'admin' && actorRole !== 'Admin') {
        throw new RoleAssignmentError('Only Admin users can assign the Admin role.');
    }
};
