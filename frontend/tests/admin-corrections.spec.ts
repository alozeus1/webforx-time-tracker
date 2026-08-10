import { test, expect } from '@playwright/test';

const MOCK_ADMIN_USER = {
    id: 'user-admin-1',
    email: 'admin@webforxtech.com',
    first_name: 'Admin',
    last_name: 'User',
    role: 'Admin',
    organization_id: 'org-1',
};

const setAdminSession = async (page: import('@playwright/test').Page) => {
    await page.goto('/login');
    await page.evaluate((user) => {
        window.localStorage.setItem('token', 'mock-admin-token');
        window.localStorage.setItem('user_role', user.role);
        window.localStorage.setItem('user_profile', JSON.stringify(user));
        window.localStorage.setItem('organization_id', user.organization_id || '');
        window.localStorage.setItem('onboarding_completed', 'true');
    }, MOCK_ADMIN_USER);
};

const mockAdminAPIs = async (page: import('@playwright/test').Page) => {
    await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.includes('/api/v1/timers/corrections/review')) {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ corrections: [] }),
            });
        } else if (url.includes('/api/v1/timers/corrections/purge-resolved')) {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ deleted: 0 }),
            });
        } else if (url.includes('/api/v1/admin/audit-logs')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ logs: [] }) });
        } else if (url.includes('/api/v1/admin/notifications')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
        } else if (url.includes('/api/v1/admin/timer-policy')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ policy: {} }) });
        } else if (url.includes('/api/v1/admin/teams')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ teams: [] }) });
        } else if (url.includes('/api/v1/projects')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        } else if (url.includes('/api/v1/users')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        } else if (url.includes('/api/v1/integrations')) {
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ integrations: [] }) });
        } else {
            route.continue();
        }
    });
};

test.describe('Admin corrections tab', () => {
    test('defaults to pending corrections', async ({ page }) => {
        await mockAdminAPIs(page);
        await setAdminSession(page);
        await page.goto('/admin?tab=corrections');

        const pendingButton = page.getByRole('button', { name: /pending/i });
        await expect(pendingButton).toHaveClass(/bg-primary/);
        await expect(page.getByText('No pending corrections')).toBeVisible();
    });

    test('can switch to resolved segment', async ({ page }) => {
        await mockAdminAPIs(page);
        await setAdminSession(page);
        await page.goto('/admin?tab=corrections');

        await page.getByRole('button', { name: /resolved/i }).click();
        await expect(page.getByText('No resolved corrections in the last 30 days')).toBeVisible();
    });

    test('can switch to all segment and use status filter', async ({ page }) => {
        await mockAdminAPIs(page);
        await setAdminSession(page);
        await page.goto('/admin?tab=corrections');

        await page.getByRole('button', { name: /all/i }).click();
        await page.selectOption('select', 'APPROVED');
        await expect(page.getByText('No correction requests found').or(page.getByText('No correction requests match the current search'))).toBeVisible();
    });
});
