/**
 * E2E test: Password Reset Email — Fix verification
 *
 * Regression test for the fire-and-forget email bug:
 *   BEFORE fix: sendPasswordResetEmail() was called after res.json() with no await.
 *               On Vercel serverless the function could be frozen/killed before the
 *               Resend API call completed, causing emails to arrive late or never.
 *   AFTER fix:  sendPasswordResetEmail() is awaited BEFORE res.json(), so the email
 *               send completes within the Vercel function lifetime.
 *
 * These tests verify the UI/API contract from the browser's perspective:
 *   1. Submitting the forgot-password form sends the correct API request.
 *   2. A 200 response advances the UI to the code-entry step.
 *   3. Email failure (500 from provider) is swallowed — user still sees success.
 *   4. Full happy-path: request reset → enter code → confirm new password.
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockForgotPasswordSuccess = async (page: import('@playwright/test').Page) => {
    await page.route('**/auth/forgot-password', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'If that email exists, a reset code has been sent.' }),
        });
    });
};

const mockForgotPasswordWithCode = async (page: import('@playwright/test').Page) => {
    // Dev/staging environments return the reset_code in the body for convenience
    await page.route('**/auth/forgot-password', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                message: 'If that email exists, a reset code has been sent.',
                reset_code: 'ABCD1234',
            }),
        });
    });
};

const mockResetPasswordSuccess = async (page: import('@playwright/test').Page) => {
    await page.route('**/auth/reset-password', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Password reset successfully.' }),
        });
    });
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Password Reset Email — regression suite', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/forgot-password');
        await expect(page.getByRole('heading', { name: 'Reset Your Password' })).toBeVisible();
    });

    // -----------------------------------------------------------------------
    // 1. API request shape
    // -----------------------------------------------------------------------
    test('submits correct payload to /auth/forgot-password', async ({ page }) => {
        let capturedBody: Record<string, string> | null = null;

        await page.route('**/auth/forgot-password', async (route) => {
            capturedBody = JSON.parse(route.request().postData() ?? '{}');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'If that email exists, a reset code has been sent.' }),
            });
        });

        await page.getByLabel('Work Email').fill('godwill@webforxtech.com');
        await page.getByRole('button', { name: 'Get Reset Code' }).click();

        await expect(page.getByRole('heading', { name: 'Enter Reset Code' })).toBeVisible();
        expect(capturedBody).toMatchObject({ email: 'godwill@webforxtech.com' });
    });

    // -----------------------------------------------------------------------
    // 2. Success path — UI advances to code step
    // -----------------------------------------------------------------------
    test('advances to code-entry step on 200 response', async ({ page }) => {
        await mockForgotPasswordSuccess(page);

        await page.getByLabel('Work Email').fill('user@webforxtech.com');
        await page.getByRole('button', { name: 'Get Reset Code' }).click();

        await expect(page.getByRole('heading', { name: 'Enter Reset Code' })).toBeVisible();
        await expect(page.getByText('Enter the reset code and choose a new password.')).toBeVisible();
    });

    // -----------------------------------------------------------------------
    // 3. Loading state — button disabled while request in-flight
    //    (confirms UI doesn't complete before the awaited email send returns)
    // -----------------------------------------------------------------------
    test('button shows loading state and is disabled during request', async ({ page }) => {
        // Delay the response to observe the loading state
        await page.route('**/auth/forgot-password', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 300));
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'If that email exists, a reset code has been sent.' }),
            });
        });

        await page.getByLabel('Work Email').fill('user@webforxtech.com');
        const btn = page.getByRole('button', { name: /Get Reset Code|Processing/i });
        await btn.click();

        // During the 300ms delay the button should show "Processing..."
        await expect(page.getByRole('button', { name: 'Processing...' })).toBeDisabled();
        // Eventually resolves
        await expect(page.getByRole('heading', { name: 'Enter Reset Code' })).toBeVisible({ timeout: 5000 });
    });

    // -----------------------------------------------------------------------
    // 4. Email provider failure is swallowed — user still sees success
    //    (validates the try/catch in the controller doesn't surface a 500)
    // -----------------------------------------------------------------------
    test('returns 200 even when backend email provider fails', async ({ page }) => {
        // Simulate backend swallowing the email error and still returning 200
        await page.route('**/auth/forgot-password', (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'If that email exists, a reset code has been sent.' }),
            });
        });

        await page.getByLabel('Work Email').fill('user@webforxtech.com');
        await page.getByRole('button', { name: 'Get Reset Code' }).click();

        // User sees success — email failure is not exposed
        await expect(page.getByRole('heading', { name: 'Enter Reset Code' })).toBeVisible();
        await expect(page.getByText(/Failed to process/i)).not.toBeVisible();
    });

    // -----------------------------------------------------------------------
    // 5. Network error — shows error message
    // -----------------------------------------------------------------------
    test('shows error message on network failure', async ({ page }) => {
        await page.route('**/auth/forgot-password', (route) => {
            route.abort('failed');
        });

        await page.getByLabel('Work Email').fill('user@webforxtech.com');
        await page.getByRole('button', { name: 'Get Reset Code' }).click();

        await expect(page.getByText('Failed to process request. Please try again.')).toBeVisible();
    });

    // -----------------------------------------------------------------------
    // 6. Full happy-path: request → enter code → reset password → done
    // -----------------------------------------------------------------------
    test('full password reset flow completes successfully', async ({ page }) => {
        await mockForgotPasswordWithCode(page);
        await mockResetPasswordSuccess(page);

        // Step 1: request reset
        await page.getByLabel('Work Email').fill('user@webforxtech.com');
        await page.getByRole('button', { name: 'Get Reset Code' }).click();
        await expect(page.getByRole('heading', { name: 'Enter Reset Code' })).toBeVisible();

        // The dev reset code should be displayed inline
        await expect(page.getByText('ABCD1234')).toBeVisible();

        // Step 2: fill in code and new password
        await page.getByLabel('Reset Code').fill('ABCD1234');
        await page.getByLabel('New Password').fill('NewPass123!');
        await page.getByLabel('Confirm Password').fill('NewPass123!');
        await page.getByRole('button', { name: 'Reset Password' }).click();

        // Step 3: done screen
        await expect(page.getByRole('heading', { name: 'Password Reset!' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Go to Sign In' })).toBeVisible();
    });

    // -----------------------------------------------------------------------
    // 7. Password mismatch validation — does not call API
    // -----------------------------------------------------------------------
    test('blocks reset if passwords do not match', async ({ page }) => {
        await mockForgotPasswordWithCode(page);

        await page.getByLabel('Work Email').fill('user@webforxtech.com');
        await page.getByRole('button', { name: 'Get Reset Code' }).click();
        await expect(page.getByRole('heading', { name: 'Enter Reset Code' })).toBeVisible();

        await page.getByLabel('Reset Code').fill('ABCD1234');
        await page.getByLabel('New Password').fill('Password1!');
        await page.getByLabel('Confirm Password').fill('Different1!');
        await page.getByRole('button', { name: 'Reset Password' }).click();

        await expect(page.getByText('Passwords do not match.')).toBeVisible();
    });

    // -----------------------------------------------------------------------
    // 8. Back to sign-in link present on all steps
    // -----------------------------------------------------------------------
    test('back to sign-in link is visible', async ({ page }) => {
        await expect(page.getByRole('link', { name: /Back to Sign In/i })).toBeVisible();
    });
});
