import React from 'react';
import { Menu, Bell, Search } from 'lucide-react';
import './Navbar.css';

interface NavbarProps {
    onMenuClick: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
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
                <button className="notification-btn">
                    <Bell size={20} />
                    <span className="badge">3</span>
                </button>
            </div>
        </header>
    );
};

export default Navbar;
