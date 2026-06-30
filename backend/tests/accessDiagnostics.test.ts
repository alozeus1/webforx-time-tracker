/**
 * Tests: Access Diagnostics — organization_id fix
 *
 * Regression suite for two bugs:
 *
 * Bug 1 (Backend): logAuthEvent() never wrote organization_id, so every
 *   AuthEvent row had organization_id = null. getUserAuthEvents() queries
 *   WHERE organization_id = <org-uuid>, which never matched null rows.
 *   Result: stats always showed 0 and the event list was always empty.
 *
 * Fix: AuthEventInput now accepts organizationId. authController passes
 *   user.organization_id at every call site where the user has been resolved.
 *
 * Bug 2 (Frontend — tested in Playwright): authSummary applied a 7-day
 *   date gate to failedLogins but the raw event list had no gate, so an
 *   event from 67 days ago appeared in the list but wasn't counted.
 *
 *   Fix: authSummary.recentEvents filters events to the last 30 days and
 *   the list now renders recentEvents instead of the unfiltered array.
 */

import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import authRoutes from '../src/routes/authRoutes';

// ------------------------------------------------------------------
// Mocks
// ------------------------------------------------------------------

jest.mock('bcryptjs', () => {
    const mocked = { compare: jest.fn(), genSalt: jest.fn(), hash: jest.fn() };
    return { __esModule: true, default: mocked, ...mocked };
});

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        user: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        passwordResetToken: {
            findUnique: jest.fn(),
            updateMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        authEvent: {
            create: jest.fn(),
        },
    },
}));

jest.mock('../src/services/emailService', () => ({
    __esModule: true,
    sendPasswordResetEmail: jest.fn().mockResolvedValue({ id: 'email-ok' }),
}));

import prisma from '../src/config/db';

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

// ------------------------------------------------------------------
// Shared test fixtures
// ------------------------------------------------------------------

const ORG_ID = 'org-webforx-001';

const ACTIVE_USER = {
    id: 'user-abc',
    email: 'agada@webforxtech.com',
    first_name: 'Agada',
    last_name: 'Ikoyi',
    password_hash: 'hashed',
    is_active: true,
    organization_id: ORG_ID,
    role: { name: 'Manager' },
};

const DISABLED_USER = { ...ACTIVE_USER, id: 'user-disabled', is_active: false };

// ------------------------------------------------------------------

describe('Access Diagnostics — organization_id written to AuthEvent (Bug 1 fix)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (prisma.authEvent.create as jest.Mock).mockResolvedValue({});
    });

    // ---------------------------------------------------------------
    // Login: success path
    // ---------------------------------------------------------------

    it('writes organization_id on successful login', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(ACTIVE_USER);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: ACTIVE_USER.email, password: 'correct' });

        expect(res.status).toBe(200);

        const successCall = (prisma.authEvent.create as jest.Mock).mock.calls.find(
            ([args]) => args.data.outcome === 'success',
        );
        expect(successCall).toBeDefined();
        expect(successCall![0].data.organization_id).toBe(ORG_ID);
        expect(successCall![0].data.event_type).toBe('login_attempt');
    });

    // ---------------------------------------------------------------
    // Login: invalid password
    // ---------------------------------------------------------------

    it('writes organization_id on login failure (invalid password)', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(ACTIVE_USER);
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);

        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: ACTIVE_USER.email, password: 'wrong' });

        expect(res.status).toBe(401);

        const failCall = (prisma.authEvent.create as jest.Mock).mock.calls.find(
            ([args]) => args.data.reason === 'invalid_password',
        );
        expect(failCall).toBeDefined();
        expect(failCall![0].data.organization_id).toBe(ORG_ID);
        expect(failCall![0].data.outcome).toBe('failure');
    });

    // ---------------------------------------------------------------
    // Login: account disabled
    // ---------------------------------------------------------------

    it('writes organization_id on login failure (account disabled)', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(DISABLED_USER);

        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: DISABLED_USER.email, password: 'any' });

        expect(res.status).toBe(401);

        const disabledCall = (prisma.authEvent.create as jest.Mock).mock.calls.find(
            ([args]) => args.data.reason === 'account_disabled',
        );
        expect(disabledCall).toBeDefined();
        expect(disabledCall![0].data.organization_id).toBe(ORG_ID);
    });

    // ---------------------------------------------------------------
    // Login: user not found — org_id must stay null (no user to source it from)
    // ---------------------------------------------------------------

    it('writes organization_id = null when user is not found (no org to scope to)', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'ghost@test.com', password: 'any' });

        expect(res.status).toBe(401);

        const notFoundCall = (prisma.authEvent.create as jest.Mock).mock.calls.find(
            ([args]) => args.data.reason === 'user_not_found',
        );
        expect(notFoundCall).toBeDefined();
        expect(notFoundCall![0].data.organization_id).toBeNull();
    });

    // ---------------------------------------------------------------
    // Forgot password: success — org_id written
    // ---------------------------------------------------------------

    it('writes organization_id on successful password reset request', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(ACTIVE_USER);
        (prisma.passwordResetToken.updateMany as jest.Mock).mockResolvedValue({});
        (prisma.passwordResetToken.create as jest.Mock).mockResolvedValue({});

        const res = await request(app)
            .post('/api/v1/auth/forgot-password')
            .send({ email: ACTIVE_USER.email });

        expect(res.status).toBe(200);

        const resetCall = (prisma.authEvent.create as jest.Mock).mock.calls.find(
            ([args]) => args.data.event_type === 'password_reset_request' && args.data.outcome === 'success',
        );
        expect(resetCall).toBeDefined();
        expect(resetCall![0].data.organization_id).toBe(ORG_ID);
    });

    // ---------------------------------------------------------------
    // Forgot password: user not found — org_id stays null
    // ---------------------------------------------------------------

    it('writes organization_id = null when reset requested for unknown email', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

        const res = await request(app)
            .post('/api/v1/auth/forgot-password')
            .send({ email: 'nobody@test.com' });

        expect(res.status).toBe(200); // intentionally vague response

        const resetCall = (prisma.authEvent.create as jest.Mock).mock.calls.find(
            ([args]) => args.data.event_type === 'password_reset_request',
        );
        expect(resetCall).toBeDefined();
        expect(resetCall![0].data.organization_id).toBeNull();
    });

    // ---------------------------------------------------------------
    // Sanity: events for different orgs don't leak across orgs
    // The read query filters by organization_id — this test confirms
    // the written value matches what the read path will filter on.
    // ---------------------------------------------------------------

    it('written organization_id matches what getUserAuthEvents queries by', async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(ACTIVE_USER);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        await request(app)
            .post('/api/v1/auth/login')
            .send({ email: ACTIVE_USER.email, password: 'correct' });

        const allCalls = (prisma.authEvent.create as jest.Mock).mock.calls;
        // Every event written during a resolved-user flow must carry the org_id
        const eventsWithUser = allCalls.filter(([args]) => args.data.user_id === ACTIVE_USER.id);
        eventsWithUser.forEach(([args]) => {
            expect(args.data.organization_id).toBe(ORG_ID);
        });
    });
});
