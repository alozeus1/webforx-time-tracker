"use strict";
var _a, _b, _c, _d, _e, _f, _g, _h;
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
};
