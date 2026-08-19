import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';

interface AuthRequest extends Request {
    user?: any;
}

const MAX_AUDIT_FIELD_NAMES = 50;

const auditFieldNames = (value: unknown): string[] | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return Object.keys(value as Record<string, unknown>).slice(0, MAX_AUDIT_FIELD_NAMES);
};

export const auditLog = (action: string, resourcePath?: string) => {
    return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        if (req.user) {
            try {
                await prisma.auditLog.create({
                    data: {
                        user_id: req.user.userId,
                        organization_id: req.user.organization_id,
                        action: action,
                        resource: resourcePath || req.originalUrl,
                        metadata: {
                            method: req.method,
                            // Never retain request values here. A generic middleware
                            // cannot safely distinguish passwords, tokens, PII, or
                            // integration credentials from ordinary payload fields.
                            query_fields: auditFieldNames(req.query),
                            body_fields: req.method !== 'GET' ? auditFieldNames(req.body) : undefined,
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
