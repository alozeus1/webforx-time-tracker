import { expect, test } from '@playwright/test';
import { loginWithMockedBackend } from './utils/mock-backend';

test.describe('Team Mobile Layout', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await loginWithMockedBackend(page, {
            email: 'admin@webforxtech.com',
            password: 'webforxtechng@',
            role: 'Admin',
            dismissTour: true,
        });
        await page.goto('/team');
        await expect(page).toHaveURL(/.*team/);
    });

    test('team directory uses mobile cards with key actions available', async ({ page }) => {
        const memberCard = page.locator('article').filter({ hasText: 'Admin User' }).first();

        await expect(memberCard).toBeVisible();
        await expect(memberCard.getByRole('button', { name: 'Edit' })).toBeVisible();
        await expect(memberCard.getByRole('button', { name: /Activate|Deactivate/ })).toBeVisible();
        await expect(memberCard.getByRole('button', { name: 'Remove' })).toBeVisible();
        await expect(page.locator('table')).toBeHidden();
    });
});
