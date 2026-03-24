"use strict";
var _a, _b, _c, _d, _e, _f, _g;
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
exports.env = {
    nodeEnv: ((_a = process.env.NODE_ENV) === null || _a === void 0 ? void 0 : _a.trim()) || 'development',
    port: Number(process.env.PORT || 5005),
    databaseUrl: requireEnv('DATABASE_URL'),
    jwtSecret: requireEnv('JWT_SECRET'),
    integrationSecret: requireEnv('INTEGRATION_SECRET'),
    corsOrigin: ((_b = process.env.CORS_ORIGIN) === null || _b === void 0 ? void 0 : _b.trim()) || 'http://localhost:5173',
    frontendUrl: ((_c = process.env.FRONTEND_URL) === null || _c === void 0 ? void 0 : _c.trim()) || ((_d = process.env.CORS_ORIGIN) === null || _d === void 0 ? void 0 : _d.trim()) || 'http://localhost:5173',
    enableBackgroundWorkers: process.env.ENABLE_BACKGROUND_WORKERS !== 'false',
    googleClientId: ((_e = process.env.GOOGLE_CLIENT_ID) === null || _e === void 0 ? void 0 : _e.trim()) || '',
    googleClientSecret: ((_f = process.env.GOOGLE_CLIENT_SECRET) === null || _f === void 0 ? void 0 : _f.trim()) || '',
    googleRedirectUri: ((_g = process.env.GOOGLE_REDIRECT_URI) === null || _g === void 0 ? void 0 : _g.trim()) || '',
};
