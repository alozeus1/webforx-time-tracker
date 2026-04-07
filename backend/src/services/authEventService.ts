import { Prisma } from '@prisma/client';
import { Request } from 'express';
import prisma from '../config/db';

type AuthEventInput = {
    userId?: string | null;
    email?: string | null;
    eventType: string;
    outcome: string;
    reason?: string | null;
    metadata?: Prisma.InputJsonValue;
};

const getClientIp = (req: Request): string | null => {
    const forwardedFor = req.headers['x-forwarded-for'];

    if (Array.isArray(forwardedFor) && forwardedFor[0]) {
        return forwardedFor[0].split(',')[0]?.trim() || null;
    }

    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return forwardedFor.split(',')[0]?.trim() || null;
    }

    return req.ip || null;
};

const getUserAgent = (req: Request): string | null => {
    const userAgent = req.headers['user-agent'];

    if (Array.isArray(userAgent)) {
        return userAgent[0]?.trim() || null;
    }

    return typeof userAgent === 'string' && userAgent.trim() ? userAgent.trim() : null;
};

export const logAuthEvent = async (req: Request, input: AuthEventInput): Promise<void> => {
    try {
        await prisma.authEvent.create({
            data: {
                user_id: input.userId ?? null,
                email: input.email?.trim().toLowerCase() || null,
                event_type: input.eventType,
                outcome: input.outcome,
                reason: input.reason ?? null,
                ip_address: getClientIp(req),
                user_agent: getUserAgent(req),
                metadata: input.metadata ?? {},
            },
        });
    } catch (error) {
        console.error('Failed to write auth event:', error);
    }
};
