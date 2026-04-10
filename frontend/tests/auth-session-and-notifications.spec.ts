import { test, expect } from '@playwright/test';

const injectSession = async (page: import('@playwright/test').Page) => {
    await page.evaluate(() => {
        localStorage.setItem('token', 'mock-token');
        localStorage.setItem('refreshToken', 'mock-refresh');
        localStorage.setItem('user_role', 'Employee');
        localStorage.setItem('onboarding_completed', 'true');
        localStorage.setItem('user_profile', JSON.stringify({
            id: 'user-1',
            email: 'employee@webforxtech.com',
            first_name: 'Employee',
            last_name: 'User',
            role: 'Employee',
        }));
    });
};

test.describe('Session expiry and notifications', () => {
    test('redirects to login when an authenticated request returns token-expired', async ({ page }) => {
        await page.route('**/api/v1/**', async (route) => {
            const url = route.request().url();

            if (url.includes('/api/v1/users/me/notifications')) {
                return route.fulfill({
                    status: 401,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        message: 'Invalid or expired token',
                        error: { code: 'TOKEN_EXPIRED', message: 'Invalid or expired token' },
                    }),
                });
            }

            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
        });

        await page.goto('/login');
        await injectSession(page);
        await page.goto('/dashboard');

        await expect(page).toHaveURL(/\/login\?authMessage=/);
        await expect(page.getByText(/your session has expired/i)).toBeVisible();
    });

    test('marks notifications read and deletes them from the bell dropdown', async ({ page }) => {
        let notifications = [
            {
                id: 'notif-1',
                type: 'idle_warning',
                message: 'You appear inactive.',
                is_read: false,
                created_at: new Date('2026-04-09T10:00:00.000Z').toISOString(),
            },
            {
                id: 'notif-2',
                type: 'report',
                message: 'Weekly summary ready.',
                is_read: true,
                created_at: new Date('2026-04-09T09:00:00.000Z').toISOString(),
            },
        ];

        await page.route('**/api/v1/**', async (route) => {
            const url = route.request().url();
            const method = route.request().method();

            if (url.includes('/api/v1/users/me/notifications/notif-1') && method === 'GET') {
                notifications = notifications.map((notification) =>
                    notification.id === 'notif-1' ? { ...notification, is_read: true } : notification,
                );
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ notification: notifications[0] }),
                });
            }

            if (url.includes('/api/v1/users/me/notifications/notif-1') && method === 'DELETE') {
                notifications = notifications.filter((notification) => notification.id !== 'notif-1');
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: 'Notification deleted' }),
                });
            }

            if (url.includes('/api/v1/users/me/notifications')) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ notifications }),
                });
            }

            if (url.includes('/api/v1/timers/me')) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ entries: [], activeTimer: null }),
                });
            }

            if (url.includes('/api/v1/projects')) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([]),
                });
            }

            if (url.includes('/api/v1/reports/dashboard?range=7d')) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        metrics: {
                            trends: {
                                hours: '+0%',
                            },
                        },
                    }),
                });
            }

            if (url.includes('/api/v1/users/me/wellbeing')) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        sevenDayHours: 0,
                        averageDailyHours: 0,
                        burnoutThresholdHours: 50,
                        cautionThresholdHours: 45,
                        hoursUntilBurnout: 50,
                        weeklyHourLimit: 40,
                        status: 'balanced',
                        workloadAlerts: [],
                    }),
                });
            }

            if (url.includes('/api/v1/users/me')) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        id: 'user-1',
                        email: 'employee@webforxtech.com',
                        first_name: 'Employee',
                        last_name: 'User',
                        role: 'Employee',
                    }),
                });
            }

            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
        });

        await page.goto('/login');
        await injectSession(page);
        await page.goto('/dashboard');

        const bell = page.getByRole('button', { name: 'View notifications' });
        await expect(bell).toBeVisible();
        await bell.click();
        await expect(page.getByText('Unread')).toBeVisible();
        await page.getByRole('button', { name: /you appear inactive/i }).click();
        await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
        await page.getByRole('button', { name: 'Back' }).click();
        await page.getByRole('button', { name: 'Delete' }).first().click();
        await expect(page.getByText('Unread', { exact: true })).not.toBeVisible();
        await expect(page.getByText('Read', { exact: true })).toBeVisible();
    });
});
