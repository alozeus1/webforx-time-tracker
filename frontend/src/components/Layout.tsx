import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import OnboardingTour, { ONBOARDING_KEY } from './OnboardingTour';
import HelpChatbot from './HelpChatbot';
import AccessibleDialog from './AccessibleDialog';
import ResumeConfirmDialog from './ResumeConfirmDialog';
import { TIMER_IDLE_RESUMED_EVENT, TIMER_IDLE_WARNING_EVENT, TIMER_PAUSED_EVENT, useActiveTimerHeartbeat } from '../hooks/useActiveTimerHeartbeat';
import { useWorkSignals } from '../hooks/useWorkSignals';
import api from '../services/api';
import type { TimerEntriesResponse } from '../types/api';
import { getStoredToken } from '../utils/session';
import { emitTimeEntryChanged } from '../utils/timeEntryEvents';

import { motion, AnimatePresence } from 'framer-motion';
import { CommandPalette } from './CommandPalette';

interface PausedTimerState {
    taskDescription: string;
    projectName?: string;
}

const Layout: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        return localStorage.getItem('wfx-sidebar-collapsed') === 'true';
    });
    const [tourKey, setTourKey] = useState(0);
    const [idleWarning, setIdleWarning] = useState<{ inactiveForMinutes: number } | null>(null);
    const [showResumeDialog, setShowResumeDialog] = useState(false);
    const [pausedTimer, setPausedTimer] = useState<PausedTimerState | null>(null);
    const isDemoSession = localStorage.getItem('wfx-email') === 'demo@webforxtech.com';

    const navigate = useNavigate();

    const handleCollapsedChange = (next: boolean) => {
        setSidebarCollapsed(next);
        localStorage.setItem('wfx-sidebar-collapsed', String(next));
    };
    const location = useLocation();

    useActiveTimerHeartbeat();
    useWorkSignals();

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
            const detail = (event as CustomEvent<{ inactiveForMinutes?: number }>).detail;
            setIdleWarning({
                inactiveForMinutes: detail?.inactiveForMinutes ?? 0,
            });
        };

        const onIdleResumed = () => {
            setIdleWarning(null);
        };

        const onTimerPaused = () => {
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

        window.addEventListener(TIMER_IDLE_WARNING_EVENT, onIdleWarning as EventListener);
        window.addEventListener(TIMER_IDLE_RESUMED_EVENT, onIdleResumed);
        window.addEventListener(TIMER_PAUSED_EVENT, onTimerPaused);

        return () => {
            window.removeEventListener(TIMER_IDLE_WARNING_EVENT, onIdleWarning as EventListener);
            window.removeEventListener(TIMER_IDLE_RESUMED_EVENT, onIdleResumed);
            window.removeEventListener(TIMER_PAUSED_EVENT, onTimerPaused);
        };
    }, []);

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

            {/* Idle warning dialog — shown when frontend detects 5+ min of inactivity */}
            <AccessibleDialog
                isOpen={Boolean(idleWarning)}
                onClose={() => setIdleWarning(null)}
                ariaLabel="Timer paused"
                panelClassName="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            >
                <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Timer Paused</p>
                    <h2 className="text-xl font-bold text-slate-900">Your timer has been paused</h2>
                    <p className="text-sm text-slate-600">
                        No activity detected for {idleWarning?.inactiveForMinutes ?? 0} minute(s).
                        Your time up to this point is saved — resume when you're back.
                    </p>
                    <div className="flex gap-3 justify-end">
                        <button
                            type="button"
                            className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
                            onClick={handleDiscardTimer}
                        >
                            I'm done for now
                        </button>
                        <button
                            type="button"
                            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                            onClick={handleResumeTimer}
                        >
                            Resume Timer
                        </button>
                    </div>
                </div>
            </AccessibleDialog>

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
