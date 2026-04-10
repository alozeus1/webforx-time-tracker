import { test, expect } from '@playwright/test';
import { installStableApiMocks, loginWithMockedBackend, type AppRole } from './utils/mock-backend';

const EMPLOYEE_EMAIL = 'employee@webforxtech.com';
const EMPLOYEE_PASSWORD = 'password123';
const ADMIN_EMAIL = 'admin@webforxtech.com';
const ADMIN_PASSWORD = 'webforxtechng@';
const LOGIN_SUBMIT_LABEL = /Continue with Email\/Password|Sign In/i;

/* ────────────────────────────────────────────
   1. Landing Page
   ──────────────────────────────────────────── */

test.describe('Landing Page', () => {
    test('renders all key sections', async ({ page }) => {
        await page.goto('/');

        // Nav
        await expect(page.locator('.landing-nav')).toBeVisible();
        await expect(page.locator('text=Web Forx Time Tracker').first()).toBeVisible();

        // Hero
        await expect(page.locator('text=Track Time. Improve Accountability. Deliver Results.')).toBeVisible();
        await expect(page.getByRole('link', { name: /Get Started/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /See How It Works/i })).toBeVisible();

        // Features section
        await expect(page.locator('#features')).toBeVisible();
        await expect(page.locator('text=Dashboard Insights')).toBeVisible();
        await expect(page.locator('text=Live Timer')).toBeVisible();

        // Demo section
        await expect(page.locator('#demo')).toBeVisible();
        await expect(page.locator('text=Explore the Product')).toBeVisible();

        // Footer
        await expect(page.locator('text=Powered by')).toBeVisible();
        await expect(page.locator('text=Maralito Labs')).toBeVisible();
    });

    test('demo walkthrough tabs are interactive', async ({ page }) => {
        await page.goto('/');

        await page.locator('#demo').scrollIntoViewIfNeeded();

        const timerTab = page.locator('.demo-tab', { hasText: 'Timer' });
        await timerTab.click();
        await expect(page.locator('.demo-panel-text h3', { hasText: 'Timer' })).toBeVisible();

        const reportsTab = page.locator('.demo-tab', { hasText: 'Reports' });
        await reportsTab.click();
        await expect(page.locator('.demo-panel-text h3', { hasText: 'Reports' })).toBeVisible();
    });

    test('"Get Started" link navigates to login', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('link', { name: /Get Started/i }).click();
        await expect(page).toHaveURL(/.*login/);
    });

    test('legacy /landing redirects to canonical root landing', async ({ page }) => {
        await page.goto('/landing');
        await expect(page).toHaveURL(/.*\/$/);
        await expect(page.locator('text=Track Time. Improve Accountability. Deliver Results.')).toBeVisible();
    });

    test('unauthenticated root renders landing content', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL(/.*\/$/);
        await expect(page.locator('text=Track Time. Improve Accountability. Deliver Results.')).toBeVisible();
    });
});

/* ────────────────────────────────────────────
   2. Login Page
   ──────────────────────────────────────────── */

test.describe('Login Page', () => {
    test('renders login form', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByLabel('Work Email')).toBeVisible();
        await expect(page.getByLabel('Password')).toBeVisible();
        await expect(page.getByRole('button', { name: LOGIN_SUBMIT_LABEL })).toBeVisible();
        await expect(page.locator('text=Web Forx Time Tracker')).toBeVisible();
    });

    test('successful login redirects to dashboard', async ({ page }) => {
        await installStableApiMocks(page, { role: 'Employee' });
        await page.goto('/login');
        await page.getByLabel('Work Email').fill(EMPLOYEE_EMAIL);
        await page.getByLabel('Password').fill(EMPLOYEE_PASSWORD);
        await page.getByRole('button', { name: LOGIN_SUBMIT_LABEL }).click();
        await expect(page).toHaveURL(/.*dashboard/);
    });

    test('failed login shows inline error', async ({ page }) => {
        await installStableApiMocks(page, { loginMode: 'failure' });
        await page.goto('/login');
        await page.getByLabel('Work Email').fill('bad@email.com');
        await page.getByLabel('Password').fill('wrongpassword');
        await page.getByRole('button', { name: LOGIN_SUBMIT_LABEL }).click();
        await expect(page.locator('.login-error')).toContainText(/login failed|invalid credentials/i);
        await expect(page).toHaveURL(/.*login/);
    });
});

/* ────────────────────────────────────────────
   3. Onboarding Tour
   ──────────────────────────────────────────── */

test.describe('Onboarding Tour', () => {
    test('appears on first login and can be skipped', async ({ page }) => {
        await loginWithMockedBackend(page, {
            email: EMPLOYEE_EMAIL,
            password: EMPLOYEE_PASSWORD,
            role: 'Employee',
            dismissTour: false,
        });

        // Tour should appear
        const tourDialog = page.locator('[role="dialog"][aria-label="Product tour"]');
        await expect(tourDialog).toBeVisible({ timeout: 5000 });
        await expect(page.locator('text=Welcome to Web Forx Time Tracker')).toBeVisible();

        // Skip button
        await page.getByRole('button', { name: 'Skip tour' }).click();
        await expect(tourDialog).not.toBeVisible();
    });

    test('can navigate through tour steps', async ({ page }) => {
        await loginWithMockedBackend(page, {
            email: EMPLOYEE_EMAIL,
            password: EMPLOYEE_PASSWORD,
            role: 'Employee',
            dismissTour: false,
        });

        const tourDialog = page.locator('[role="dialog"][aria-label="Product tour"]');
        await expect(tourDialog).toBeVisible({ timeout: 5000 });

        // Step 1: Welcome
        await expect(page.locator('.tour-step-badge')).toContainText('1 of');

        // Navigate to step 2
        await page.getByRole('button', { name: /Next/i }).click();
        await expect(page.locator('.tour-step-badge')).toContainText('2 of');
        await expect(page.locator('text=Dashboard').first()).toBeVisible();

        // Navigate to step 3
        await page.getByRole('button', { name: /Next/i }).click();
        await expect(page.locator('.tour-step-badge')).toContainText('3 of');

        // Go back
        await page.getByRole('button', { name: /Back/i }).click();
        await expect(page.locator('.tour-step-badge')).toContainText('2 of');

        // Skip from here
        await page.getByRole('button', { name: 'Skip tour' }).click();
        await expect(tourDialog).not.toBeVisible();
    });
});

/* ────────────────────────────────────────────
   Helper: login and dismiss tour
   ──────────────────────────────────────────── */

const loginAndDismissTour = async (
    page: import('@playwright/test').Page,
    email: string,
    password: string,
    role: AppRole,
) => {
    await loginWithMockedBackend(page, {
        email,
        password,
        role,
        dismissTour: true,
    });
};

/* ────────────────────────────────────────────
   4. Authenticated Pages (Employee)
   ──────────────────────────────────────────── */

test.describe('Employee - Core Pages', () => {
    test.beforeEach(async ({ page }) => {
        await loginAndDismissTour(page, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, 'Employee');
    });

    test('Dashboard loads with key elements', async ({ page }) => {
        await expect(page).toHaveURL(/.*dashboard/);
        await expect(page.locator('text=Dashboard').first()).toBeVisible();
    });

    test('Timer page loads and has controls', async ({ page }) => {
        await page.goto('/timer');
        await expect(page).toHaveURL(/.*timer/);

        const startBtn = page.getByRole('button', { name: /Start Timer/i });
        const stopBtn = page.getByRole('button', { name: /Stop Timer/i });
        await Promise.race([
            startBtn.waitFor({ state: 'visible', timeout: 10000 }),
            stopBtn.waitFor({ state: 'visible', timeout: 10000 }),
        ]);
    });

    test('Timeline page loads', async ({ page }) => {
        await page.goto('/timeline');
        await expect(page).toHaveURL(/.*timeline/);
        // Wait for any content to render
        await page.waitForTimeout(1000);
        await expect(page.locator('.page-wrapper')).toBeVisible();
    });

    test('Timesheet page loads', async ({ page }) => {
        await page.goto('/timesheet');
        await expect(page).toHaveURL(/.*timesheet/);
        await page.waitForTimeout(1000);
        await expect(page.locator('.page-wrapper')).toBeVisible();
    });

    test('Reports page loads', async ({ page }) => {
        await page.goto('/reports');
        await expect(page).toHaveURL(/.*reports/);
        await expect(page.locator('text=Reports').first()).toBeVisible();
    });

    test('Profile page loads and avatar picker is present', async ({ page }) => {
        await page.goto('/profile');
        await expect(page).toHaveURL(/.*profile/);
        await expect(page.locator('text=Profile Avatar').first()).toBeVisible();
        await expect(page.locator('.avatar-picker')).toBeVisible();
    });

    test('Integrations page loads', async ({ page }) => {
        await page.goto('/integrations');
        await expect(page).toHaveURL(/.*integrations/);
        await page.waitForTimeout(1000);
        await expect(page.locator('.page-wrapper')).toBeVisible();
    });

    test('Settings page loads', async ({ page }) => {
        await page.goto('/settings');
        await expect(page).toHaveURL(/.*settings/);
        await page.waitForTimeout(1000);
        await expect(page.locator('.page-wrapper')).toBeVisible();
    });

    test('Sidebar navigation works', async ({ page }) => {
        // Click Timer in sidebar
        await page.locator('.sidebar-link', { hasText: 'Timer' }).click();
        await expect(page).toHaveURL(/.*timer/);

        // Click Timeline in sidebar
        await page.locator('.sidebar-link', { hasText: 'Timeline' }).click();
        await expect(page).toHaveURL(/.*timeline/);

        // Click Dashboard in sidebar
        await page.locator('.sidebar-link', { hasText: 'Dashboard' }).click();
        await expect(page).toHaveURL(/.*dashboard/);
    });

    test('Sign out works', async ({ page }) => {
        await page.locator('.sidebar-link', { hasText: 'Sign Out' }).click();
        await expect(page).toHaveURL(/.*login/);
    });
});

/* ────────────────────────────────────────────
   5. Avatar Picker (Profile)
   ──────────────────────────────────────────── */

test.describe('Avatar Picker', () => {
    test.beforeEach(async ({ page }) => {
        await loginAndDismissTour(page, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, 'Employee');
        await page.goto('/profile');
    });

    test('emoji tab shows emoji grid', async ({ page }) => {
        await expect(page.locator('.avatar-emoji-grid')).toBeVisible();
        const emojiButtons = page.locator('.avatar-emoji-btn');
        const count = await emojiButtons.count();
        expect(count).toBeGreaterThanOrEqual(20);
    });

    test('selecting an emoji updates preview', async ({ page }) => {
        const firstEmoji = page.locator('.avatar-emoji-btn').first();
        await firstEmoji.click();
        await expect(firstEmoji).toHaveClass(/selected/);
    });

    test('upload tab shows upload area', async ({ page }) => {
        await page.locator('.avatar-picker-tab', { hasText: 'Upload Photo' }).click();
        await expect(page.locator('.avatar-upload-area')).toBeVisible();
    });

    test('save button works after emoji selection', async ({ page }) => {
        await page.locator('.avatar-emoji-btn').first().click();
        await page.getByRole('button', { name: 'Save Avatar' }).click();
        // Should not throw; avatar saved to localStorage
    });
});

/* ────────────────────────────────────────────
   6. Admin Pages
   ──────────────────────────────────────────── */

test.describe('Admin - Elevated Pages', () => {
    test.beforeEach(async ({ page }) => {
        await loginAndDismissTour(page, ADMIN_EMAIL, ADMIN_PASSWORD, 'Admin');
    });

    test('Admin page loads', async ({ page }) => {
        await page.goto('/admin');
        await expect(page).toHaveURL(/.*admin/);
        await page.waitForTimeout(1000);
        await expect(page.locator('.page-wrapper')).toBeVisible();
    });

    test('Team page loads', async ({ page }) => {
        await page.goto('/team');
        await expect(page).toHaveURL(/.*team/);
        await page.waitForTimeout(1000);
        await expect(page.locator('.page-wrapper')).toBeVisible();
    });

    test('Employee cannot access admin page', async ({ page }) => {
        // Sign out
        await page.locator('.sidebar-link', { hasText: 'Sign Out' }).click();
        await expect(page).toHaveURL(/.*login/);

        // Login as employee
        await loginAndDismissTour(page, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, 'Employee');
        await page.goto('/admin');
        // Should be redirected away
        await expect(page).not.toHaveURL(/.*admin/);
    });
});

/* ────────────────────────────────────────────
   7. Route Guards
   ──────────────────────────────────────────── */

test.describe('Route Guards', () => {
    test('unauthenticated user is redirected from protected routes', async ({ page }) => {
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/.*login/);
    });

    test('unauthenticated user is redirected from timer', async ({ page }) => {
        await page.goto('/timer');
        await expect(page).toHaveURL(/.*login/);
    });

    test('authenticated root redirects to dashboard', async ({ page }) => {
        await loginAndDismissTour(page, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, 'Employee');
        await page.goto('/');
        await expect(page).toHaveURL(/.*dashboard/);
    });
});
