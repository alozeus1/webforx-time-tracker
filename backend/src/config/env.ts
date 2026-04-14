import 'dotenv/config';

const requireEnv = (name: string): string => {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
const jwtSecret = requireEnv('JWT_SECRET');
const parseMinutesEnv = (name: string, fallback: number) => {
    const raw = process.env[name]?.trim();
    if (!raw) {
        return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveIntegrationSecret = () => {
    const explicit = process.env.INTEGRATION_SECRET?.trim();
    if (explicit) {
        return explicit;
    }

    // Keep local onboarding simple, but never allow this fallback in production.
    if (nodeEnv !== 'production') {
        return jwtSecret;
    }

    throw new Error('Missing required environment variable: INTEGRATION_SECRET');
};

export const env = {
    nodeEnv,
    port: Number(process.env.PORT || 5005),
    databaseUrl: requireEnv('DATABASE_URL'),
    jwtSecret,
    integrationSecret: resolveIntegrationSecret(),
    cronSecret: process.env.CRON_SECRET?.trim() || '',
    corsOrigin: process.env.CORS_ORIGIN?.trim() || 'http://localhost:5173',
    frontendUrl: process.env.FRONTEND_URL?.trim() || process.env.CORS_ORIGIN?.trim() || 'http://localhost:5173',
    enableBackgroundWorkers: process.env.ENABLE_BACKGROUND_WORKERS !== 'false',
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI?.trim() || '',
    idleWarningMinutes: parseMinutesEnv('IDLE_WARNING_MINUTES', 5),
    heartbeatIntervalMinutes: parseMinutesEnv('HEARTBEAT_INTERVAL_MINUTES', 3),
    heartbeatStaleMinutes: parseMinutesEnv('HEARTBEAT_STALE_MINUTES', 8),
    autoStopGraceMinutes: parseMinutesEnv('AUTO_STOP_GRACE_MINUTES', 2),
    maxPauseHours: (() => {
        const raw = process.env.MAX_PAUSE_HOURS?.trim();
        const parsed = Number.parseFloat(raw || '');
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
    })(),
    authentikEnabled: process.env.AUTHENTIK_ENABLED?.trim().toLowerCase() === 'true',
    authentikIssuerUrl: process.env.AUTHENTIK_ISSUER_URL?.trim() || '',
    authentikClientId: process.env.AUTHENTIK_CLIENT_ID?.trim() || '',
    authentikClientSecret: process.env.AUTHENTIK_CLIENT_SECRET?.trim() || '',
    authentikRedirectUri: process.env.AUTHENTIK_REDIRECT_URI?.trim() || '',
    authentikPostLogoutRedirectUri: process.env.AUTHENTIK_POST_LOGOUT_REDIRECT_URI?.trim() || '',
    authentikScopes: process.env.AUTHENTIK_SCOPES?.trim() || 'openid profile email',
    resendApiKey: process.env.RESEND_API_KEY?.trim() || '',
    emailFrom: process.env.EMAIL_FROM?.trim() || 'Web Forx Time Tracker <noreply@webforxtech.com>',
};
