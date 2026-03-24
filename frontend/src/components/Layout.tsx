import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

const Layout: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = React.useState(false);

    return (
        <div className="app-container">
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <main className="main-content">
                <Navbar onMenuClick={() => setSidebarOpen(true)} />
                <div className="page-wrapper">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
