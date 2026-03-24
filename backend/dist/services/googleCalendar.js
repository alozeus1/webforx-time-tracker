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
exports.revokeGoogleRefreshToken = exports.createAuthorizedGoogleClient = exports.getGoogleUserEmail = exports.exchangeGoogleCode = exports.parseGoogleCalendarState = exports.createGoogleCalendarAuthUrl = exports.createGoogleOAuthClient = exports.sanitizeReturnTo = exports.isGoogleCalendarConfigured = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const googleapis_1 = require("googleapis");
const env_1 = require("../config/env");
const crypto_1 = require("../utils/crypto");
const GOOGLE_CALENDAR_SCOPES = [
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar.readonly',
];
const ensureGoogleCalendarEnv = () => {
    if (!env_1.env.googleClientId || !env_1.env.googleClientSecret || !env_1.env.googleRedirectUri) {
        throw new Error('Google Calendar OAuth is not configured on the server');
    }
};
const isGoogleCalendarConfigured = () => Boolean(env_1.env.googleClientId && env_1.env.googleClientSecret && env_1.env.googleRedirectUri);
exports.isGoogleCalendarConfigured = isGoogleCalendarConfigured;
const sanitizeReturnTo = (returnTo) => {
    if (!returnTo || !returnTo.startsWith('/')) {
        return '/integrations';
    }
    if (returnTo.startsWith('//')) {
        return '/integrations';
    }
    return returnTo;
};
exports.sanitizeReturnTo = sanitizeReturnTo;
const createGoogleOAuthClient = () => {
    ensureGoogleCalendarEnv();
    return new googleapis_1.google.auth.OAuth2(env_1.env.googleClientId, env_1.env.googleClientSecret, env_1.env.googleRedirectUri);
};
exports.createGoogleOAuthClient = createGoogleOAuthClient;
const createGoogleCalendarAuthUrl = (payload) => {
    const client = (0, exports.createGoogleOAuthClient)();
    const state = jsonwebtoken_1.default.sign({
        userId: payload.userId,
        returnTo: (0, exports.sanitizeReturnTo)(payload.returnTo),
        provider: 'google-calendar',
    }, env_1.env.jwtSecret, { expiresIn: '10m' });
    return client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: true,
        scope: GOOGLE_CALENDAR_SCOPES,
        state,
    });
};
exports.createGoogleCalendarAuthUrl = createGoogleCalendarAuthUrl;
const parseGoogleCalendarState = (state) => {
    const payload = jsonwebtoken_1.default.verify(state, env_1.env.jwtSecret);
    if (payload.provider !== 'google-calendar' || !payload.userId) {
        throw new Error('Invalid Google Calendar OAuth state');
    }
    return {
        userId: payload.userId,
        returnTo: (0, exports.sanitizeReturnTo)(payload.returnTo),
    };
};
exports.parseGoogleCalendarState = parseGoogleCalendarState;
const exchangeGoogleCode = (code) => __awaiter(void 0, void 0, void 0, function* () {
    const client = (0, exports.createGoogleOAuthClient)();
    const { tokens } = yield client.getToken(code);
    client.setCredentials(tokens);
    return {
        client,
        tokens,
    };
});
exports.exchangeGoogleCode = exchangeGoogleCode;
const getGoogleUserEmail = (client) => __awaiter(void 0, void 0, void 0, function* () {
    const oauth2 = googleapis_1.google.oauth2({ version: 'v2', auth: client });
    const response = yield oauth2.userinfo.get();
    return response.data.email || null;
});
exports.getGoogleUserEmail = getGoogleUserEmail;
const createAuthorizedGoogleClient = (encryptedRefreshToken) => {
    const client = (0, exports.createGoogleOAuthClient)();
    const refreshToken = (0, crypto_1.decryptConfig)(encryptedRefreshToken);
    client.setCredentials({ refresh_token: refreshToken });
    return client;
};
exports.createAuthorizedGoogleClient = createAuthorizedGoogleClient;
const revokeGoogleRefreshToken = (encryptedRefreshToken) => __awaiter(void 0, void 0, void 0, function* () {
    const refreshToken = (0, crypto_1.decryptConfig)(encryptedRefreshToken);
    const client = (0, exports.createGoogleOAuthClient)();
    yield client.revokeToken(refreshToken);
});
exports.revokeGoogleRefreshToken = revokeGoogleRefreshToken;
