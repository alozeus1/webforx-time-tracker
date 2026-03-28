import { expect, test } from '@playwright/test';
import { loginWithMockedBackend } from './utils/mock-backend';

test.describe('Disclosure Keyboard Interactions', () => {
    test.beforeEach(async ({ page }) => {
        await loginWithMockedBackend(page, {
            email: 'admin@webforxtech.com',
            password: 'webforxtechng@',
            role: 'Admin',
            dismissTour: true,
        });
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/.*dashboard/);
    });

    test('notification trigger supports Enter/Space open with Escape close and aria state updates', async ({ page }) => {
        const trigger = page.getByRole('button', { name: 'View notifications' });

        await expect(trigger).toHaveAttribute('aria-controls', 'top-notifications-panel');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');

        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#top-notifications-panel')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#top-notifications-panel')).not.toBeVisible();
        await expect(trigger).toBeFocused();

        await page.keyboard.press('Space');
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#top-notifications-panel')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    test('dashboard alerts disclosure supports keyboard open-close and state updates', async ({ page }) => {
        const trigger = page.getByRole('button', { name: 'View alerts' });

        await expect(trigger).toHaveAttribute('aria-controls', 'dashboard-notifications-panel');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');

        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#dashboard-notifications-panel')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#dashboard-notifications-panel')).not.toBeVisible();
        await expect(trigger).toBeFocused();

        await page.keyboard.press('Space');
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#dashboard-notifications-panel')).toBeVisible();
    });
});
