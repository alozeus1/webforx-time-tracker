import { Response } from 'express';
import { google } from 'googleapis';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { encryptConfig } from '../utils/crypto';
import {
    createAuthorizedGoogleClient,
    createGoogleCalendarAuthUrl,
    exchangeGoogleCode,
    getGoogleUserEmail,
    isGoogleCalendarConfigured,
    parseGoogleCalendarState,
    revokeGoogleRefreshToken,
    sanitizeReturnTo,
} from '../services/googleCalendar';
import { env } from '../config/env';

const requireUserId = (req: AuthRequest): string => {
    if (!req.user?.userId) {
        throw new Error('Authenticated user is required');
    }

    return req.user.userId;
};

const buildFrontendRedirectUrl = (returnTo: string, status: 'connected' | 'error', reason?: string) => {
    const url = new URL(sanitizeReturnTo(returnTo), env.frontendUrl.endsWith('/') ? env.frontendUrl : `${env.frontendUrl}/`);
    url.searchParams.set('calendar', status);

    if (reason) {
        url.searchParams.set('reason', reason);
    }

    return url.toString();
};

const suggestProject = (eventText: string, projectNames: string[]) => {
    const normalized = eventText.toLowerCase();
    return projectNames.find((projectName) => normalized.includes(projectName.toLowerCase())) || null;
};

export const getCalendarStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!isGoogleCalendarConfigured()) {
            res.status(200).json({ configured: false, connected: false, provider: 'google' });
            return;
        }

        const connection = await prisma.calendarConnection.findUnique({
            where: { user_id: requireUserId(req) },
        });

        res.status(200).json({
            configured: true,
            connected: Boolean(connection),
            provider: 'google',
            email: connection?.google_email || null,
        });
    } catch (error) {
        console.error('Failed to load calendar status:', error);
        res.status(500).json({ message: 'Internal server error while loading calendar status' });
    }
};

export const getGoogleCalendarConnectUrl = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!isGoogleCalendarConfigured()) {
            res.status(503).json({ message: 'Google Calendar integration is not configured on this server' });
            return;
        }

        const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/integrations';
        const url = createGoogleCalendarAuthUrl({
            userId: requireUserId(req),
            returnTo,
        });

        res.status(200).json({ url });
    } catch (error) {
        console.error('Failed to create Google Calendar connect URL:', error);
        res.status(500).json({ message: 'Internal server error while starting Google Calendar connection' });
    }
};

export const handleGoogleCalendarCallback = async (req: AuthRequest, res: Response): Promise<void> => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const oauthError = typeof req.query.error === 'string' ? req.query.error : '';

    let returnTo = '/integrations';

    try {
        if (oauthError) {
            throw new Error(oauthError);
        }

        if (!code || !state) {
            throw new Error('Missing OAuth response parameters');
        }

        const parsedState = parseGoogleCalendarState(state);
        returnTo = parsedState.returnTo;

        const existingConnection = await prisma.calendarConnection.findUnique({
            where: { user_id: parsedState.userId },
        });

        const { client, tokens } = await exchangeGoogleCode(code);
        const refreshToken = tokens.refresh_token || (existingConnection ? undefined : '');
        const effectiveRefreshToken = tokens.refresh_token || existingConnection?.refresh_token;

        if (!effectiveRefreshToken) {
            throw new Error('Google did not return a refresh token');
        }

        const encryptedRefreshToken = tokens.refresh_token
            ? encryptConfig(tokens.refresh_token)
            : effectiveRefreshToken;

        const googleEmail = await getGoogleUserEmail(client);

        await prisma.calendarConnection.upsert({
            where: { user_id: parsedState.userId },
            update: {
                provider: 'google',
                google_email: googleEmail,
                refresh_token: encryptedRefreshToken,
                scope: tokens.scope || existingConnection?.scope || null,
            },
            create: {
                user_id: parsedState.userId,
                provider: 'google',
                google_email: googleEmail,
                refresh_token: encryptedRefreshToken,
                scope: tokens.scope || null,
            },
        });

        await prisma.auditLog.create({
            data: {
                user_id: parsedState.userId,
                action: 'calendar_connected',
                resource: 'google_calendar',
                metadata: {
                    provider: 'google',
                    email: googleEmail,
                    scopes: tokens.scope || null,
                    refresh_token_received: Boolean(refreshToken),
                },
            },
        });

        res.redirect(buildFrontendRedirectUrl(returnTo, 'connected'));
    } catch (error) {
        console.error('Failed to complete Google Calendar OAuth callback:', error);
        res.redirect(buildFrontendRedirectUrl(returnTo, 'error', 'oauth_failed'));
    }
};

export const getCalendarEvents = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!isGoogleCalendarConfigured()) {
            res.status(503).json({ message: 'Google Calendar integration is not configured on this server' });
            return;
        }

        const userId = requireUserId(req);
        const connection = await prisma.calendarConnection.findUnique({
            where: { user_id: userId },
        });

        if (!connection) {
            res.status(409).json({ message: 'Google Calendar is not connected for this account' });
            return;
        }

        const client = createAuthorizedGoogleClient(connection.refresh_token);
        const calendar = google.calendar({ version: 'v3', auth: client });

        const now = new Date();
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(now);
        dayEnd.setHours(23, 59, 59, 999);

        const activeProjects = await prisma.project.findMany({
            where: { is_active: true },
            select: { name: true },
        });
        const projectNames = activeProjects.map((project) => project.name);

        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: dayStart.toISOString(),
            timeMax: dayEnd.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 10,
        });

        const events = (response.data.items || [])
            .filter((item) => item.status !== 'cancelled' && (item.start?.dateTime || item.start?.date))
            .map((item) => {
                const title = item.summary || 'Untitled Event';
                const searchableText = [item.summary, item.description, item.location].filter(Boolean).join(' ');

                return {
                    id: item.id || `${title}-${item.start?.dateTime || item.start?.date}`,
                    title,
                    start: item.start?.dateTime || item.start?.date || now.toISOString(),
                    end: item.end?.dateTime || item.end?.date || now.toISOString(),
                    suggested_project: suggestProject(searchableText, projectNames),
                };
            });

        res.status(200).json({ events });
    } catch (error) {
        console.error('Failed to get calendar events:', error);

        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('invalid_grant')) {
            await prisma.calendarConnection.deleteMany({
                where: { user_id: req.user?.userId },
            });
            res.status(401).json({ message: 'Google Calendar authorization expired. Please reconnect your account.' });
            return;
        }

        res.status(500).json({ message: 'Internal server error while syncing calendar' });
    }
};

export const disconnectGoogleCalendar = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = requireUserId(req);
        const connection = await prisma.calendarConnection.findUnique({
            where: { user_id: userId },
        });

        if (!connection) {
            res.status(200).json({ message: 'Google Calendar was already disconnected' });
            return;
        }

        try {
            await revokeGoogleRefreshToken(connection.refresh_token);
        } catch (error) {
            console.warn('Failed to revoke Google refresh token, continuing with disconnect:', error);
        }

        await prisma.calendarConnection.delete({
            where: { user_id: userId },
        });

        await prisma.auditLog.create({
            data: {
                user_id: userId,
                action: 'calendar_disconnected',
                resource: 'google_calendar',
                metadata: {
                    provider: 'google',
                    email: connection.google_email,
                },
            },
        });

        res.status(200).json({ message: 'Google Calendar disconnected successfully' });
    } catch (error) {
        console.error('Failed to disconnect Google Calendar:', error);
        res.status(500).json({ message: 'Internal server error while disconnecting Google Calendar' });
    }
};
