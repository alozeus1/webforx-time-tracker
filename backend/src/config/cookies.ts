import { CookieOptions } from 'express';
import { env } from './env';

const isProduction = env.nodeEnv === 'production';

export const accessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: 15 * 60 * 1000, // 15 minutes
  path: '/',
};

export const refreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/v1/auth/refresh',
};

export const csrfCookieOptions: CookieOptions = {
  // The SPA receives the signed token in JSON and mirrors it in X-CSRF-Token.
  // Keeping the cookie HttpOnly prevents script from treating the cookie itself
  // as the submitted token, which would defeat double-submit protection.
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

export const csrfSessionCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};
