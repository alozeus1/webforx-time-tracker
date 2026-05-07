import { Request } from 'express';

export interface AuthenticatedUser {
    userId: string;
    email: string;
    role: string;
    organization_id: string;
    iat?: number;
    exp?: number;
}

export interface AuthRequest extends Request {
    user?: AuthenticatedUser;
}
