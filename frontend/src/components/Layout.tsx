import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import OnboardingTour, { ONBOARDING_KEY } from './OnboardingTour';
import HelpChatbot from './HelpChatbot';
import { useActiveTimerHeartbeat } from '../hooks/useActiveTimerHeartbeat';
import { useWorkSignals } from '../hooks/useWorkSignals';

const Layout: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        return localStorage.getItem('wfx-sidebar-collapsed') === 'true';
    });
    const [tourKey, setTourKey] = useState(0);

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
                <div id="main-content" className="page-wrapper" tabIndex={-1}>
                    <Outlet />
                </div>
            </main>

            <OnboardingTour key={tourKey} />
            <HelpChatbot />
        </div>
    );
};

export default Layout;
