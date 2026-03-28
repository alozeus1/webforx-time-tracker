import { expect, test } from '@playwright/test';
import { loginWithMockedBackend } from './utils/mock-backend';

test.describe('Invoice Autopilot', () => {
    test.beforeEach(async ({ page }) => {
        await loginWithMockedBackend(page, {
            email: 'manager@webforxtech.com',
            password: 'webforxtechng@',
            role: 'Manager',
            dismissTour: true,
        });
    });

    test('creates a billing autopilot draft and generates invoice evidence links without breaking manual invoice tools', async ({ page }) => {
        await page.goto('/invoices');
        await expect(page).toHaveURL(/.*invoices/);

        await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Create a draft from approved billable time' })).toBeVisible();

        await page.getByLabel('Client Name Override').fill('Apex Logistics');
        await page.getByLabel('Scope to Project').selectOption('proj-1');
        await page.getByRole('button', { name: 'Run billing autopilot' }).click();

        await expect(page.getByText('Billing autopilot created 1 line items from approved billable work.')).toBeVisible();
        await expect(page.getByText('Apex Logistics').first()).toBeVisible();

        await page.getByRole('button', { name: 'New Invoice' }).click();
        await page.getByLabel('Client Name', { exact: true }).fill('Northwind Advisory');
        await page.getByLabel('Project', { exact: true }).selectOption('proj-2');
        await page.getByLabel('Line item description').fill('Strategy workshop');
        await page.getByLabel('Line item hours').fill('4');
        await page.getByLabel('Line item rate').fill('175');
        await page.getByRole('button', { name: 'Create', exact: true }).click();

        await expect(page.getByText('Invoice created')).toBeVisible();
        await expect(page.getByText('Northwind Advisory').first()).toBeVisible();

        await page.getByTitle('Create invoice evidence link').first().click();
        await expect(page.getByText('Invoice evidence share link generated')).toBeVisible();
        await expect(page.getByText(/http:\/\/127\.0\.0\.1:4173\/share\/mock-share-token/)).toBeVisible();
    });
});
