import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import OnboardingTour, { ONBOARDING_KEY } from './OnboardingTour';
import HelpChatbot from './HelpChatbot';

const Layout: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [tourKey, setTourKey] = useState(0);

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
                <div id="main-content" className="page-wrapper">
                    <Outlet />
                </div>
            </main>

            <OnboardingTour key={tourKey} />
            <HelpChatbot />
        </div>
    );
};

export default Layout;
