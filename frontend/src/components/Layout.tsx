import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import OnboardingTour, { ONBOARDING_KEY } from './OnboardingTour';
import HelpChatbot from './HelpChatbot';

const Layout: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [tourKey, setTourKey] = useState(0);
    const location = useLocation();

    useEffect(() => {
        const routeTitles: Record<string, string> = {
            '/dashboard': 'Dashboard',
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
        <div className="app-container">
            <Sidebar
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                onStartTour={restartTour}
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
