import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Clock, Calendar, FileText, BarChart2, Users, Settings, Box, ShieldCheck, X, LogOut, HelpCircle } from 'lucide-react';
import './Sidebar.css';
import { clearStoredSession, getStoredUserProfile, hasAnyRole } from '../utils/session';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    onStartTour?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onStartTour }) => {
    const navigate = useNavigate();
    const user = getStoredUserProfile();
    const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase() || 'U';

    const navItems = [
        { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
        { name: 'Timer', path: '/timer', icon: <Clock size={20} /> },
        { name: 'Timeline', path: '/timeline', icon: <Calendar size={20} /> },
        { name: 'Timesheet', path: '/timesheet', icon: <FileText size={20} /> },
        { name: 'Reports', path: '/reports', icon: <BarChart2 size={20} /> },
        { name: 'Team', path: '/team', icon: <Users size={20} />, allowedRoles: ['Manager', 'Admin'] },
        { name: 'Admin', path: '/admin', icon: <ShieldCheck size={20} />, allowedRoles: ['Admin'] },
        { name: 'Integrations', path: '/integrations', icon: <Box size={20} /> },
        { name: 'Settings', path: '/settings', icon: <Settings size={20} /> },
    ].filter((item) => !item.allowedRoles || hasAnyRole(item.allowedRoles));

    return (
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="logo-icon">TF</div>
                    <span className="logo-text">Time Tracker</span>
                </div>
                <button className="sidebar-close" onClick={onClose} type="button" aria-label="Close navigation">
                    <X size={24} />
                </button>
            </div>

            <nav className="sidebar-nav">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                        onClick={() => {
                            if (window.innerWidth <= 768) onClose();
                        }}
                    >
                        <span className="link-icon">{item.icon}</span>
                        <span className="link-text">{item.name}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-footer">
                <NavLink to="/profile" className="profile-widget">
                    <div className="avatar">{initials}</div>
                    <div className="user-info">
                        <span className="user-name">{user ? `${user.first_name} ${user.last_name}` : 'Profile'}</span>
                        <span className="user-role">{user?.role || 'User'}</span>
                    </div>
                </NavLink>
                <button
                    className="sidebar-link"
                    onClick={() => {
                        onStartTour?.();
                        if (window.innerWidth <= 768) onClose();
                    }}
                    type="button"
                >
                    <span className="link-icon"><HelpCircle size={20} /></span>
                    <span className="link-text">Product Tour</span>
                </button>
                <button
                    className="sidebar-link mt-2"
                    onClick={() => {
                        clearStoredSession();
                        navigate('/login', { replace: true });
                    }}
                    type="button"
                >
                    <span className="link-icon"><LogOut size={20} /></span>
                    <span className="link-text">Sign Out</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
