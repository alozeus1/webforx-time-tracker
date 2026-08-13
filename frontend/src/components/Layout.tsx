import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import OnboardingTour, { ONBOARDING_KEY } from './OnboardingTour';
import HelpChatbot from './HelpChatbot';
import AccessibleDialog from './AccessibleDialog';
import ResumeConfirmDialog from './ResumeConfirmDialog';
import DailyCapDialog, { type DailyCapDialogMode } from './DailyCapDialog';
import {
    TIMER_DAILY_CAP_EVENT,
    TIMER_DAILY_FLOOR_EVENT,
    TIMER_IDLE_RESUMED_EVENT,
    TIMER_IDLE_WARNING_EVENT,
    TIMER_PAUSED_EVENT,
    useActiveTimerHeartbeat,
} from '../hooks/useActiveTimerHeartbeat';
import { useWorkSignals } from '../hooks/useWorkSignals';
import api from '../services/api';
import type { DailyCapSummary, TimerEntriesResponse } from '../types/api';
import { getStoredToken } from '../utils/session';
import { emitTimeEntryChanged } from '../utils/timeEntryEvents';
import { usePageMetadata } from '../hooks/usePageMetadata';

import { motion, AnimatePresence } from 'framer-motion';
import { CommandPalette } from './CommandPalette';
import PwaStatus from './PwaStatus';

interface PausedTimerState {
    taskDescription: string;
    projectName?: string;
}

/**
 * The soft intern nudge is shown at most once per local day. Persisted in
 * localStorage rather than component state so it survives a reload — otherwise
 * someone who refreshes mid-afternoon gets nagged again.
 */
const FLOOR_NUDGE_KEY = 'wfx:daily-floor-nudge';

const floorNudgeSeenToday = (localDate: string): boolean => {
    try {
        return window.localStorage.getItem(FLOOR_NUDGE_KEY) === localDate;
    } catch {
        return false;
    }
};

const markFloorNudgeSeen = (localDate: string): void => {
    try {
        window.localStorage.setItem(FLOOR_NUDGE_KEY, localDate);
    } catch {
        // Private-mode storage failures must not break the timer.
    }
};

const Layout: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        return localStorage.getItem('wfx-sidebar-collapsed') === 'true';
    });
    const [tourKey, setTourKey] = useState(0);
    const [idleWarning, setIdleWarning] = useState<{ inactiveForMs: number } | null>(null);
    const [showResumeDialog, setShowResumeDialog] = useState(false);
    const [pausedTimer, setPausedTimer] = useState<PausedTimerState | null>(null);
    const [dailyCap, setDailyCap] = useState<DailyCapSummary | null>(null);
    const [dailyCapMode, setDailyCapMode] = useState<DailyCapDialogMode>('cap');
    const [dailyCapSubmitting, setDailyCapSubmitting] = useState(false);
    const isDemoSession = localStorage.getItem('wfx-email') === 'demo@webforxtech.com';

    const navigate = useNavigate();

    const handleCollapsedChange = (next: boolean) => {
        setSidebarCollapsed(next);
        localStorage.setItem('wfx-sidebar-collapsed', String(next));
    };
    const location = useLocation();

    useActiveTimerHeartbeat();
    useWorkSignals();
    usePageMetadata({
        title: 'Workspace | Web Forx Time Tracker',
        description: 'Authenticated Web Forx Time Tracker workspace for team time tracking, reporting, approvals, and administration.',
        canonical: location.pathname,
        noIndex: true,
    });

    useEffect(() => {
        const routeTitles: Record<string, string> = {
            '/dashboard': 'Dashboard',
            '/workday': 'Workday',
            '/timer': 'Timer',
            '/timeline': 'Timeline',
            '/timesheet': 'Timesheet',
            '/reports': 'Reports',
            '/team': 'Team',
            '/admin': 'Admin',
            '/invoices': 'Invoices',
            '/templates': 'Templates',
            '/scheduled-reports': 'Scheduled Reports',
            '/webhooks': 'Webhooks',
            '/integrations': 'Integrations',
            '/integrations/taiga': 'Integrations',
            '/integrations/mattermost': 'Integrations',
            '/settings': 'Settings',
            '/profile': 'Profile',
        };

        const titleRoot = routeTitles[location.pathname] ?? 'Workspace';
        document.title = `${titleRoot} | Web Forx Time Tracker`;
    }, [location.pathname]);

    useEffect(() => {
        const onIdleWarning = (event: Event) => {
            // On the /timer route, Timer.tsx renders its own inline warning banner —
            // suppress this modal to avoid duplicate warnings and blocked UI.
            if (location.pathname === '/timer') return;
            const detail = (event as CustomEvent<{ inactiveForMs?: number }>).detail;
            setIdleWarning({
                inactiveForMs: detail?.inactiveForMs ?? 0,
            });
        };

        const onIdleResumed = () => {
            setIdleWarning(null);
        };

        const onTimerPaused = (event: Event) => {
            // A deliberate pause (the user pressed Pause) needs no confirmation
            // dialog — only auto-pauses (idle, tab closed, server enforced) do.
            const reason = (event as CustomEvent<{ reason?: string | null }>).detail?.reason;
            if (reason === 'user_requested') return;
            setIdleWarning(null);
            // Fetch the active timer to show task/project name in the confirmation dialog
            void api.get<TimerEntriesResponse>('/timers/me').then(({ data }) => {
                if (data.activeTimer) {
                    setPausedTimer({
                        taskDescription: data.activeTimer.task_description,
                        projectName: data.activeTimer.project?.name ?? undefined,
                    });
                } else {
                    setPausedTimer({ taskDescription: 'your current task' });
                }
            }).catch(() => {
                setPausedTimer({ taskDescription: 'your current task' });
            });
            setShowResumeDialog(true);
        };

        const onDailyCap = (event: Event) => {
            const detail = (event as CustomEvent<DailyCapSummary>).detail;
            if (!detail) return;
            setDailyCap(detail);
            setDailyCapMode('cap');
        };

        const onDailyFloor = (event: Event) => {
            const detail = (event as CustomEvent<DailyCapSummary>).detail;
            if (!detail || floorNudgeSeenToday(detail.localDate)) return;
            markFloorNudgeSeen(detail.localDate);
            setDailyCap(detail);
            setDailyCapMode('floor');
        };

        window.addEventListener(TIMER_IDLE_WARNING_EVENT, onIdleWarning as EventListener);
        window.addEventListener(TIMER_IDLE_RESUMED_EVENT, onIdleResumed);
        window.addEventListener(TIMER_PAUSED_EVENT, onTimerPaused);
        window.addEventListener(TIMER_DAILY_CAP_EVENT, onDailyCap as EventListener);
        window.addEventListener(TIMER_DAILY_FLOOR_EVENT, onDailyFloor as EventListener);

        return () => {
            window.removeEventListener(TIMER_IDLE_WARNING_EVENT, onIdleWarning as EventListener);
            window.removeEventListener(TIMER_IDLE_RESUMED_EVENT, onIdleResumed);
            window.removeEventListener(TIMER_PAUSED_EVENT, onTimerPaused);
            window.removeEventListener(TIMER_DAILY_CAP_EVENT, onDailyCap as EventListener);
            window.removeEventListener(TIMER_DAILY_FLOOR_EVENT, onDailyFloor as EventListener);
        };
    }, [location.pathname]);

    /**
     * Report the browser's timezone once per session so the server can compute this
     * user's day and week boundaries. Without it every daily limit would silently fall
     * back to UTC, which resets mid-afternoon for anyone in the Americas.
     */
    useEffect(() => {
        if (!getStoredToken()) return;

        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!zone) return;

        const storageKey = 'wfx:reported-timezone';
        try {
            if (window.localStorage.getItem(storageKey) === zone) return;
        } catch {
            // Fall through and report anyway — a redundant PUT is harmless.
        }

        void api.put('/users/me', { timezone: zone })
            .then(() => {
                try {
                    window.localStorage.setItem(storageKey, zone);
                } catch {
                    // Non-fatal.
                }
            })
            .catch(() => {
                // A failed timezone report must never block the app; the server keeps
                // using the previous value (or UTC).
            });
    }, []);

    /**
     * "Stop for today" from either tier of the daily-limit dialog. Stops the running
     * timer outright; the entry keeps whatever flags it already had.
     */
    const handleStopForToday = async () => {
        setDailyCap(null);
        try {
            await api.post('/timers/stop');
            emitTimeEntryChanged();
        } catch {
            // A 404 just means the timer was already stopped elsewhere.
        }
    };

    /**
     * "Submit and continue" — the user attested to working past their daily cap.
     *
     * The running session is stopped and restarted carrying the attestation, because
     * the flag has to live on the ActiveTimer for the entry created at stop to inherit
     * it. The cost is one extra entry boundary at the cap, which is also the honest
     * representation: normal hours and over-cap hours are separate rows, and only the
     * second one is flagged for review.
     */
    const handleContinuePastCap = async (reason: string) => {
        setDailyCapSubmitting(true);
        try {
            const { data } = await api.get<TimerEntriesResponse>('/timers/me');
            const running = data.activeTimer;

            await api.post('/timers/stop').catch(() => undefined);

            if (running) {
                await api.post('/timers/start', {
                    task_description: running.task_description,
                    project_id: running.project?.id ?? null,
                    overtime_ack: { acknowledged: true, reason },
                });
            }

            emitTimeEntryChanged();
            setDailyCap(null);
        } catch {
            // The stop above has already committed, so no time is lost — the user
            // simply is not tracking any more. Close the prompt and let the page
            // refresh rather than leaving them staring at a dead dialog.
            emitTimeEntryChanged();
            setDailyCap(null);
        } finally {
            setDailyCapSubmitting(false);
        }
    };

    const handleResumeTimer = async () => {
        try {
            const token = getStoredToken();
            if (token) {
                await api.post('/timers/resume');
            }
        } catch {
            // silently fail — state reconciles on next heartbeat sync
        }
        setShowResumeDialog(false);
        setPausedTimer(null);
        setIdleWarning(null);
        emitTimeEntryChanged();
    };

    const handleStillWorking = async () => {
        try {
            const token = getStoredToken();
            if (token) {
                await api.post('/timers/ping', {
                    last_activity_at: new Date().toISOString(),
                    visibility_state: typeof document === 'undefined' ? 'visible' : document.visibilityState,
                    has_focus: typeof document === 'undefined' ? true : document.hasFocus(),
                });
            }
        } catch {
            // state reconciles on the next heartbeat
        }
        setIdleWarning(null);
        window.dispatchEvent(new CustomEvent(TIMER_IDLE_RESUMED_EVENT));
        emitTimeEntryChanged();
    };

    const handlePauseNow = async () => {
        try {
            const token = getStoredToken();
            if (token) {
                await api.post('/timers/pause');
            }
        } catch {
            // state reconciles on the next heartbeat
        }
        setIdleWarning(null);
        emitTimeEntryChanged();
    };

    const handleAddNote = () => {
        setIdleWarning(null);
        navigate('/timer?correction=1');
    };

    const handleDiscardTimer = async () => {
        try {
            const token = getStoredToken();
            if (token) {
                await api.post('/timers/stop');
            }
        } catch {
            // silently fail
        }
        setShowResumeDialog(false);
        setPausedTimer(null);
        setIdleWarning(null);
        emitTimeEntryChanged();
    };

    const handleSwitchTask = async () => {
        await handleDiscardTimer();
        navigate('/timer');
    };

    const restartTour = () => {
        localStorage.removeItem(ONBOARDING_KEY);
        setTourKey((k) => k + 1);
    };

    return (
        <div className={`app-container${sidebarCollapsed ? ' sidebar-is-collapsed' : ''}`}>
            <Sidebar
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                onStartTour={restartTour}
                collapsed={sidebarCollapsed}
                onCollapsedChange={handleCollapsedChange}
            />
            {sidebarOpen && (
                <button
                    type="button"
                    className="layout-mobile-overlay"
                    onClick={() => setSidebarOpen(false)}
                    aria-label="Close navigation menu"
                />
            )}

            <main className="main-content">
                <Navbar onMenuClick={() => setSidebarOpen(true)} />
                <PwaStatus />

                {isDemoSession && (
                    <div role="status" style={{
                        background: '#1e1b4b', color: '#a5b4fc',
                        fontSize: '0.8125rem', textAlign: 'center',
                        padding: '0.5rem 1rem', borderBottom: '1px solid rgba(165,180,252,0.2)',
                    }}>
                        Demo session — data resets every 24 hours.{' '}
                        <Link to="/request-access" style={{ color: '#818cf8', fontWeight: 600 }}>
                            Request access to get your own workspace →
                        </Link>
                    </div>
                )}

                <div id="main-content" className="page-wrapper overflow-x-hidden" tabIndex={-1}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="w-full h-full"
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>

            <CommandPalette />
            <OnboardingTour key={tourKey} />
            <HelpChatbot />

            {/* Idle warning dialog — shown before server idle pause thresholds are reached */}
            <AccessibleDialog
                isOpen={Boolean(idleWarning)}
                onClose={() => setIdleWarning(null)}
                ariaLabel="Timer idle warning"
                panelClassName="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            >
                <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Idle Warning</p>
                    <h2 className="text-xl font-bold text-slate-900">Still working?</h2>
                    <p className="text-sm text-slate-600">
                        No activity detected for {Math.round((idleWarning?.inactiveForMs ?? 0) / 60_000)} minute(s).
                        Your timer may pause soon if activity does not resume.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
                            onClick={handleAddNote}
                        >
                            Add note
                        </button>
                        <button
                            type="button"
                            className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
                            onClick={handlePauseNow}
                        >
                            Pause now
                        </button>
                        <button
                            type="button"
                            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                            onClick={handleStillWorking}
                        >
                            I'm still working
                        </button>
                    </div>
                </div>
            </AccessibleDialog>

            {/* Daily limits — soft nudge at an intern's floor, hard attestation at the cap */}
            <DailyCapDialog
                isOpen={Boolean(dailyCap)}
                mode={dailyCapMode}
                workedSeconds={dailyCap?.workedSeconds ?? 0}
                capSeconds={dailyCap?.capSeconds ?? 0}
                floorSeconds={dailyCap?.floorSeconds ?? 0}
                submitting={dailyCapSubmitting}
                onDismiss={() => setDailyCap(null)}
                onStop={handleStopForToday}
                onContinue={handleContinuePastCap}
            />

            {/* Resume confirmation — shown when server signals timer was auto-paused */}
            <ResumeConfirmDialog
                isOpen={showResumeDialog && Boolean(pausedTimer)}
                taskDescription={pausedTimer?.taskDescription ?? 'your current task'}
                projectName={pausedTimer?.projectName}
                onResume={handleResumeTimer}
                onSwitchTask={handleSwitchTask}
                onStop={handleDiscardTimer}
            />
        </div>
    );
};

export default Layout;
