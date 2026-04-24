"use strict";
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const requireEnv = (name) => {
    var _a;
    const value = (_a = process.env[name]) === null || _a === void 0 ? void 0 : _a.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
};
const nodeEnv = ((_a = process.env.NODE_ENV) === null || _a === void 0 ? void 0 : _a.trim()) || 'development';
const jwtSecret = requireEnv('JWT_SECRET');
const parseMinutesEnv = (name, fallback) => {
    var _a;
    const raw = (_a = process.env[name]) === null || _a === void 0 ? void 0 : _a.trim();
    if (!raw) {
        return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const resolveIntegrationSecret = () => {
    var _a;
    const explicit = (_a = process.env.INTEGRATION_SECRET) === null || _a === void 0 ? void 0 : _a.trim();
    if (explicit) {
        return explicit;
    }
    // Keep local onboarding simple, but never allow this fallback in production.
    if (nodeEnv !== 'production') {
        return jwtSecret;
    }
    throw new Error('Missing required environment variable: INTEGRATION_SECRET');
};
exports.env = {
    nodeEnv,
    port: Number(process.env.PORT || 5005),
    databaseUrl: requireEnv('DATABASE_URL'),
    jwtSecret,
    integrationSecret: resolveIntegrationSecret(),
    cronSecret: ((_b = process.env.CRON_SECRET) === null || _b === void 0 ? void 0 : _b.trim()) || '',
    corsOrigin: ((_c = process.env.CORS_ORIGIN) === null || _c === void 0 ? void 0 : _c.trim()) || 'http://localhost:5173',
    frontendUrl: ((_d = process.env.FRONTEND_URL) === null || _d === void 0 ? void 0 : _d.trim()) || ((_e = process.env.CORS_ORIGIN) === null || _e === void 0 ? void 0 : _e.trim()) || 'http://localhost:5173',
    enableBackgroundWorkers: process.env.ENABLE_BACKGROUND_WORKERS !== 'false',
    googleClientId: ((_f = process.env.GOOGLE_CLIENT_ID) === null || _f === void 0 ? void 0 : _f.trim()) || '',
    googleClientSecret: ((_g = process.env.GOOGLE_CLIENT_SECRET) === null || _g === void 0 ? void 0 : _g.trim()) || '',
    googleRedirectUri: ((_h = process.env.GOOGLE_REDIRECT_URI) === null || _h === void 0 ? void 0 : _h.trim()) || '',
    idleWarningMinutes: parseMinutesEnv('IDLE_WARNING_MINUTES', 5),
    heartbeatIntervalMinutes: parseMinutesEnv('HEARTBEAT_INTERVAL_MINUTES', 3),
    heartbeatStaleMinutes: parseMinutesEnv('HEARTBEAT_STALE_MINUTES', 8),
    autoStopGraceMinutes: parseMinutesEnv('AUTO_STOP_GRACE_MINUTES', 2),
    maxPauseHours: (() => {
        var _a;
        const raw = (_a = process.env.MAX_PAUSE_HOURS) === null || _a === void 0 ? void 0 : _a.trim();
        const parsed = Number.parseFloat(raw || '');
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
    })(),
    authentikEnabled: ((_j = process.env.AUTHENTIK_ENABLED) === null || _j === void 0 ? void 0 : _j.trim().toLowerCase()) === 'true',
    authentikIssuerUrl: ((_k = process.env.AUTHENTIK_ISSUER_URL) === null || _k === void 0 ? void 0 : _k.trim()) || '',
    authentikClientId: ((_l = process.env.AUTHENTIK_CLIENT_ID) === null || _l === void 0 ? void 0 : _l.trim()) || '',
    authentikClientSecret: ((_m = process.env.AUTHENTIK_CLIENT_SECRET) === null || _m === void 0 ? void 0 : _m.trim()) || '',
    authentikRedirectUri: ((_o = process.env.AUTHENTIK_REDIRECT_URI) === null || _o === void 0 ? void 0 : _o.trim()) || '',
    authentikPostLogoutRedirectUri: ((_p = process.env.AUTHENTIK_POST_LOGOUT_REDIRECT_URI) === null || _p === void 0 ? void 0 : _p.trim()) || '',
    authentikScopes: ((_q = process.env.AUTHENTIK_SCOPES) === null || _q === void 0 ? void 0 : _q.trim()) || 'openid profile email',
    resendApiKey: ((_r = process.env.RESEND_API_KEY) === null || _r === void 0 ? void 0 : _r.trim()) || '',
    emailFrom: ((_s = process.env.EMAIL_FROM) === null || _s === void 0 ? void 0 : _s.trim()) || 'Web Forx Time Tracker <noreply@webforxtech.com>',
};
