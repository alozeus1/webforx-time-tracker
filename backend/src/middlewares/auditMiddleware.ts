import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';

interface AuthRequest extends Request {
    user?: any;
}

export const auditLog = (action: string, resourcePath?: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        // We capture the original send to intercept response finish if needed, 
        // but for MVP logging request is sufficient once route is hit.

        if (req.user) {
            try {
                await prisma.auditLog.create({
                    data: {
                        user_id: req.user.userId,
                        action: action,
                        resource: resourcePath || req.originalUrl,
                        metadata: {
                            method: req.method,
                            query: req.query,
                            body: req.method !== 'GET' ? req.body : undefined // Be careful with passwords in real prod
                        }
                    }
                });
            } catch (err) {
                console.error('Audit log failed', err);
            }
        }

        next();
    };
};
