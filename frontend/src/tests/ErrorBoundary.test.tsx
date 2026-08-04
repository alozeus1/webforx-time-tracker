import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';

/**
 * Regression: /schedule rendered a completely blank page for every user.
 *
 * The proximate cause was a CSP failure inside FullCalendar (fixed in
 * frontend/vercel.json), but the reason it produced a *blank page* rather than a
 * degraded one is that the app had no error boundary at all. React unmounts the entire
 * tree on an uncaught render error, so any component throwing took the whole UI with it
 * and left nothing on screen to explain why.
 *
 * These tests lock in the containment, not the specific FullCalendar bug.
 */

const Boom: React.FC<{ message?: string }> = ({ message }) => {
    throw new TypeError(message ?? 'Cannot read properties of null (reading \'cssRules\')');
};

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    // React logs caught errors loudly; silence it so the suite output stays readable.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    consoleError.mockRestore();
});

describe('ErrorBoundary', () => {
    it('renders children unchanged when nothing throws', () => {
        render(
            <ErrorBoundary>
                <p>calendar content</p>
            </ErrorBoundary>,
        );

        expect(screen.getByText('calendar content')).toBeInTheDocument();
    });

    it('renders a visible fallback instead of a blank page when a child throws', () => {
        const { container } = render(
            <ErrorBoundary>
                <Boom />
            </ErrorBoundary>,
        );

        // The specific failure that blanked /schedule.
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('This section failed to load')).toBeInTheDocument();
        expect(screen.getByText(/cssRules/)).toBeInTheDocument();

        // The actual regression being guarded: something is on screen.
        expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    });

    it('keeps the error in the console so the cause stays diagnosable', () => {
        render(
            <ErrorBoundary>
                <Boom />
            </ErrorBoundary>,
        );

        expect(consoleError).toHaveBeenCalled();
        const logged = consoleError.mock.calls.flat().join(' ');
        expect(logged).toContain('ErrorBoundary');
    });

    it('offers a retry that re-renders the children', () => {
        let shouldThrow = true;
        const Flaky: React.FC = () => {
            if (shouldThrow) throw new Error('transient');
            return <p>recovered</p>;
        };

        render(
            <ErrorBoundary>
                <Flaky />
            </ErrorBoundary>,
        );

        expect(screen.getByRole('alert')).toBeInTheDocument();

        shouldThrow = false;
        fireEvent.click(screen.getByRole('button', { name: /try again/i }));

        expect(screen.getByText('recovered')).toBeInTheDocument();
    });

    it('supports a custom title and fallback', () => {
        render(
            <ErrorBoundary title="Schedule unavailable">
                <Boom />
            </ErrorBoundary>,
        );
        expect(screen.getByText('Schedule unavailable')).toBeInTheDocument();

        render(
            <ErrorBoundary fallback={(error) => <p>custom: {error.message}</p>}>
                <Boom message="nope" />
            </ErrorBoundary>,
        );
        expect(screen.getByText('custom: nope')).toBeInTheDocument();
    });
});
