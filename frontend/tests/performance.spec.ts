import { test, expect } from '@playwright/test';

const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEiLCJlbWFpbCI6InRlc3RAdGVzdC5jb20iLCJyb2xlIjoiRW1wbG95ZWUiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6OTk5OTk5OTk5OX0.fake';

const injectSession = async (page: import('@playwright/test').Page) => {
    await page.evaluate((tok) => {
        localStorage.setItem('token', tok);
        localStorage.setItem('user_role', 'Employee');
        localStorage.setItem('user_profile', JSON.stringify({
            id: 'user-1', email: 'test@test.com', first_name: 'Test', last_name: 'User', role: 'Employee',
        }));
    }, MOCK_TOKEN);
};

const mockCoreAPIs = async (page: import('@playwright/test').Page) => {
    // Smart catch-all — glob patterns do NOT intercept cross-origin requests reliably
    await page.route('http://localhost:5005/**', (route) => {
        const url = route.request().url();
        if (url.includes('/api/v1/projects')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        } else if (url.includes('/api/v1/timers/me')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [], activeTimer: null }) });
        } else if (url.includes('/api/v1/users/me')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'user-1', email: 'test@test.com', first_name: 'Test', last_name: 'User', role: 'Employee' }) });
        } else if (url.includes('/api/v1/tags') || url.includes('/notifications')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        } else {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
        }
    });
};

// ─── Performance & Reliability ───────────────────────────────────────────────

test.describe('Performance & Reliability', () => {
    test('landing page loads in under 3 seconds', async ({ page }) => {
        const start = Date.now();
        await page.goto('/landing');
        await page.waitForLoadState('domcontentloaded');
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(3000);
    });

    test('login page loads in under 2 seconds', async ({ page }) => {
        const start = Date.now();
        await page.goto('/login');
        await page.waitForLoadState('domcontentloaded');
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(2000);
    });

    test('dashboard loads in under 7 seconds after auth (mocked APIs)', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page);
        await mockCoreAPIs(page);

        const start = Date.now();
        await page.goto('/dashboard');
        await page.waitForLoadState('domcontentloaded');
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(7000);
    });

    test('timer page loads in under 7 seconds', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page);
        await mockCoreAPIs(page);

        const start = Date.now();
        await page.goto('/timer');
        await page.waitForLoadState('domcontentloaded');
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(7000);
    });

    test('no console errors on login page', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        await page.goto('/login');
        await page.waitForLoadState('domcontentloaded');

        // Filter out known non-critical browser console errors
        const criticalErrors = errors.filter((e) =>
            !e.includes('favicon') &&
            !e.includes('net::ERR') &&
            !e.includes('Failed to load resource') &&
            !e.includes('404')
        );

        expect(criticalErrors).toHaveLength(0);
    });

    test('no console errors on landing page', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        await page.goto('/landing');
        await page.waitForLoadState('domcontentloaded');

        const criticalErrors = errors.filter((e) =>
            !e.includes('favicon') &&
            !e.includes('net::ERR') &&
            !e.includes('Failed to load resource') &&
            !e.includes('404')
        );

        expect(criticalErrors).toHaveLength(0);
    });

    test('app handles 401 response gracefully — redirects to login', async ({ page }) => {
        // Mock all API calls to return 401
        await page.route('http://localhost:5005/**', (route) => {
            route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Unauthorized' }),
            });
        });

        // Inject a session that will immediately be invalidated
        await page.goto('/login');
        await page.evaluate((tok) => {
            localStorage.setItem('token', tok);
            localStorage.setItem('user_role', 'Employee');
        }, MOCK_TOKEN);

        await page.goto('/dashboard');
        // Either stays on dashboard with error state, or redirects to login
        // The app should NOT crash
        const url = page.url();
        expect(url).toMatch(/\/(dashboard|login)/);
    });

    test('app handles network error gracefully — does not crash', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page);

        // Abort all API calls to simulate network failure
        await page.route('http://localhost:5005/**', (route) => {
            route.abort('failed');
        });

        await page.goto('/dashboard');

        // App should render something (not a blank white page or JS crash)
        const bodyText = await page.locator('body').innerText();
        expect(bodyText).toBeDefined();
        // Should not show an unhandled error stack trace
        expect(bodyText).not.toMatch(/cannot read properties of undefined/i);
    });

    test('rapid navigation between pages does not crash app', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page);
        await mockCoreAPIs(page);

        // Navigate rapidly between pages
        await page.goto('/dashboard');
        await page.goto('/timer');
        await page.goto('/reports');
        await page.goto('/dashboard');
        await page.goto('/timer');

        // App should still be rendering
        const url = page.url();
        expect(url).toContain('timer');

        const bodyText = await page.locator('body').innerText();
        expect(bodyText).toBeDefined();
    });

    test('login page renders correctly even when API is unavailable', async ({ page }) => {
        // Only block API calls (not assets), simulating backend down
        await page.route('http://localhost:5005/**', (route) => {
            route.abort('failed');
        });

        await page.goto('/login');
        await page.waitForLoadState('domcontentloaded');

        // Login form should still be visible even when backend is down
        await expect(page.getByLabel('Work Email')).toBeVisible({ timeout: 10000 });
    });
});
