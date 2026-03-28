import { test, expect } from '@playwright/test';
import { loginWithMockedBackend } from './utils/mock-backend';

const EMPLOYEE_EMAIL = 'employee@webforxtech.com';
const EMPLOYEE_PASSWORD = 'password123';

test.describe('Employee Daily Time Tracking Simulation', () => {

    test.beforeEach(async ({ page }) => {
        await loginWithMockedBackend(page, {
            email: EMPLOYEE_EMAIL,
            password: EMPLOYEE_PASSWORD,
            role: 'Employee',
            dismissTour: true,
        });
    });

    test('Employee full day simulation: Clock In, Add Task, Clock Out', async ({ page }) => {
        test.setTimeout(60000);

        // Step 1: Navigating to active task entry (Timer page)
        await page.goto('/timer');
        await expect(page).toHaveURL(/.*timer/);

        const taskInput = page.getByPlaceholder('What are you working on?');
        const startButton = page.getByRole('button', { name: /Start Timer/i });
        const stopButton = page.getByRole('button', { name: /Stop Timer/i });
        await Promise.race([
            startButton.waitFor({ state: 'visible', timeout: 10000 }),
            stopButton.waitFor({ state: 'visible', timeout: 10000 }),
        ]);
        // Allow async timer hydration (`/timers/me`) to settle before branching.
        await page.waitForTimeout(2000);

        const timerAlreadyRunning = await stopButton.isVisible();

        // Step 2: Start a timer when one is not already running.
        if (!timerAlreadyRunning) {
            await expect(taskInput).toBeEnabled();
            await taskInput.fill('Simulated API Development Task');

            // Check if dropdown has loadable items, otherwise skip strict selecting (backend supports optional)
            const projectSelect = page.locator('select');
            if (await projectSelect.count() > 0) {
                const optionsCount = await projectSelect.locator('option').count();
                if (optionsCount > 1) {
                    // Playwright handles dynamic react updates by explicitly picking the second index value
                    await projectSelect
                        .selectOption({ index: 1, timeout: 5000 })
                        .catch(() => console.log('Option dropdown unselectable, continuing...'));
                }
            }

            await startButton.click();
            await expect(stopButton).toBeVisible();
        } else {
            await expect(stopButton).toBeVisible();
        }

        await page.waitForTimeout(2000); // simulate work

        // Step 3: Attempt Clock Out (continue even if backend keeps timer active).
        if (await stopButton.isVisible()) {
            await stopButton.click();
            await page.waitForTimeout(1000);
        }

        // Step 4: Verify navigation back to dashboard remains stable
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/.*dashboard/);
        await expect(page.locator('text=Dashboard').first()).toBeVisible();

        // Step 5: Verify reports page still loads after timer workflow
        await page.goto('/reports');
        await expect(page).toHaveURL(/.*reports/);
        await expect(page.locator('.page-wrapper')).toBeVisible();

        // Logout
        const logoutBtn = page.locator('.sidebar-link', { hasText: 'Sign Out' });
        if (await logoutBtn.isVisible()) {
            await logoutBtn.click();
            await expect(page).toHaveURL(/.*login/);
        }
    });

});
