import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Weekly Timesheet: the approved / rejected / pending split, and rejection reasons.
 *
 * The case behind this spec: an intern logged 10.22h in week 35 of 2026, had 7.58h
 * rejected with no reason given and no notification, read "Weekly total: 10.2h" off
 * this screen, and disputed the compliance warning that followed. She read the screen
 * correctly — it showed total logged and called it the weekly total, while the figure
 * she was measured on was 2.64h approved.
 *
 * The mocked API mirrors that week exactly.
 */

const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEiLCJlbWFpbCI6InRlc3RAdGVzdC5jb20iLCJyb2xlIjoiRW1wbG95ZWUiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6OTk5OTk5OTk5OX0.fake';

/**
 * Fixture days are relative to the current week, not to 2026-08-24.
 *
 * The page opens on "today". Pinning the fixtures to the real week-35 dates would mean
 * clicking "Prev Week" once today, twice next week, and 60 times in a year — a spec
 * with an expiry date. Anchoring to this week keeps the arithmetic identical and the
 * navigation at zero.
 */
const mondayOfThisWeek = (): Date => {
    const today = new Date();
    const day = today.getDay();
    today.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));
    today.setHours(12, 0, 0, 0); // midday, so a timezone shift cannot move the weekday
    return today;
};

/** Midday on Monday + `offset` days of the current week, as an ISO timestamp. */
const dayOfWeek = (offset: number): string => {
    const date = mondayOfThisWeek();
    date.setDate(date.getDate() + offset);
    return date.toISOString();
};

const hoursToSeconds = (hours: number) => Math.round(hours * 3600);

const weekEntry = (
    id: string,
    dayOffset: number,
    task: string,
    hours: number,
    status: string,
    extra: Record<string, unknown> = {},
) => ({
    id,
    user_id: 'user-1',
    project_id: null,
    task_description: task,
    start_time: dayOfWeek(dayOffset),
    end_time: dayOfWeek(dayOffset),
    duration: hoursToSeconds(hours),
    entry_type: 'timer',
    status,
    project: null,
    ...extra,
});

/** Week 35 as it actually was: Tue 6.58h and Wed 1.00h rejected, Wed 1.62h and Sat 1.02h approved. */
const WEEK_35_ENTRIES = [
    weekEntry('w35-1', 1, 'Working on my tkt', 6.58, 'rejected', {
        rejection_reason_code: 'INSUFFICIENT_DESCRIPTION',
        rejection_reason_label: 'Task description too vague or incomplete',
        rejection_reason_note: 'Say what "tkt" refers to and pick a project.',
        reviewed_at: dayOfWeek(6),
    }),
    weekEntry('w35-2', 2, 'Tkt', 1.0, 'rejected', {
        rejection_reason_code: 'WRONG_PROJECT',
        rejection_reason_label: 'Wrong or missing project assignment',
        rejection_reason_note: null,
        reviewed_at: dayOfWeek(6),
    }),
    weekEntry('w35-3', 2, 'Working on my tkt', 1.62, 'approved'),
    weekEntry('w35-4', 5, 'tkt', 1.02, 'approved'),
];

const totalsFor = (entries: typeof WEEK_35_ENTRIES) => {
    const sum = (status: string) => entries
        .filter((entry) => entry.status === status)
        .reduce((acc, entry) => acc + entry.duration, 0);

    return {
        from: dayOfWeek(0),
        to: dayOfWeek(7),
        approved_seconds: sum('approved'),
        rejected_seconds: sum('rejected'),
        pending_seconds: sum('pending'),
        total_seconds: entries.reduce((acc, entry) => acc + entry.duration, 0),
    };
};

const REJECTION_REASONS = {
    reasons: [
        { code: 'EXCEEDS_DAILY_CAP', label: 'Exceeds the 8-hour daily cap', requires_note: false },
        { code: 'IDLE_TIMER_OVERRUN', label: 'Timer left running / idle — duration overstated', requires_note: false },
        { code: 'OVERLAPPING_ENTRY', label: 'Overlaps hours already submitted', requires_note: false },
        { code: 'WRONG_PROJECT', label: 'Wrong or missing project assignment', requires_note: false },
        { code: 'INSUFFICIENT_DESCRIPTION', label: 'Task description too vague or incomplete', requires_note: false },
        { code: 'NOT_COMPANY_WORK', label: 'Not company work', requires_note: false },
        { code: 'DUPLICATE_ENTRY', label: 'Duplicate of another entry', requires_note: false },
        { code: 'OTHER', label: 'Other — reason required', requires_note: true },
    ],
    note_max_length: 500,
};

const injectSession = async (page: Page, role: 'Employee' | 'Manager') => {
    await page.evaluate(({ tok, userRole }) => {
        localStorage.setItem('token', tok);
        localStorage.setItem('user_role', userRole);
        localStorage.setItem('user_profile', JSON.stringify({
            id: 'user-1', email: 'test@test.com', first_name: 'Test', last_name: 'User', role: userRole,
        }));
        // The product tour is a modal overlay that swallows every click on first visit.
        localStorage.setItem('onboarding_completed', 'true');
    }, { tok: MOCK_TOKEN, userRole: role });
};

interface MockOptions {
    entries?: typeof WEEK_35_ENTRIES;
    pendingApprovals?: unknown[];
    /** Receives every approval POST body so a test can assert what was submitted. */
    onReview?: (url: string, body: unknown) => void;
}

const mockApi = async (page: Page, options: MockOptions = {}) => {
    const entries = options.entries ?? WEEK_35_ENTRIES;

    // The login page loads Google Identity Services. In a sandboxed or offline runner
    // that request hangs until the connection resets, adding ~20s to every test here for
    // a script none of them exercise. Cut it off immediately.
    await page.route(/accounts\.google\.com/, (route: Route) => route.abort());

    // Routed on the path, not the origin. The API host is derived at runtime from the
    // page's own hostname (utils/apiConfig.ts), so it is 127.0.0.1:5005 under the CI
    // preview server and localhost:5005 under `vite dev` — a hardcoded origin silently
    // matches nothing in one of the two.
    await page.route('**/api/v1/**', async (route: Route) => {
        const request = route.request();
        const url = request.url();
        const json = (status: number, body: unknown) =>
            route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

        if (url.includes('/api/v1/timers/rejection-reasons')) {
            await json(200, REJECTION_REASONS);
            return;
        }

        if (url.includes('/api/v1/timers/approvals/bulk') || /\/api\/v1\/timers\/approvals\/[^/?]+$/.test(url)) {
            if (request.method() === 'POST') {
                options.onReview?.(url, request.postDataJSON());
                await json(200, url.includes('/bulk')
                    ? { updated: 2, skipped_locked: [], skipped_not_pending: [], not_found: [], message: '2 entries rejected.' }
                    : { id: 'p1', status: 'rejected' });
                return;
            }
        }

        if (url.includes('/api/v1/timers/approvals')) {
            await json(200, { entries: options.pendingApprovals ?? [] });
            return;
        }

        if (url.includes('/api/v1/timers/me')) {
            await json(200, { entries, activeTimer: null, totals: totalsFor(entries as typeof WEEK_35_ENTRIES) });
            return;
        }

        if (url.includes('/api/v1/timers/active')) {
            await json(200, { activeTimer: null });
            return;
        }

        if (url.includes('/api/v1/users/me')) {
            await json(200, { id: 'user-1', email: 'test@test.com', first_name: 'Test', last_name: 'User', role: 'Employee' });
            return;
        }

        if (url.includes('/api/v1/projects') || url.includes('/api/v1/tags')) {
            await json(200, []);
            return;
        }

        await json(200, {});
    });
};

/** Opens /timesheet, which lands on the current week — where the fixtures live. */
const openWeek35 = async (page: Page) => {
    await page.goto('/timesheet');
    await expect(page).toHaveURL(/.*timesheet/, { timeout: 10000 });
    await expect(page.getByTestId('weekly-status-summary')).toBeVisible({ timeout: 10000 });
};

test.describe('Weekly Timesheet — approved / rejected / pending', () => {
    test('shows approved, rejected and pending as three separate figures', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page, 'Employee');
        await mockApi(page);
        await openWeek35(page);

        // 2.64h approved — the figure compliance uses, and the one the old screen hid.
        await expect(page.getByTestId('approved-hours')).toHaveText('2.64h');
        await expect(page.getByTestId('rejected-hours')).toHaveText('7.58h');
        await expect(page.getByTestId('pending-hours')).toHaveText('0.00h');

        // Stated plainly, not left to be inferred.
        await expect(page.getByText(/counted toward your weekly minimum/i)).toBeVisible();

        // And total logged is still here, so nobody thinks hours vanished.
        await expect(page.getByTestId('total-logged-hours')).toContainText('10.22h');
    });

    test('shows the reason on each rejected entry, and the note when there is one', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page, 'Employee');
        await mockApi(page);
        await openWeek35(page);

        const rejected = page.getByTestId('rejected-entries');
        await expect(rejected).toBeVisible();
        await expect(rejected).toContainText('Task description too vague or incomplete');
        await expect(rejected).toContainText('Say what "tkt" refers to and pick a project.');
        await expect(rejected).toContainText('Wrong or missing project assignment');
    });

    test('renders a historical rejection as "No reason recorded" rather than blank', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page, 'Employee');
        await mockApi(page, {
            entries: [
                weekEntry('old-1', 1, 'Working on my tkt', 6.58, 'rejected', {
                    rejection_reason_code: null,
                    rejection_reason_label: null,
                    rejection_reason_note: null,
                }),
            ],
        });
        await openWeek35(page);

        await expect(page.getByTestId('rejected-entries')).toContainText('No reason recorded');
    });

    test('a week with no rejections still renders, with no rejection panel', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page, 'Employee');
        await mockApi(page, {
            entries: [
                weekEntry('clean-1', 1, 'Shipped the release', 4, 'approved'),
                weekEntry('clean-2', 2, 'Code review', 2, 'pending'),
            ],
        });
        await openWeek35(page);

        await expect(page.getByTestId('approved-hours')).toHaveText('4.00h');
        await expect(page.getByTestId('rejected-hours')).toHaveText('0.00h');
        await expect(page.getByTestId('pending-hours')).toHaveText('2.00h');
        await expect(page.getByTestId('rejected-entries')).toHaveCount(0);
        // The grid is still there and still populated.
        await expect(page.getByText('Daily Total')).toBeVisible();
    });
});

const pendingApproval = (id: string, task: string) => ({
    id,
    user_id: 'user-2',
    task_description: task,
    duration: 3600,
    start_time: '2026-08-25T09:00:00.000Z',
    end_time: '2026-08-25T10:00:00.000Z',
    status: 'pending',
    user: { id: 'user-2', email: 'intern@webforxtech.com', first_name: 'Sam', last_name: 'Intern', is_active: true },
});

test.describe('Manager approval — a rejection needs a reason', () => {
    test('cannot reject without a reason, and OTHER additionally needs a note', async ({ page }) => {
        const submitted: unknown[] = [];
        await page.goto('/login');
        await injectSession(page, 'Manager');
        await mockApi(page, {
            pendingApprovals: [pendingApproval('p1', 'Tkt')],
            onReview: (_url, body) => submitted.push(body),
        });

        await page.goto('/timesheet');
        await page.getByRole('button', { name: /Approval Queue/i }).click();

        await page.getByLabel(/^Reject Sam Intern/).click();

        const dialog = page.getByRole('dialog', { name: /Reject this entry/i });
        await expect(dialog).toBeVisible();

        // Nothing submitted, and the submit button is unusable, until a reason is chosen.
        const submit = dialog.getByRole('button', { name: 'Reject this entry' });
        await expect(submit).toBeDisabled();
        expect(submitted).toHaveLength(0);

        // OTHER alone is still not enough.
        await dialog.getByLabel(/^Reason/).selectOption('OTHER');
        await expect(submit).toBeDisabled();
        await expect(dialog.getByText(/note is required when the reason is/i)).toBeHidden();

        await dialog.getByLabel(/^Note/).fill('Logged against the wrong client.');
        await expect(submit).toBeEnabled();
        await submit.click();

        await expect.poll(() => submitted.length).toBe(1);
        expect(submitted[0]).toMatchObject({
            action: 'reject',
            rejection_reason_code: 'OTHER',
            rejection_reason_note: 'Logged against the wrong client.',
        });
    });

    test('a non-OTHER reason submits without a note', async ({ page }) => {
        const submitted: unknown[] = [];
        await page.goto('/login');
        await injectSession(page, 'Manager');
        await mockApi(page, {
            pendingApprovals: [pendingApproval('p1', 'Tkt')],
            onReview: (_url, body) => submitted.push(body),
        });

        await page.goto('/timesheet');
        await page.getByRole('button', { name: /Approval Queue/i }).click();
        await page.getByLabel(/^Reject Sam Intern/).click();

        const dialog = page.getByRole('dialog', { name: /Reject this entry/i });
        await dialog.getByLabel(/^Reason/).selectOption('INSUFFICIENT_DESCRIPTION');
        await dialog.getByRole('button', { name: 'Reject this entry' }).click();

        await expect.poll(() => submitted.length).toBe(1);
        expect(submitted[0]).toMatchObject({
            action: 'reject',
            rejection_reason_code: 'INSUFFICIENT_DESCRIPTION',
        });
    });

    test('bulk reject applies one reason across the whole selection', async ({ page }) => {
        const submitted: { url: string; body: unknown }[] = [];
        await page.goto('/login');
        await injectSession(page, 'Manager');
        await mockApi(page, {
            pendingApprovals: [pendingApproval('p1', 'Tkt'), pendingApproval('p2', 'tkt')],
            onReview: (url, body) => submitted.push({ url, body }),
        });

        await page.goto('/timesheet');
        await page.getByRole('button', { name: /Approval Queue/i }).click();

        await page.getByLabel('Select all pending entries').click();
        await expect(page.getByText('2 selected')).toBeVisible();
        await page.getByRole('button', { name: 'Reject all' }).click();

        const dialog = page.getByRole('dialog', { name: /Reject 2 entries/i });
        await expect(dialog).toBeVisible();
        await dialog.getByLabel(/^Reason/).selectOption('WRONG_PROJECT');
        await dialog.getByRole('button', { name: 'Reject 2 entries' }).click();

        await expect.poll(() => submitted.length).toBe(1);
        expect(submitted[0].url).toContain('/approvals/bulk');
        // One request, one reason, both entries.
        expect(submitted[0].body).toMatchObject({
            entry_ids: ['p1', 'p2'],
            action: 'reject',
            rejection_reason_code: 'WRONG_PROJECT',
        });
    });

    test('the reason a manager picked is what the employee then sees', async ({ page }) => {
        await page.goto('/login');
        await injectSession(page, 'Employee');
        // The state after the manager rejected p1 as INSUFFICIENT_DESCRIPTION.
        await mockApi(page, {
            entries: [
                weekEntry('p1', 1, 'Tkt', 6.58, 'rejected', {
                    rejection_reason_code: 'INSUFFICIENT_DESCRIPTION',
                    rejection_reason_label: 'Task description too vague or incomplete',
                    rejection_reason_note: 'Say what "tkt" refers to and pick a project.',
                }),
            ],
        });
        await openWeek35(page);

        const rejected = page.getByTestId('rejected-entries');
        await expect(rejected).toContainText('Task description too vague or incomplete');
        await expect(rejected).toContainText('Say what "tkt" refers to and pick a project.');
        await expect(page.getByTestId('approved-hours')).toHaveText('0.00h');
        await expect(page.getByTestId('rejected-hours')).toHaveText('6.58h');
    });
});
