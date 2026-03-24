import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Clock, Calendar, FileText, BarChart2, Users, Settings, Box, ShieldCheck, X } from 'lucide-react';
import './Sidebar.css';
import { hasAnyRole } from '../utils/session';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
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
                <button className="sidebar-close" onClick={onClose}>
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
                    <div className="avatar">JD</div>
                    <div className="user-info">
                        <span className="user-name">John Doe</span>
                        <span className="user-role">Engineer</span>
                    </div>
                </NavLink>
            </div>
        </aside>
    );
};

export default Sidebar;
