import { test, expect } from '@playwright/test';

const EMPLOYEE_EMAIL = 'employee@webforxtech.com';
const EMPLOYEE_PASSWORD = 'password123';

test.describe('Employee Daily Time Tracking Simulation', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:5173/login');

        await page.fill('input[type="email"]', EMPLOYEE_EMAIL);
        await page.fill('input[type="password"]', EMPLOYEE_PASSWORD);
        await page.click('button:has-text("Sign In")');

        await expect(page).toHaveURL(/.*dashboard/);
    });

    test('Employee full day simulation: Clock In, Add Task, Clock Out', async ({ page }) => {
        test.setTimeout(60000);

        // Step 1: Navigating to active task entry (Timer page)
        await page.click('text=New Entry');
        await expect(page).toHaveURL(/.*timer/);

        // Step 2: Set up a new task/project and Clock In
        await page.fill('input[placeholder="What are you working on?"]', 'Simulated API Development Task');

        // Check if dropdown has loadable items, otherwise skip strict selecting (backend supports optional)
        const projectSelect = page.locator('select');
        if (await projectSelect.count() > 0) {
            const optionsCount = await projectSelect.locator('option').count();
            if (optionsCount > 1) {
                // Playwright handles dynamic react updates by explicitly picking the second index value
                await projectSelect.selectOption({ index: 1, timeout: 5000 }).catch(() => console.log('Option dropdown unselectable, continuing...'));
            }
        }

        const clockInButton = page.locator('button:has-text("play_arrow")').or(page.locator('button .material-symbols-outlined:has-text("play_arrow")')).first();
        await clockInButton.click();

        const stopButton = page.locator('button:has-text("stop")').or(page.locator('button .material-symbols-outlined:has-text("stop")')).first();
        await expect(stopButton).toBeVisible();

        await page.waitForTimeout(3000); // simulate work

        // Step 3: Clock Out
        await stopButton.click();
        await expect(clockInButton).toBeVisible();

        // Step 4: Verify the tasks list updated (Dashboard)
        await page.click('text=Dashboard');
        await expect(page).toHaveURL(/.*dashboard/);
        await expect(page.locator('text=Simulated API Development Task').first()).toBeVisible();

        // Step 5: Verify User Stats (Reports)
        await page.click('text=Reports');
        await expect(page).toHaveURL(/.*reports/);
        await expect(page.locator('text=Reports Dashboard').first()).toBeVisible();

        // Logout
        const logoutBtn = page.locator('text=Log out').or(page.locator('text=Logout')).first();
        if (await logoutBtn.isVisible()) {
            await logoutBtn.click();
            await expect(page).toHaveURL(/.*login/);
        }
    });

});
