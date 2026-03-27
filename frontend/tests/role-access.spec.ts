import { test, expect } from '@playwright/test';

// Note: These tokens are fake JWTs for testing purposes only — they are not
// signed with any real secret and will fail real verification. The app's
// route guards read role from localStorage, so we inject that directly.

const injectSession = async (
    page: import('@playwright/test').Page,
    role: string,
    token = 'fake-jwt-token',
) => {
    await page.evaluate(({ tok, r }) => {
        localStorage.setItem('token', tok);
        localStorage.setItem('user_role', r);
        localStorage.setItem('user_profile', JSON.stringify({
            id: 'user-1',
            email: 't@t.com',
            first_name: 'Test',
            last_name: 'User',
            role: r,
        }));
    }, { tok: token, r: role });
};

const mockAuthenticatedAPIs = async (page: import('@playwright/test').Page, role = 'Employee') => {
    // Smart catch-all — glob patterns do NOT intercept cross-origin requests reliably
    await page.route('http://localhost:5005/**', (route) => {
        const url = route.request().url();
        if (url.includes('/api/v1/users/me')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
                { id: 'user-1', email: 't@t.com', first_name: 'Test', last_name: 'User', role }
            ) });
        } else if (url.includes('/api/v1/timers/me')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [], activeTimer: null }) });
        } else if (url.includes('/api/v1/projects')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        } else if (url.includes('/api/v1/users')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        } else if (url.includes('/api/v1/tags') || url.includes('/notifications')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        } else {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
        }
    });
};

// ─── Role-Based Access Control ───────────────────────────────────────────────

test.describe('Role-Based Access Control', () => {

    // ─── Unauthenticated guards ──────────────────────────────────────────────

    test('unauthenticated user gets redirected from /dashboard', async ({ page }) => {
        // Ensure no session exists
        await page.goto('/login');
        await page.evaluate(() => {
            localStorage.clear();
        });
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/.*login/, { timeout: 10000 });
    });

    test('unauthenticated user gets redirected from /timer', async ({ page }) => {
        await page.goto('/login');
        await page.evaluate(() => localStorage.clear());
        await page.goto('/timer');
        await expect(page).toHaveURL(/.*login/, { timeout: 10000 });
    });

    test('unauthenticated user gets redirected from /reports', async ({ page }) => {
        await page.goto('/login');
        await page.evaluate(() => localStorage.clear());
        await page.goto('/reports');
        await expect(page).toHaveURL(/.*login/, { timeout: 10000 });
    });

    // ─── Employee restrictions ───────────────────────────────────────────────

    test('employee cannot access /admin page — gets redirected', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page, 'Employee');
        await mockAuthenticatedAPIs(page, 'Employee');

        await page.goto('/admin');
        await page.waitForTimeout(2000);

        // Should be redirected away from /admin
        await expect(page).not.toHaveURL(/.*\/admin$/, { timeout: 10000 });
    });

    test('employee cannot access /team page — gets redirected', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page, 'Employee');
        await mockAuthenticatedAPIs(page, 'Employee');

        await page.goto('/team');
        await page.waitForTimeout(2000);

        // Should be redirected away from /team
        await expect(page).not.toHaveURL(/.*\/team$/, { timeout: 10000 });
    });

    // ─── Manager access ──────────────────────────────────────────────────────

    test('manager can access /team page', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page, 'Manager');
        await mockAuthenticatedAPIs(page, 'Manager');

        await page.goto('/team');
        await page.waitForTimeout(2000);
        await expect(page).toHaveURL(/.*team/, { timeout: 10000 });
    });

    // ─── Admin access ────────────────────────────────────────────────────────

    test('admin can access /admin page', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page, 'Admin');
        await mockAuthenticatedAPIs(page, 'Admin');

        await page.goto('/admin');
        await page.waitForTimeout(2000);
        await expect(page).toHaveURL(/.*admin/, { timeout: 10000 });
    });

    test('admin can access /team page', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page, 'Admin');
        await mockAuthenticatedAPIs(page, 'Admin');

        await page.goto('/team');
        await page.waitForTimeout(2000);
        await expect(page).toHaveURL(/.*team/, { timeout: 10000 });
    });

    // ─── Employee can access own pages ───────────────────────────────────────

    test('employee can access /dashboard after injection', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page, 'Employee');
        await mockAuthenticatedAPIs(page, 'Employee');

        await page.goto('/dashboard');
        await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
    });

    test('employee can access /timer page', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page, 'Employee');
        await mockAuthenticatedAPIs(page, 'Employee');

        await page.goto('/timer');
        await expect(page).toHaveURL(/.*timer/, { timeout: 10000 });
    });

    test('employee can access /reports page', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page, 'Employee');
        await mockAuthenticatedAPIs(page, 'Employee');

        await page.goto('/reports');
        await expect(page).toHaveURL(/.*reports/, { timeout: 10000 });
    });
});
