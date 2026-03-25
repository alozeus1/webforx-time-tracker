import React, { useEffect, useState } from 'react';
import { Menu, Bell, Search, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clearStoredSession, getStoredRole } from '../utils/session';
import api from '../services/api';
import './Navbar.css';

interface NavbarProps {
    onMenuClick: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
    const navigate = useNavigate();
    const role = getStoredRole();
    const [alertCount, setAlertCount] = useState(0);

    useEffect(() => {
        const loadAlertCount = async () => {
            if (role !== 'Admin' && role !== 'Manager') {
                setAlertCount(0);
                return;
            }

            try {
                const response = await api.get<{ notifications: Array<{ is_read: boolean }> }>('/admin/notifications');
                const unread = (response.data.notifications || []).filter((notification) => !notification.is_read).length;
                setAlertCount(unread);
            } catch (error) {
                console.error('Failed to load alert count:', error);
                setAlertCount(0);
            }
        };

        void loadAlertCount();
    }, [role]);

    const handleNotifications = () => {
        if (role === 'Admin' || role === 'Manager') {
            navigate('/admin?tab=notifications');
            return;
        }

        navigate('/reports');
    };

    const handleSignOut = () => {
        clearStoredSession();
        navigate('/login', { replace: true });
    };

    return (
        <header className="top-navbar">
            <div className="navbar-left">
                <button className="menu-trigger" onClick={onMenuClick}>
                    <Menu size={24} />
                </button>
                <div className="search-bar">
                    <Search size={18} className="search-icon" />
                    <input type="text" placeholder="Search projects or tasks..." className="search-input" />
                </div>
            </div>

            <div className="navbar-right">
                <button className="notification-btn" onClick={handleNotifications} title="Open notifications">
                    <Bell size={20} />
                    {alertCount > 0 && <span className="badge">{alertCount > 99 ? '99+' : alertCount}</span>}
                </button>
                <button className="logout-btn" onClick={handleSignOut} title="Sign out">
                    <LogOut size={18} />
                    <span>Sign Out</span>
                </button>
            </div>
        </header>
    );
};

export default Navbar;
