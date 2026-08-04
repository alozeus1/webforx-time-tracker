import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Catches render-time errors so one broken component cannot blank the whole app.
 *
 * WHY THIS EXISTS
 * ----------------
 * The app previously had no error boundary anywhere. React's default behaviour on an
 * uncaught render error is to unmount the entire tree, so any single component throwing
 * produced a completely blank page with no UI indication that anything had gone wrong —
 * the user just saw white, and the only evidence was in the browser console.
 *
 * That is exactly what happened on /schedule: FullCalendar's runtime style injection was
 * blocked by CSP, `styleEl.sheet` came back null, and `sheet.cssRules` threw. The
 * underlying CSP issue is fixed in frontend/vercel.json, but the blast radius was the
 * real problem: a styling failure in one route should degrade to "this section could not
 * load", never to a blank application.
 *
 * This boundary is deliberately dumb — no retry loops, no error reporting side effects.
 * It shows what broke, offers a reload, and keeps the rest of the shell usable.
 */

type Props = {
    children: React.ReactNode;
    /** Shown above the message. Defaults to a generic section label. */
    title?: string;
    /** Optional custom fallback. Receives the error and a reset callback. */
    fallback?: (error: Error, reset: () => void) => React.ReactNode;
};

type State = { error: Error | null };

class ErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        // Keep the console trace — it is how this class of bug gets diagnosed, and
        // swallowing it would trade a blank page for a silent one.
        console.error('[ErrorBoundary] Caught a render error:', error, info.componentStack);
    }

    private reset = (): void => this.setState({ error: null });

    render(): React.ReactNode {
        const { error } = this.state;
        if (!error) return this.props.children;

        if (this.props.fallback) return this.props.fallback(error, this.reset);

        return (
            <div className="flex-1 p-6 md:p-8" role="alert">
                <div className="mx-auto max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-6 dark:border-rose-900/50 dark:bg-rose-900/20">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" size={20} />
                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-rose-900 dark:text-rose-200">
                                {this.props.title || 'This section failed to load'}
                            </h2>
                            <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">
                                Something went wrong while rendering this page. The rest of the app is still usable.
                            </p>
                            <p className="mt-2 break-words font-mono text-xs text-rose-700/80 dark:text-rose-400/80">
                                {error.message}
                            </p>
                            <div className="mt-4 flex gap-2">
                                <button
                                    type="button"
                                    onClick={this.reset}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-900/30"
                                >
                                    <RefreshCw size={14} /> Try again
                                </button>
                                <button
                                    type="button"
                                    onClick={() => window.location.reload()}
                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/30"
                                >
                                    Reload page
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
