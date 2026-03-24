import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { env } from '../config/env';
import { decryptConfig } from '../utils/crypto';

const GOOGLE_CALENDAR_SCOPES = [
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar.readonly',
];

interface CalendarOAuthState {
    userId: string;
    returnTo: string;
}

const ensureGoogleCalendarEnv = () => {
    if (!env.googleClientId || !env.googleClientSecret || !env.googleRedirectUri) {
        throw new Error('Google Calendar OAuth is not configured on the server');
    }
};

export const isGoogleCalendarConfigured = () =>
    Boolean(env.googleClientId && env.googleClientSecret && env.googleRedirectUri);

export const sanitizeReturnTo = (returnTo?: string) => {
    if (!returnTo || !returnTo.startsWith('/')) {
        return '/integrations';
    }

    if (returnTo.startsWith('//')) {
        return '/integrations';
    }

    return returnTo;
};

export const createGoogleOAuthClient = () => {
    ensureGoogleCalendarEnv();

    return new google.auth.OAuth2(
        env.googleClientId,
        env.googleClientSecret,
        env.googleRedirectUri,
    );
};

export const createGoogleCalendarAuthUrl = (payload: CalendarOAuthState) => {
    const client = createGoogleOAuthClient();
    const state = jwt.sign(
        {
            userId: payload.userId,
            returnTo: sanitizeReturnTo(payload.returnTo),
            provider: 'google-calendar',
        },
        env.jwtSecret,
        { expiresIn: '10m' },
    );

    return client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: true,
        scope: GOOGLE_CALENDAR_SCOPES,
        state,
    });
};

export const parseGoogleCalendarState = (state: string) => {
    const payload = jwt.verify(state, env.jwtSecret) as CalendarOAuthState & {
        provider?: string;
    };

    if (payload.provider !== 'google-calendar' || !payload.userId) {
        throw new Error('Invalid Google Calendar OAuth state');
    }

    return {
        userId: payload.userId,
        returnTo: sanitizeReturnTo(payload.returnTo),
    };
};

export const exchangeGoogleCode = async (code: string) => {
    const client = createGoogleOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    return {
        client,
        tokens,
    };
};

export const getGoogleUserEmail = async (client: ReturnType<typeof createGoogleOAuthClient>) => {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const response = await oauth2.userinfo.get();
    return response.data.email || null;
};

export const createAuthorizedGoogleClient = (encryptedRefreshToken: string) => {
    const client = createGoogleOAuthClient();
    const refreshToken = decryptConfig<string>(encryptedRefreshToken);
    client.setCredentials({ refresh_token: refreshToken });

    return client;
};

export const revokeGoogleRefreshToken = async (encryptedRefreshToken: string) => {
    const refreshToken = decryptConfig<string>(encryptedRefreshToken);
    const client = createGoogleOAuthClient();
    await client.revokeToken(refreshToken);
};
