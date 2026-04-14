import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import OnboardingTour, { ONBOARDING_KEY } from './OnboardingTour';
import HelpChatbot from './HelpChatbot';
import AccessibleDialog from './AccessibleDialog';
import { TIMER_IDLE_RESUMED_EVENT, TIMER_IDLE_WARNING_EVENT, TIMER_PAUSED_EVENT, useActiveTimerHeartbeat } from '../hooks/useActiveTimerHeartbeat';
import { useWorkSignals } from '../hooks/useWorkSignals';

import { motion, AnimatePresence } from 'framer-motion';
import { CommandPalette } from './CommandPalette';

const Layout: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        return localStorage.getItem('wfx-sidebar-collapsed') === 'true';
    });
    const [tourKey, setTourKey] = useState(0);
    const [idleWarning, setIdleWarning] = useState<{ inactiveForMinutes: number } | null>(null);
    const [showResumeBanner, setShowResumeBanner] = useState(false);
    const isDemoSession = localStorage.getItem('wfx-email') === 'demo@webforxtech.com';

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
            setShowResumeBanner(true);
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
            await fetch(`${import.meta.env.VITE_API_URL}/timers/resume`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('wfx-token') ?? ''}`,
                },
            });
        } catch {
            // silently fail — state reconciles on next heartbeat sync
        }
        setShowResumeBanner(false);
        setIdleWarning(null);
        window.dispatchEvent(new Event('wfx:timer-entry-changed'));
    };

    const handleDiscardTimer = async () => {
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/timers/stop`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('wfx-token') ?? ''}`,
                },
            });
        } catch {
            // silently fail
        }
        setShowResumeBanner(false);
        setIdleWarning(null);
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

                {showResumeBanner && (
                    <div role="alert" style={{
                        background: '#78350f', color: '#fef3c7',
                        fontSize: '0.875rem', padding: '0.625rem 1.25rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: '1rem', flexWrap: 'wrap', borderBottom: '1px solid #92400e',
                    }}>
                        <span>⏸ Your timer is paused — resume when you're ready.</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                type="button"
                                onClick={handleResumeTimer}
                                style={{
                                    background: '#d97706', border: 'none', color: '#fff',
                                    padding: '0.3rem 0.875rem', borderRadius: '5px',
                                    fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer',
                                }}
                            >
                                Resume Timer
                            </button>
                            <button
                                type="button"
                                onClick={handleDiscardTimer}
                                style={{
                                    background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
                                    color: '#fef3c7', padding: '0.3rem 0.875rem', borderRadius: '5px',
                                    fontSize: '0.8125rem', cursor: 'pointer',
                                }}
                            >
                                I'm done
                            </button>
                        </div>
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
        </div>
    );
};

export default Layout;
