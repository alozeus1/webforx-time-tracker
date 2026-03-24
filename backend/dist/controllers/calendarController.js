"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectGoogleCalendar = exports.getCalendarEvents = exports.handleGoogleCalendarCallback = exports.getGoogleCalendarConnectUrl = exports.getCalendarStatus = void 0;
const googleapis_1 = require("googleapis");
const db_1 = __importDefault(require("../config/db"));
const crypto_1 = require("../utils/crypto");
const googleCalendar_1 = require("../services/googleCalendar");
const env_1 = require("../config/env");
const requireUserId = (req) => {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
        throw new Error('Authenticated user is required');
    }
    return req.user.userId;
};
const buildFrontendRedirectUrl = (returnTo, status, reason) => {
    const url = new URL((0, googleCalendar_1.sanitizeReturnTo)(returnTo), env_1.env.frontendUrl.endsWith('/') ? env_1.env.frontendUrl : `${env_1.env.frontendUrl}/`);
    url.searchParams.set('calendar', status);
    if (reason) {
        url.searchParams.set('reason', reason);
    }
    return url.toString();
};
const suggestProject = (eventText, projectNames) => {
    const normalized = eventText.toLowerCase();
    return projectNames.find((projectName) => normalized.includes(projectName.toLowerCase())) || null;
};
const getCalendarStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!(0, googleCalendar_1.isGoogleCalendarConfigured)()) {
            res.status(200).json({ configured: false, connected: false, provider: 'google' });
            return;
        }
        const connection = yield db_1.default.calendarConnection.findUnique({
            where: { user_id: requireUserId(req) },
        });
        res.status(200).json({
            configured: true,
            connected: Boolean(connection),
            provider: 'google',
            email: (connection === null || connection === void 0 ? void 0 : connection.google_email) || null,
        });
    }
    catch (error) {
        console.error('Failed to load calendar status:', error);
        res.status(500).json({ message: 'Internal server error while loading calendar status' });
    }
});
exports.getCalendarStatus = getCalendarStatus;
const getGoogleCalendarConnectUrl = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!(0, googleCalendar_1.isGoogleCalendarConfigured)()) {
            res.status(503).json({ message: 'Google Calendar integration is not configured on this server' });
            return;
        }
        const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/integrations';
        const url = (0, googleCalendar_1.createGoogleCalendarAuthUrl)({
            userId: requireUserId(req),
            returnTo,
        });
        res.status(200).json({ url });
    }
    catch (error) {
        console.error('Failed to create Google Calendar connect URL:', error);
        res.status(500).json({ message: 'Internal server error while starting Google Calendar connection' });
    }
});
exports.getGoogleCalendarConnectUrl = getGoogleCalendarConnectUrl;
const handleGoogleCalendarCallback = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const parsedState = (0, googleCalendar_1.parseGoogleCalendarState)(state);
        returnTo = parsedState.returnTo;
        const existingConnection = yield db_1.default.calendarConnection.findUnique({
            where: { user_id: parsedState.userId },
        });
        const { client, tokens } = yield (0, googleCalendar_1.exchangeGoogleCode)(code);
        const refreshToken = tokens.refresh_token || (existingConnection ? undefined : '');
        const effectiveRefreshToken = tokens.refresh_token || (existingConnection === null || existingConnection === void 0 ? void 0 : existingConnection.refresh_token);
        if (!effectiveRefreshToken) {
            throw new Error('Google did not return a refresh token');
        }
        const encryptedRefreshToken = tokens.refresh_token
            ? (0, crypto_1.encryptConfig)(tokens.refresh_token)
            : effectiveRefreshToken;
        const googleEmail = yield (0, googleCalendar_1.getGoogleUserEmail)(client);
        yield db_1.default.calendarConnection.upsert({
            where: { user_id: parsedState.userId },
            update: {
                provider: 'google',
                google_email: googleEmail,
                refresh_token: encryptedRefreshToken,
                scope: tokens.scope || (existingConnection === null || existingConnection === void 0 ? void 0 : existingConnection.scope) || null,
            },
            create: {
                user_id: parsedState.userId,
                provider: 'google',
                google_email: googleEmail,
                refresh_token: encryptedRefreshToken,
                scope: tokens.scope || null,
            },
        });
        yield db_1.default.auditLog.create({
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
    }
    catch (error) {
        console.error('Failed to complete Google Calendar OAuth callback:', error);
        res.redirect(buildFrontendRedirectUrl(returnTo, 'error', 'oauth_failed'));
    }
});
exports.handleGoogleCalendarCallback = handleGoogleCalendarCallback;
const getCalendarEvents = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!(0, googleCalendar_1.isGoogleCalendarConfigured)()) {
            res.status(503).json({ message: 'Google Calendar integration is not configured on this server' });
            return;
        }
        const userId = requireUserId(req);
        const connection = yield db_1.default.calendarConnection.findUnique({
            where: { user_id: userId },
        });
        if (!connection) {
            res.status(409).json({ message: 'Google Calendar is not connected for this account' });
            return;
        }
        const client = (0, googleCalendar_1.createAuthorizedGoogleClient)(connection.refresh_token);
        const calendar = googleapis_1.google.calendar({ version: 'v3', auth: client });
        const now = new Date();
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(now);
        dayEnd.setHours(23, 59, 59, 999);
        const activeProjects = yield db_1.default.project.findMany({
            where: { is_active: true },
            select: { name: true },
        });
        const projectNames = activeProjects.map((project) => project.name);
        const response = yield calendar.events.list({
            calendarId: 'primary',
            timeMin: dayStart.toISOString(),
            timeMax: dayEnd.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 10,
        });
        const events = (response.data.items || [])
            .filter((item) => { var _a, _b; return item.status !== 'cancelled' && (((_a = item.start) === null || _a === void 0 ? void 0 : _a.dateTime) || ((_b = item.start) === null || _b === void 0 ? void 0 : _b.date)); })
            .map((item) => {
            var _a, _b, _c, _d, _e, _f;
            const title = item.summary || 'Untitled Event';
            const searchableText = [item.summary, item.description, item.location].filter(Boolean).join(' ');
            return {
                id: item.id || `${title}-${((_a = item.start) === null || _a === void 0 ? void 0 : _a.dateTime) || ((_b = item.start) === null || _b === void 0 ? void 0 : _b.date)}`,
                title,
                start: ((_c = item.start) === null || _c === void 0 ? void 0 : _c.dateTime) || ((_d = item.start) === null || _d === void 0 ? void 0 : _d.date) || now.toISOString(),
                end: ((_e = item.end) === null || _e === void 0 ? void 0 : _e.dateTime) || ((_f = item.end) === null || _f === void 0 ? void 0 : _f.date) || now.toISOString(),
                suggested_project: suggestProject(searchableText, projectNames),
            };
        });
        res.status(200).json({ events });
    }
    catch (error) {
        console.error('Failed to get calendar events:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes('invalid_grant')) {
            yield db_1.default.calendarConnection.deleteMany({
                where: { user_id: (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId },
            });
            res.status(401).json({ message: 'Google Calendar authorization expired. Please reconnect your account.' });
            return;
        }
        res.status(500).json({ message: 'Internal server error while syncing calendar' });
    }
});
exports.getCalendarEvents = getCalendarEvents;
const disconnectGoogleCalendar = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = requireUserId(req);
        const connection = yield db_1.default.calendarConnection.findUnique({
            where: { user_id: userId },
        });
        if (!connection) {
            res.status(200).json({ message: 'Google Calendar was already disconnected' });
            return;
        }
        try {
            yield (0, googleCalendar_1.revokeGoogleRefreshToken)(connection.refresh_token);
        }
        catch (error) {
            console.warn('Failed to revoke Google refresh token, continuing with disconnect:', error);
        }
        yield db_1.default.calendarConnection.delete({
            where: { user_id: userId },
        });
        yield db_1.default.auditLog.create({
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
    }
    catch (error) {
        console.error('Failed to disconnect Google Calendar:', error);
        res.status(500).json({ message: 'Internal server error while disconnecting Google Calendar' });
    }
});
exports.disconnectGoogleCalendar = disconnectGoogleCalendar;
