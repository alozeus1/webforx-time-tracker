describe('cookie options', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        jest.resetModules();
    });

    it('uses SameSite=Lax for auth cookies in production', async () => {
        process.env.NODE_ENV = 'production';
        process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test';
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
        process.env.INTEGRATION_SECRET = process.env.INTEGRATION_SECRET || 'test-integration-secret';
        process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret';
        process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://timer.dev.webforxtech.com';
        process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'https://timer.dev.webforxtech.com';
        process.env.ENABLE_BACKGROUND_WORKERS = process.env.ENABLE_BACKGROUND_WORKERS || 'false';

        const { accessTokenCookieOptions, refreshTokenCookieOptions, csrfCookieOptions } = await import('../src/config/cookies');

        expect(accessTokenCookieOptions.sameSite).toBe('lax');
        expect(refreshTokenCookieOptions.sameSite).toBe('lax');
        expect(csrfCookieOptions.sameSite).toBe('lax');
    });
});
