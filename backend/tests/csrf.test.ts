import request from 'supertest';

process.env.VERCEL = '1';
process.env.ENABLE_BACKGROUND_WORKERS = 'false';

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),
    },
}));

import app from '../src/index';

const createCookieAuthenticatedSession = async () => {
    const response = await request(app)
        .get('/api/v1/auth/csrf-token')
        .expect(200);
    const setCookie = response.headers['set-cookie'];
    const cookies = (Array.isArray(setCookie) ? setCookie : [setCookie])
        .filter((cookie): cookie is string => typeof cookie === 'string')
        .map((cookie) => cookie.split(';', 1)[0]);

    return {
        csrfToken: response.body.csrfToken as string,
        cookieHeader: [...cookies, 'access_token=cookie-auth-token'].join('; '),
    };
};

describe('cookie-authenticated CSRF protection', () => {
    it('rejects a cookie-authenticated mutation without a submitted token', async () => {
        const session = await createCookieAuthenticatedSession();

        const response = await request(app)
            .post('/api/v1/auth/logout')
            .set('Cookie', session.cookieHeader)
            .send({});

        expect(response.status).toBe(403);
        expect(response.body.error?.code).toBe('CSRF_INVALID');
    });

    it('accepts a cookie-authenticated mutation with the signed double-submit token', async () => {
        const session = await createCookieAuthenticatedSession();

        await request(app)
            .post('/api/v1/auth/logout')
            .set('Cookie', session.cookieHeader)
            .set('X-CSRF-Token', session.csrfToken)
            .send({})
            .expect(200, { message: 'Logged out successfully' });
    });

    it('rejects a mismatched submitted token', async () => {
        const session = await createCookieAuthenticatedSession();

        await request(app)
            .post('/api/v1/auth/logout')
            .set('Cookie', session.cookieHeader)
            .set('X-CSRF-Token', 'attacker-controlled-token')
            .send({})
            .expect(403);
    });

    it('does not require CSRF for bearer-authenticated mutations', async () => {
        const session = await createCookieAuthenticatedSession();

        await request(app)
            .post('/api/v1/auth/logout')
            .set('Cookie', session.cookieHeader)
            .set('Authorization', 'Bearer header-auth-token')
            .send({})
            .expect(200, { message: 'Logged out successfully' });
    });

    it('does not require CSRF when no authentication cookie is present', async () => {
        await request(app)
            .post('/api/v1/auth/logout')
            .send({})
            .expect(200, { message: 'Logged out successfully' });
    });
});
