import { expect, test } from '@playwright/test';
import { loginWithMockedBackend } from './utils/mock-backend';

test.describe('Workday Command Center', () => {
    test.beforeEach(async ({ page }) => {
        await loginWithMockedBackend(page, {
            email: 'manager@webforxtech.com',
            password: 'webforxtechng@',
            role: 'Manager',
            dismissTour: true,
        });
    });

    test('shows unified workday intelligence, supports suggestion conversion, and exposes shareable trust artifacts', async ({ page }) => {
        await page.goto('/workday');
        await expect(page).toHaveURL(/.*workday/);

        await expect(page.getByRole('heading', { name: 'Workday Command Center' })).toBeVisible();
        await expect(page.getByText('Team ops mode')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Work Memory Timeline' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Recovered Suggestions' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Flow & Recovery Signals' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Connected Work Signals' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Two-Week Load Outlook' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Prioritized Approval Review' })).toBeVisible();

        const convertButton = page.getByRole('button', { name: 'Convert to entry' }).first();
        await expect(convertButton).toBeVisible();
        await convertButton.click();
        await expect(page.getByText(/Converted .* into a manual time entry\./)).toBeVisible();

        await page.getByRole('button', { name: 'Share trust summary' }).click();
        await expect(page.getByText('Client-ready share link generated.')).toBeVisible();
        await expect(page.getByText(/http:\/\/127\.0\.0\.1:4173\/share\/mock-share-token/)).toBeVisible();

        await page.goto('/share/mock-share-token');
        await expect(page.getByRole('heading', { name: 'INV-20260328-1001 invoice evidence' })).toBeVisible();
        await expect(page.getByText('Approved line-item evidence for this invoice.')).toBeVisible();
    });
});
