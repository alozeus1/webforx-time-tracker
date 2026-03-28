import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Clock, Calendar, FileText, BarChart2,
    Users, Settings, Box, ShieldCheck, X, LogOut, HelpCircle,
    Sun, Moon, Receipt, FolderCog, Globe, CalendarClock, Sparkles,
} from 'lucide-react';
import './Sidebar.css';
import { clearStoredSession, getStoredUserProfile, hasAnyRole } from '../utils/session';
import UserAvatar from './UserAvatar';

interface NavItem {
    name: string;
    path: string;
    icon: React.ReactNode;
    allowedRoles?: string[];
}

interface NavGroup {
    label?: string;
    items: NavItem[];
}

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    onStartTour?: () => void;
}

const NAV_GROUPS: NavGroup[] = [
    {
        items: [
            { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
            { name: 'Workday', path: '/workday', icon: <Sparkles size={20} /> },
            { name: 'Timer', path: '/timer', icon: <Clock size={20} /> },
        ],
    },
    {
        label: 'INSIGHTS',
        items: [
            { name: 'Timeline', path: '/timeline', icon: <Calendar size={20} /> },
            { name: 'Timesheet', path: '/timesheet', icon: <FileText size={20} /> },
            { name: 'Reports', path: '/reports', icon: <BarChart2 size={20} /> },
        ],
    },
    {
        label: 'BILLING',
        items: [
            { name: 'Invoices', path: '/invoices', icon: <Receipt size={20} />, allowedRoles: ['Manager', 'Admin'] },
            { name: 'Templates', path: '/templates', icon: <FolderCog size={20} />, allowedRoles: ['Manager', 'Admin'] },
            { name: 'Scheduled Reports', path: '/scheduled-reports', icon: <CalendarClock size={20} />, allowedRoles: ['Manager', 'Admin'] },
        ],
    },
    {
        label: 'WORKSPACE',
        items: [
            { name: 'Team', path: '/team', icon: <Users size={20} />, allowedRoles: ['Manager', 'Admin'] },
            { name: 'Admin', path: '/admin', icon: <ShieldCheck size={20} />, allowedRoles: ['Admin'] },
            { name: 'Webhooks', path: '/webhooks', icon: <Globe size={20} />, allowedRoles: ['Admin'] },
            { name: 'Integrations', path: '/integrations', icon: <Box size={20} /> },
            { name: 'Settings', path: '/settings', icon: <Settings size={20} /> },
        ],
    },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onStartTour }) => {
    const navigate = useNavigate();
    const user = getStoredUserProfile();
    const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase() || 'U';

    const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

    const toggleTheme = () => {
        const next = !isDark;
        setIsDark(next);
        if (next) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('wfx-theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('wfx-theme', 'light');
        }
    };

    return (
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <img src="/webforx-logo.png" alt="Web Forx" className="logo-icon logo-icon-image" />
                    <span className="logo-text">Time Tracker</span>
                </div>
                <button className="sidebar-close" onClick={onClose} type="button" aria-label="Close navigation">
                    <X size={24} />
                </button>
            </div>

            <nav className="sidebar-nav">
                {NAV_GROUPS.map((group, groupIndex) => {
                    const visibleItems = group.items.filter(
                        (item) => !item.allowedRoles || hasAnyRole(item.allowedRoles),
                    );
                    if (visibleItems.length === 0) return null;

                    return (
                        <React.Fragment key={groupIndex}>
                            {group.label && (
                                <span className="nav-group-label">{group.label}</span>
                            )}
                            {visibleItems.map((item) => (
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
                        </React.Fragment>
                    );
                })}
            </nav>

            <div className="sidebar-footer">
                <NavLink to="/profile" className="profile-widget">
                    <UserAvatar initials={initials} size={40} />
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
                    className="sidebar-link"
                    onClick={toggleTheme}
                    type="button"
                    aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    <span className="link-icon">
                        {isDark ? <Sun size={20} /> : <Moon size={20} />}
                    </span>
                    <span className="link-text">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
                </button>
                <button
                    className="sidebar-link"
                    onClick={() => {
                        clearStoredSession();
                        navigate('/login', { replace: true });
                    }}
                    type="button"
                    aria-label="Sign out"
                >
                    <span className="link-icon"><LogOut size={20} /></span>
                    <span className="link-text">Sign Out</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
