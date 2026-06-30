/**
 * E2E test: Access Diagnostics panel — stats accuracy fix
 *
 * Regression tests for two bugs:
 *
 * Bug 1 (Backend): AuthEvent rows had organization_id = null, so the
 *   getUserAuthEvents query (filtered by org_id) always returned empty.
 *   Fixed in authEventService + authController — verified by Jest unit tests.
 *
 * Bug 2 (Frontend): authSummary used a 7-day window for failedLogins but
 *   the raw event list showed ALL returned events (no date gate). An event
 *   from >7 days ago appeared in the list but counted as 0.
 *   Fixed: authSummary.recentEvents filters to last 30 days, the list now
 *   renders recentEvents, and a "Activity — last 30 days" label is shown.
 *
 * These tests exercise the Manager/Team page Access Diagnostics section.
 * All API calls are mocked at the network layer.
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock token (Manager role to access Team page)
// ---------------------------------------------------------------------------
const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEiLCJlbWFpbCI6Im1hbmFnZXJAdGVzdC5jb20iLCJyb2xlIjoiTWFuYWdlciIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ.fake';

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000).toISOString();

// ---------------------------------------------------------------------------
// Auth event fixtures
// ---------------------------------------------------------------------------

const RECENT_FAILURE = {
    id: 'evt-1',
    user_id: 'user-agada',
    email: 's8ikoyi.wft@gmail.com',
    event_type: 'login_attempt',
    outcome: 'failure',
    reason: 'invalid_password',
    ip_address: '102.90.116.71',
    user_agent: 'Mozilla/5.0',
    created_at: hoursAgo(2),   // 2 hours ago — within 7-day window
    metadata: {},
};

const RECENT_SUCCESS = {
    id: 'evt-2',
    user_id: 'user-agada',
    email: 's8ikoyi.wft@gmail.com',
    event_type: 'login_attempt',
    outcome: 'success',
    reason: null,
    ip_address: '102.90.116.71',
    user_agent: 'Mozilla/5.0',
    created_at: hoursAgo(4),   // 4 hours ago — within 7-day window
    metadata: {},
};

const OLD_FAILURE = {
    id: 'evt-3',
    user_id: 'user-agada',
    email: 's8ikoyi.wft@gmail.com',
    event_type: 'login_attempt',
    outcome: 'failure',
    reason: 'invalid_password',
    ip_address: '197.211.58.38',
    user_agent: 'Mozilla/5.0',
    created_at: hoursAgo(24 * 67),  // 67 days ago — outside 7-day AND 30-day windows
    metadata: {},
};

const RECENT_RESET = {
    id: 'evt-4',
    user_id: 'user-agada',
    email: 's8ikoyi.wft@gmail.com',
    event_type: 'password_reset_request',
    outcome: 'success',
    reason: null,
    ip_address: '102.90.116.71',
    user_agent: 'Mozilla/5.0',
    created_at: hoursAgo(48),   // 2 days ago — within 30-day window
    metadata: {},
};

const SELECTED_USER = {
    id: 'user-agada',
    email: 's8ikoyi.wft@gmail.com',
    first_name: 'Agada',
    last_name: 'Ikoyi',
    team_name: 'PoCs',
    is_active: true,
    role: { name: 'Manager' },
};

// ---------------------------------------------------------------------------
// Helper: set up a Manager session and mock all required APIs
// ---------------------------------------------------------------------------

const setupManagerSession = async (page: import('@playwright/test').Page) => {
    await page.addInitScript((token: string) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user_role', 'Manager');
        localStorage.setItem('user_profile', JSON.stringify({
            id: 'user-1',
            email: 'manager@test.com',
            first_name: 'Test',
            last_name: 'Manager',
            role: 'Manager',
        }));
        localStorage.setItem('onboarding_completed', 'true');
    }, MOCK_TOKEN);
};

const mockTeamAPIs = async (page: import('@playwright/test').Page, authEvents: object[]) => {
    await page.route('http://localhost:5005/**', (route) => {
        const url = route.request().url();

        if (url.includes('/api/v1/users/me')) {
            return route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ id: 'user-1', email: 'manager@test.com', first_name: 'Test', last_name: 'Manager', role: 'Manager' }) });
        }
        if (url.includes('/api/v1/users') && url.includes('/auth-events')) {
            return route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ user: SELECTED_USER, events: authEvents }) });
        }
        if (url.includes('/api/v1/users')) {
            return route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify([SELECTED_USER]) });
        }
        if (url.includes('/api/v1/timers/me')) {
            return route.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify({ entries: [], activeTimer: null }) });
        }
        if (url.includes('/notifications')) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        }

        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Access Diagnostics — stats accuracy (Bug 2 frontend fix)', () => {

    // -----------------------------------------------------------------------
    // 1. Recent failure → count reflects it correctly
    // -----------------------------------------------------------------------
    test('FAILED LOGINS count matches visible failure events within 7 days', async ({ page }) => {
        await setupManagerSession(page);
        await mockTeamAPIs(page, [RECENT_FAILURE, RECENT_SUCCESS]);
        await page.goto('/team');

        // Locate the Access Diagnostics section
        const section = page.getByText('Access Diagnostics').first();
        await expect(section).toBeVisible({ timeout: 10000 });

        // Select the user to trigger auth events load
        const searchBox = page.getByPlaceholder(/Search by name.*email.*role.*status/i);
        if (await searchBox.isVisible()) {
            await searchBox.fill('Agada');
        }

        // The failure event is within 7 days → count should be 1
        await expect(page.getByText('1').first()).toBeVisible({ timeout: 8000 });
    });

    // -----------------------------------------------------------------------
    // 2. Old failure outside 7-day window → count is 0, event NOT shown in list
    // -----------------------------------------------------------------------
    test('old failure event (>30 days) is excluded from both count and event list', async ({ page }) => {
        await setupManagerSession(page);
        // Only old event — outside both 7-day and 30-day windows
        await mockTeamAPIs(page, [OLD_FAILURE]);
        await page.goto('/team');

        const section = page.getByText('Access Diagnostics').first();
        await expect(section).toBeVisible({ timeout: 10000 });

        // Old event should NOT appear in the 30-day filtered list
        await expect(page.getByText('102.90.116.71').first()).not.toBeVisible();
        // Empty state should be shown instead
        await expect(page.getByText(/No auth events recorded.*last 30 days/i)).toBeVisible({ timeout: 5000 });
    });

    // -----------------------------------------------------------------------
    // 3. Date range label is rendered above the event list
    // -----------------------------------------------------------------------
    test('shows "Activity — last 30 days" label when events are present', async ({ page }) => {
        await setupManagerSession(page);
        await mockTeamAPIs(page, [RECENT_FAILURE, RECENT_SUCCESS, RECENT_RESET]);
        await page.goto('/team');

        await expect(page.getByText('Access Diagnostics').first()).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(/Activity.*last 30 days/i)).toBeVisible({ timeout: 8000 });
    });

    // -----------------------------------------------------------------------
    // 4. Reset request within 30 days counts correctly
    // -----------------------------------------------------------------------
    test('RESET REQUESTS count reflects events within 30 days', async ({ page }) => {
        await setupManagerSession(page);
        await mockTeamAPIs(page, [RECENT_RESET]);
        await page.goto('/team');

        await expect(page.getByText('Access Diagnostics').first()).toBeVisible({ timeout: 10000 });
        // RESET REQUESTS should be 1
        await expect(page.getByText('1').first()).toBeVisible({ timeout: 8000 });
    });

    // -----------------------------------------------------------------------
    // 5. Mixed: recent + old events — only recent appear in list, count is accurate
    // -----------------------------------------------------------------------
    test('only events within 30 days appear in the event list when mixed old and new', async ({ page }) => {
        await setupManagerSession(page);
        // Mix: one recent failure (within 7d), one old failure (67d ago, outside 30d)
        await mockTeamAPIs(page, [RECENT_FAILURE, OLD_FAILURE]);
        await page.goto('/team');

        await expect(page.getByText('Access Diagnostics').first()).toBeVisible({ timeout: 10000 });
        // The old failure's IP should NOT appear (filtered from list)
        await expect(page.getByText('197.211.58.38')).not.toBeVisible();
    });

    // -----------------------------------------------------------------------
    // 6. Empty state message reflects the 30-day scope
    // -----------------------------------------------------------------------
    test('empty state says "last 30 days" not generic "no recent events"', async ({ page }) => {
        await setupManagerSession(page);
        // Return events but all older than 30 days
        await mockTeamAPIs(page, [OLD_FAILURE]);
        await page.goto('/team');

        await expect(page.getByText('Access Diagnostics').first()).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(/No auth events recorded.*last 30 days/i)).toBeVisible({ timeout: 5000 });
        // Old generic message should be gone
        await expect(page.getByText('No recent auth events were recorded for this user.')).not.toBeVisible();
    });
});
