import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import OnboardingTour, { ONBOARDING_KEY } from './OnboardingTour';
import HelpChatbot from './HelpChatbot';
import AccessibleDialog from './AccessibleDialog';
import { TIMER_IDLE_RESUMED_EVENT, TIMER_IDLE_WARNING_EVENT, useActiveTimerHeartbeat } from '../hooks/useActiveTimerHeartbeat';
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

        window.addEventListener(TIMER_IDLE_WARNING_EVENT, onIdleWarning as EventListener);
        window.addEventListener(TIMER_IDLE_RESUMED_EVENT, onIdleResumed);

        return () => {
            window.removeEventListener(TIMER_IDLE_WARNING_EVENT, onIdleWarning as EventListener);
            window.removeEventListener(TIMER_IDLE_RESUMED_EVENT, onIdleResumed);
        };
    }, []);

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
                ariaLabel="Idle timer warning"
                panelClassName="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            >
                <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Timer Warning</p>
                    <h2 className="text-xl font-bold text-slate-900">Your timer may stop soon</h2>
                    <p className="text-sm text-slate-600">
                        We have not detected activity for {idleWarning?.inactiveForMinutes ?? 0} minute(s). Resume activity to keep the timer running.
                    </p>
                    <div className="flex justify-end">
                        <button
                            type="button"
                            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                            onClick={() => setIdleWarning(null)}
                        >
                            Got it
                        </button>
                    </div>
                </div>
            </AccessibleDialog>
        </div>
    );
};

export default Layout;
