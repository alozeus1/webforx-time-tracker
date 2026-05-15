import { expect, test } from '@playwright/test';

const employeeEmail = process.env.E2E_EMPLOYEE_EMAIL || 'employee@webforxtech.com';
const employeePassword = process.env.E2E_EMPLOYEE_PASSWORD || 'ChangeMe-Employee-Local';

test('employee can start and stop a real timer session', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('onboarding_completed', 'true');
  });

  page.on('dialog', async (dialog) => {
    throw new Error(`Unexpected browser dialog: ${dialog.message()}`);
  });

  await page.goto('/login');
  await page.getByLabel(/Work Email/i).fill(employeeEmail);
  await page.getByLabel(/Password/i).fill(employeePassword);
  await page.getByRole('button', { name: /Sign In/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  await page.goto('/timer');
  await expect(page).toHaveURL(/\/timer/);

  const stopButton = page.getByRole('button', { name: /Stop Timer/i });
  if (await stopButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.waitForTimeout(1_200);
    await stopButton.click();
    await expect(page.getByRole('button', { name: /Start Timer/i })).toBeVisible({ timeout: 10_000 });
  }

  await page.getByPlaceholder(/What are you working on/i).fill(`Playwright timer regression ${Date.now()}`);
  await page.locator('select').first().selectOption({ label: 'Web Forx Technology' });
  await page.getByRole('button', { name: /Start Timer/i }).click();

  await expect(page.getByText(/Timer is running/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Stop Timer/i })).toBeVisible();

  await page.waitForTimeout(1_200);
  await page.getByRole('button', { name: /Stop Timer/i }).click();
  await expect(page.getByText(/Timer is stopped/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Start Timer/i })).toBeVisible();
});
