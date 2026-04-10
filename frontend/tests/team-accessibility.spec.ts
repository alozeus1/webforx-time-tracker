import { expect, test } from '@playwright/test';
import { loginWithMockedBackend } from './utils/mock-backend';

test.describe('Team Dialog Accessibility', () => {
    test.beforeEach(async ({ page }) => {
        await loginWithMockedBackend(page, {
            email: 'admin@webforxtech.com',
            password: 'webforxtechng@',
            role: 'Admin',
            dismissTour: true,
        });
        await page.goto('/team');
        await expect(page).toHaveURL(/.*team/);
    });

    test('Add member modal exposes dialog semantics, labels, and focus lifecycle', async ({ page }) => {
        const trigger = page.getByRole('button', { name: 'Add Team Member' });
        await trigger.focus();
        await trigger.click();

        const dialog = page.getByRole('dialog', { name: 'Add Team Member' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('aria-modal', 'true');

        await expect
            .poll(async () => page.evaluate(() => {
                const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
                return Boolean(modal && modal.contains(document.activeElement));
            }))
            .toBe(true);

        const firstNameInput = page.getByLabel('First Name');
        const lastNameInput = page.getByLabel('Last Name');
        const emailInput = page.getByLabel('Email');
        const passwordInput = page.getByLabel('Temporary Password');
        const roleSelect = page.getByLabel('Role', { exact: true });

        await expect(firstNameInput).toBeVisible();
        await expect(lastNameInput).toBeVisible();
        await expect(emailInput).toBeVisible();
        await expect(passwordInput).toBeVisible();
        await expect(roleSelect).toBeVisible();

        await page.getByText('First Name', { exact: true }).click();
        await expect(firstNameInput).toBeFocused();
        await page.getByText('Last Name', { exact: true }).click();
        await expect(lastNameInput).toBeFocused();
        await dialog.getByText('Role', { exact: true }).click();
        await expect(roleSelect).toBeFocused();

        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await expect
            .poll(async () => page.evaluate(() => {
                const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
                return Boolean(modal && modal.contains(document.activeElement));
            }))
            .toBe(true);

        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        await expect(trigger).toBeFocused();
    });

    test('Bulk import modal has dialog semantics and restores trigger focus on close', async ({ page }) => {
        const trigger = page.getByRole('button', { name: 'Import CSV' });
        await trigger.focus();
        await trigger.click();

        const dialog = page.getByRole('dialog', { name: 'Bulk Import Team Members' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        await expect(page.getByText('Supported columns')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        await expect(trigger).toBeFocused();
    });
});
