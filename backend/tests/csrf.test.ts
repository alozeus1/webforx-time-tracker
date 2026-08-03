import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import {
    csrfErrorHandler,
    csrfProtection,
    issueCsrfToken,
} from '../src/middlewares/csrf';

const createTestApp = () => {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use(csrfProtection);

    app.get('/session', (req, res) => {
        res.cookie('access_token', 'cookie-auth-token', { httpOnly: true, path: '/' });
        res.status(200).json({
            csrfToken: issueCsrfToken(req, res, { rotateSession: true }),
        });
    });
    app.post('/protected', (_req, res) => res.status(200).json({ ok: true }));
    app.post('/public', (_req, res) => res.status(200).json({ ok: true }));
    app.use(csrfErrorHandler);
    return app;
};

describe('cookie-authenticated CSRF protection', () => {
    it('rejects a cookie-authenticated mutation without a submitted token', async () => {
        const agent = request.agent(createTestApp());
        await agent.get('/session').expect(200);

        const response = await agent.post('/protected').send({});

        expect(response.status).toBe(403);
        expect(response.body.error?.code).toBe('CSRF_INVALID');
    });

    it('accepts a cookie-authenticated mutation with the signed double-submit token', async () => {
        const agent = request.agent(createTestApp());
        const session = await agent.get('/session').expect(200);

        await agent
            .post('/protected')
            .set('X-CSRF-Token', session.body.csrfToken)
            .send({})
            .expect(200, { ok: true });
    });

    it('rejects a mismatched submitted token', async () => {
        const agent = request.agent(createTestApp());
        await agent.get('/session').expect(200);

        await agent
            .post('/protected')
            .set('X-CSRF-Token', 'attacker-controlled-token')
            .send({})
            .expect(403);
    });

    it('does not require CSRF for valid bearer-authenticated mutations', async () => {
        const agent = request.agent(createTestApp());
        await agent.get('/session').expect(200);

        await agent
            .post('/protected')
            .set('Authorization', 'Bearer header-auth-token')
            .send({})
            .expect(200, { ok: true });
    });

    it('does not require CSRF when no authentication cookie is present', async () => {
        await request(createTestApp())
            .post('/public')
            .send({})
            .expect(200, { ok: true });
    });
});
