import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Clock, Calendar, FileText, BarChart2,
    Users, Settings, Box, ShieldCheck, X, LogOut, HelpCircle,
    Sun, Moon, Receipt, FolderCog, Globe, CalendarClock, Sparkles,
    ChevronLeft, ChevronRight,
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
    collapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
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

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onStartTour, collapsed, onCollapsedChange }) => {
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

    const sidebarClass = [
        'sidebar',
        isOpen ? 'open' : '',
        collapsed ? 'collapsed' : '',
    ].filter(Boolean).join(' ');

    return (
        <aside className={sidebarClass}>
            {/* ── Header ── */}
            <div className="sidebar-header">
                <button
                    type="button"
                    className="sidebar-logo sidebar-logo-btn"
                    onClick={() => navigate('/dashboard')}
                    aria-label="Go to Dashboard"
                    title="Go to Dashboard"
                >
                    <img src="/webforx-logo.png" alt="Web Forx" className="logo-icon logo-icon-image" />
                    {!collapsed && <span className="logo-text">Time Tracker</span>}
                </button>

                <button
                    className="sidebar-collapse-btn"
                    onClick={() => onCollapsedChange(!collapsed)}
                    type="button"
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>

                <button className="sidebar-close" onClick={onClose} type="button" aria-label="Close navigation">
                    <X size={24} />
                </button>
            </div>

            {/* ── Nav ── */}
            <nav className="sidebar-nav" aria-label="Main navigation">
                {NAV_GROUPS.map((group, groupIndex) => {
                    const visibleItems = group.items.filter(
                        (item) => !item.allowedRoles || hasAnyRole(item.allowedRoles),
                    );
                    if (visibleItems.length === 0) return null;

                    return (
                        <React.Fragment key={groupIndex}>
                            {group.label && !collapsed && (
                                <span className="nav-group-label">{group.label}</span>
                            )}
                            {group.label && collapsed && (
                                <div className="nav-group-divider" />
                            )}
                            {visibleItems.map((item) => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                                    onClick={() => {
                                        if (window.innerWidth <= 768) onClose();
                                    }}
                                    title={collapsed ? item.name : undefined}
                                >
                                    <span className="link-icon">{item.icon}</span>
                                    {!collapsed && <span className="link-text">{item.name}</span>}
                                </NavLink>
                            ))}
                        </React.Fragment>
                    );
                })}
            </nav>

            {/* ── Footer ── */}
            <div className="sidebar-footer">
                <NavLink
                    to="/profile"
                    className="profile-widget"
                    title={collapsed ? `${user?.first_name || ''} ${user?.last_name || ''}` : undefined}
                >
                    <UserAvatar initials={initials} size={40} />
                    {!collapsed && (
                        <div className="user-info">
                            <span className="user-name">{user ? `${user.first_name} ${user.last_name}` : 'Profile'}</span>
                            <span className="user-role">{user?.role || 'User'}</span>
                        </div>
                    )}
                </NavLink>
                <button
                    className="sidebar-link"
                    onClick={() => {
                        onStartTour?.();
                        if (window.innerWidth <= 768) onClose();
                    }}
                    type="button"
                    title={collapsed ? 'Product Tour' : undefined}
                >
                    <span className="link-icon"><HelpCircle size={20} /></span>
                    {!collapsed && <span className="link-text">Product Tour</span>}
                </button>
                <button
                    className="sidebar-link"
                    onClick={toggleTheme}
                    type="button"
                    aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                    title={collapsed ? (isDark ? 'Light Mode' : 'Dark Mode') : undefined}
                >
                    <span className="link-icon">
                        {isDark ? <Sun size={20} /> : <Moon size={20} />}
                    </span>
                    {!collapsed && <span className="link-text">{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
                </button>
                <button
                    className="sidebar-link"
                    onClick={() => {
                        clearStoredSession();
                        navigate('/login', { replace: true });
                    }}
                    type="button"
                    aria-label="Sign out"
                    title={collapsed ? 'Sign Out' : undefined}
                >
                    <span className="link-icon"><LogOut size={20} /></span>
                    {!collapsed && <span className="link-text">Sign Out</span>}
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
