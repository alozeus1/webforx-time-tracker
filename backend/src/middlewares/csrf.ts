import crypto from 'crypto';
import { ErrorRequestHandler, Request, Response } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import { csrfCookieOptions, csrfSessionCookieOptions } from '../config/cookies';
import { env } from '../config/env';

const isProduction = env.nodeEnv === 'production';

export const csrfTokenCookieName = isProduction
    ? '__Host-wfx.x-csrf-token'
    : 'wfx.x-csrf-token';

export const csrfSessionCookieName = isProduction
    ? '__Host-wfx.csrf-session'
    : 'wfx.csrf-session';

const csrfSecret = crypto
    .createHmac('sha256', env.jwtSecret)
    .update('webforx-time-tracker:csrf:v1')
    .digest('hex');

const publicCookieIndependentPaths = new Set([
    '/api/v1/auth/login',
    '/api/v1/auth/google',
    '/api/v1/auth/mfa/validate',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/reset-password',
    '/api/v1/timers/pause-beacon',
]);

const hasBearerAuthorization = (req: Request) => {
    const authorization = req.get('authorization');
    return typeof authorization === 'string' && /^Bearer\s+\S+$/i.test(authorization);
};

const hasAuthenticationCookie = (req: Request) => (
    typeof req.cookies?.access_token === 'string'
    || typeof req.cookies?.refresh_token === 'string'
);

const {
    generateCsrfToken,
    doubleCsrfProtection,
} = doubleCsrf({
    getSecret: () => csrfSecret,
    getSessionIdentifier: (req) => {
        const identifier = req.cookies?.[csrfSessionCookieName];
        return typeof identifier === 'string' ? identifier : '';
    },
    cookieName: csrfTokenCookieName,
    cookieOptions: csrfCookieOptions,
    getCsrfTokenFromRequest: (req) => {
        const token = req.headers['x-csrf-token'];
        return typeof token === 'string' ? token : undefined;
    },
    errorConfig: {
        statusCode: 403,
        message: 'Invalid or missing CSRF token',
        code: 'EBADCSRFTOKEN',
    },
    // Bearer-authenticated and explicitly non-cookie-authenticated requests are
    // not vulnerable to browser CSRF. Cookie-authenticated mutations must pass
    // the signed double-submit check.
    skipCsrfProtection: (req) => (
        hasBearerAuthorization(req)
        || !hasAuthenticationCookie(req)
        || publicCookieIndependentPaths.has(req.path)
    ),
});

export const csrfProtection = doubleCsrfProtection;

const setSessionIdentifier = (req: Request, res: Response, identifier: string) => {
    res.cookie(csrfSessionCookieName, identifier, csrfSessionCookieOptions);
    req.cookies = req.cookies || {};
    req.cookies[csrfSessionCookieName] = identifier;
};

export const issueCsrfToken = (
    req: Request,
    res: Response,
    options: { rotateSession?: boolean } = {},
) => {
    let sessionIdentifier = req.cookies?.[csrfSessionCookieName];
    const shouldRotate = options.rotateSession === true || typeof sessionIdentifier !== 'string';

    if (shouldRotate) {
        sessionIdentifier = crypto.randomBytes(32).toString('hex');
        setSessionIdentifier(req, res, sessionIdentifier);
    }

    return generateCsrfToken(req, res, { overwrite: shouldRotate });
};

export const clearCsrfCookies = (res: Response) => {
    const { maxAge: _tokenMaxAge, ...tokenClearOptions } = csrfCookieOptions;
    const { maxAge: _sessionMaxAge, ...sessionClearOptions } = csrfSessionCookieOptions;
    res.clearCookie(csrfTokenCookieName, tokenClearOptions);
    res.clearCookie(csrfSessionCookieName, sessionClearOptions);
};

export const csrfErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if ((error as { code?: string }).code !== 'EBADCSRFTOKEN') {
        next(error);
        return;
    }

    res.status(403).json({
        message: 'Invalid or missing CSRF token',
        error: {
            code: 'CSRF_INVALID',
            message: 'Refresh the session and retry the request.',
        },
    });
};
