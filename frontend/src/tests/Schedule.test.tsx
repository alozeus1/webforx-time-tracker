import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';

/**
 * /schedule mounted without throwing.
 *
 * SCOPE — read this before trusting the test
 * -------------------------------------------
 * This asserts the page and FullCalendar mount and render. It does NOT reproduce the
 * production bug, and it is important to be honest about why: the crash came from a
 * Content-Security-Policy blocking FullCalendar's injected `<style>`, which nulls
 * `styleEl.sheet`. The test DOM (happy-dom) applies no CSP and populates `style.sheet`
 * normally, so this test passed even *before* the fix. A "renders without throwing" test
 * gives false confidence for this class of bug.
 *
 * The CSP itself is guarded in contentSecurityPolicy.test.ts, and the blast radius is
 * guarded in ErrorBoundary.test.tsx. This file covers the remaining question — that the
 * page's own logic mounts cleanly — plus an explicit simulation of the null-sheet failure
 * to prove the boundary contains it rather than blanking the app.
 */

// Shapes match what each endpoint actually returns — /projects and /users resolve to
// arrays, /schedules to { entries }. Returning a bare {} here produces an unhandled
// rejection from `(response.data || []).filter(...)` rather than a useful test.
vi.mock('../services/api', () => {
    const get = vi.fn((url: string) => {
        if (url.startsWith('/schedules')) return Promise.resolve({ data: { entries: [] } });
        if (url.startsWith('/projects')) return Promise.resolve({ data: [] });
        if (url.startsWith('/users')) return Promise.resolve({ data: [] });
        if (url.startsWith('/reports/operations')) {
            return Promise.resolve({ data: { teamForecast: { members: [] } } });
        }
        return Promise.resolve({ data: null });
    });

    return {
        default: {
            get,
            post: vi.fn().mockResolvedValue({ data: {} }),
            put: vi.fn().mockResolvedValue({ data: {} }),
            delete: vi.fn().mockResolvedValue({ data: {} }),
        },
        getApiErrorMessage: (_e: unknown, fallback: string) => fallback,
    };
});

vi.mock('../utils/session', () => ({
    getStoredRole: () => 'Manager',
    getStoredUserProfile: () => ({ id: 'user-1', first_name: 'Test', last_name: 'User' }),
    getStoredToken: () => 'token',
}));

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    consoleError.mockRestore();
    vi.clearAllMocks();
});

describe('Schedule page', () => {
    it('mounts and renders the calendar without throwing', async () => {
        const { default: Schedule } = await import('../pages/Schedule');

        const { container } = render(
            <ErrorBoundary>
                <Schedule />
            </ErrorBoundary>,
        );

        // The boundary fallback must NOT be showing.
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByText('This section failed to load')).not.toBeInTheDocument();

        // FullCalendar actually rendered rather than the page being blank.
        await waitFor(() => {
            expect(container.querySelector('.fc')).toBeTruthy();
        });
        expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    });

    it('injects FullCalendar styles into an attached stylesheet', async () => {
        await import('../pages/Schedule');

        // Proves the injection path ran and the sheet was reachable. In production this
        // is what CSP was breaking: the element exists but `.sheet` is null.
        const styleEl = document.querySelector<HTMLStyleElement>('style[data-fullcalendar]');
        expect(styleEl).toBeTruthy();
        expect(styleEl!.sheet).not.toBeNull();
    });

    it('degrades to an error card, not a blank page, if style injection fails', () => {
        // Simulates the exact production failure inside a routed page.
        const NullSheetCrash: React.FC = () => {
            const styleEl = document.createElement('style');
            const sheet = styleEl.sheet as CSSStyleSheet | null; // null: never attached
            return <p>{sheet!.cssRules.length}</p>;
        };

        const { container } = render(
            <ErrorBoundary>
                <NullSheetCrash />
            </ErrorBoundary>,
        );

        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/cssRules/)).toBeInTheDocument();
        expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    });
});
