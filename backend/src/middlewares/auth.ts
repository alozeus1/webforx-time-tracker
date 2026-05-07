import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthRequest, AuthenticatedUser } from '../types/auth';

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
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

    jwt.verify(token, env.jwtSecret, (err: jwt.VerifyErrors | null, user: string | JwtPayload | undefined) => {
        if (err) {
            res.status(401).json({
                message: 'Invalid or expired token',
                error: {
                    code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
                    message: 'Invalid or expired token',
                },
            });
            return;
        }
        req.user = user as AuthenticatedUser;
        next();
    });
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
