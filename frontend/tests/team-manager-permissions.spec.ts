import { expect, test } from '@playwright/test';
import { loginWithMockedBackend } from './utils/mock-backend';

test.describe('Team Manager Permissions', () => {
    test.beforeEach(async ({ page }) => {
        await loginWithMockedBackend(page, {
            email: 'manager@webforxtech.com',
            password: 'webforxtechng@',
            role: 'Manager',
            dismissTour: true,
        });

        await page.goto('/team');
        await expect(page).toHaveURL(/.*team/);
    });

    test('manager can add, edit, and remove team members without losing focus while typing', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Add Team Member' })).toBeVisible();
        await expect(page.locator('div').filter({ hasText: /^Active Members2$/ }).first()).toBeVisible();
        await expect(page.locator('div').filter({ hasText: /^Deactivated Accounts0$/ }).first()).toBeVisible();

        await page.getByRole('button', { name: 'Add Team Member' }).click();

        const dialog = page.getByRole('dialog', { name: 'Add Team Member' });
        await expect(dialog).toBeVisible();

        const firstNameInput = page.getByLabel('First Name');
        const lastNameInput = page.getByLabel('Last Name');
        const emailInput = page.getByLabel('Email');
        const passwordInput = page.getByLabel('Temporary Password');
        const roleSelect = page.getByLabel('Role', { exact: true });

        await firstNameInput.click();
        for (const character of 'Miles') {
            await page.keyboard.type(character);
            await expect(firstNameInput).toBeFocused();
        }
        await expect(firstNameInput).toHaveValue('Miles');

        await lastNameInput.click();
        for (const character of 'Carter') {
            await page.keyboard.type(character);
            await expect(lastNameInput).toBeFocused();
        }
        await expect(lastNameInput).toHaveValue('Carter');

        await emailInput.fill('miles.carter@webforxtech.com');

        await passwordInput.click();
        for (const character of 'TempPass123!') {
            await page.keyboard.type(character);
            await expect(passwordInput).toBeFocused();
        }
        await expect(passwordInput).toHaveValue('TempPass123!');

        await roleSelect.selectOption('Employee');
        await dialog.getByRole('button', { name: 'Add Member' }).click();

        await expect(page.getByText('Team member added successfully').first()).toBeVisible();

        const createdMemberActions = page.getByRole('button', { name: /Actions for Miles Carter/ });
        await expect(createdMemberActions).toBeVisible();

        await createdMemberActions.click();
        await page.getByRole('button', { name: 'Edit Member' }).click();

        const editDialog = page.getByRole('dialog', { name: 'Edit Team Member' });
        await expect(editDialog).toBeVisible();

        const editFirstName = page.getByLabel('First Name');
        await editFirstName.fill('Mila');
        await page.getByLabel('Role', { exact: true }).selectOption('Manager');
        await editDialog.getByRole('button', { name: 'Save Changes' }).click();

        await expect(page.getByText('Team member updated successfully').first()).toBeVisible();

        const updatedMemberRow = page.locator('table tbody tr').filter({ hasText: 'Mila Carter' }).first();
        await expect(updatedMemberRow).toBeVisible();
        await expect(updatedMemberRow).toContainText('Manager');

        page.once('dialog', (dialogEvent) => dialogEvent.accept());
        await page.getByRole('button', { name: /Actions for Mila Carter/ }).click();
        await page.getByRole('button', { name: 'Deactivate' }).click();

        await expect(page.getByText('Mila Carter has been deactivated').first()).toBeVisible();
        await expect(page.locator('table tbody tr').filter({ hasText: 'Mila Carter' })).toHaveCount(0);
        await expect(page.locator('div').filter({ hasText: /^Active Members2$/ }).first()).toBeVisible();
        await expect(page.locator('div').filter({ hasText: /^Deactivated Accounts1$/ }).first()).toBeVisible();

        await page.locator('select').first().selectOption('inactive');
        const inactiveMemberRow = page.locator('table tbody tr').filter({ hasText: 'Mila Carter' }).first();
        await expect(inactiveMemberRow).toBeVisible();
        await expect(inactiveMemberRow).toContainText('Inactive');
    });
});
