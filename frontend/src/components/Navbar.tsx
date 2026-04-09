import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Menu, Bell, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getStoredRole } from '../utils/session';
import api, { getApiErrorMessage } from '../services/api';
import './Navbar.css';

interface NavbarProps {
    onMenuClick: () => void;
}

interface NotificationItem {
    id: string;
    message: string;
    type: string;
    is_read: boolean;
    read_at?: string | null;
    deleted_at?: string | null;
    created_at: string;
}

interface NotificationsResponse {
    notifications: NotificationItem[];
    unread_count?: number;
    total_count?: number;
}

interface SearchResponse {
    query: string;
    projects: Array<{ id: string; name: string }>;
    tasks: Array<{ name: string; project: { id: string; name: string } | null }>;
}

type SearchResultItem =
    | { key: string; kind: 'project'; label: string; projectId: string }
    | { key: string; kind: 'task'; label: string; taskName: string; projectId?: string };

const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const role = getStoredRole();
    const [alertCount, setAlertCount] = useState(0);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
    const [query, setQuery] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
    const [searchOpen, setSearchOpen] = useState(false);
    const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement | null>(null);
    const notificationRef = useRef<HTMLDivElement | null>(null);
    const searchRequestIdRef = useRef(0);
    const loadNotificationsRef = useRef<(() => Promise<void>) | null>(null);

    const routeLabelMap: Record<string, string> = {
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
        '/settings': 'Settings',
        '/profile': 'Profile',
    };
    const currentLabel = routeLabelMap[location.pathname] || 'Web Forx Time Tracker';

    useEffect(() => {
        const loadNotifications = async () => {
            try {
                const response = await api.get<NotificationsResponse>('/users/me/notifications', {
                    params: { limit: 20 },
                });
                const items = response.data.notifications || [];
                setNotifications(items);
                setAlertCount(response.data.unread_count ?? items.filter((notification) => !notification.is_read).length);
            } catch (error) {
                console.error('Failed to load notifications:', error);
                setNotifications([]);
                setAlertCount(0);
            }
        };

        loadNotificationsRef.current = loadNotifications;
        void loadNotifications();
        return () => {
            loadNotificationsRef.current = null;
        };
    }, [role]);

    useEffect(() => {
        const hasSearchQuery = query.trim().length >= 2;
        if (!hasSearchQuery) {
            setSearchResults([]);
            setSearchError(null);
            setSearchLoading(false);
            setSearchOpen(false);
            setActiveSearchIndex(-1);
            return;
        }

        setSearchLoading(true);
        setSearchError(null);
        const requestId = searchRequestIdRef.current + 1;
        searchRequestIdRef.current = requestId;

        const timeout = window.setTimeout(async () => {
            try {
                const response = await api.get<SearchResponse>('/projects/search', {
                    params: { q: query.trim() },
                });
                if (requestId !== searchRequestIdRef.current) {
                    return;
                }
                const payload = response.data;
                const normalized: SearchResultItem[] = [
                    ...(payload.projects || []).map((project) => ({
                        key: `project-${project.id}`,
                        kind: 'project' as const,
                        label: project.name,
                        projectId: project.id,
                    })),
                    ...(payload.tasks || []).map((task, index) => ({
                        key: `task-${task.name}-${task.project?.id || 'none'}-${index}`,
                        kind: 'task' as const,
                        label: task.project?.name ? `${task.name} • ${task.project.name}` : task.name,
                        taskName: task.name,
                        projectId: task.project?.id,
                    })),
                ];
                setSearchResults(normalized);
                setSearchOpen(true);
                setActiveSearchIndex(normalized.length > 0 ? 0 : -1);
            } catch (error) {
                if (requestId !== searchRequestIdRef.current) {
                    return;
                }
                console.error('Failed to run global search:', error);
                setSearchResults([]);
                setSearchError(getApiErrorMessage(error, 'Search is currently unavailable. Try again shortly.'));
                setSearchOpen(true);
                setActiveSearchIndex(-1);
            } finally {
                if (requestId === searchRequestIdRef.current) {
                    setSearchLoading(false);
                }
            }
        }, 250);

        return () => window.clearTimeout(timeout);
    }, [query]);

    useEffect(() => {
        const onDocumentClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if (searchRef.current && !searchRef.current.contains(target)) {
                setSearchOpen(false);
            }
            if (notificationRef.current && !notificationRef.current.contains(target)) {
                setNotificationsOpen(false);
            }
        };

        document.addEventListener('mousedown', onDocumentClick);
        return () => document.removeEventListener('mousedown', onDocumentClick);
    }, []);

    useEffect(() => {
        if (!notificationsOpen || !loadNotificationsRef.current) {
            return;
        }

        void loadNotificationsRef.current();
    }, [notificationsOpen]);

    useEffect(() => {
        if (!notificationsOpen) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (selectedNotification) {
                    setSelectedNotification(null);
                    return;
                }
                setNotificationsOpen(false);
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [notificationsOpen, selectedNotification]);

    const selectSearchResult = (item: SearchResultItem) => {
        if (item.kind === 'project') {
            navigate(`/timer?projectId=${encodeURIComponent(item.projectId)}`);
        } else {
            const taskParam = `task=${encodeURIComponent(item.taskName)}`;
            const projectParam = item.projectId ? `&projectId=${encodeURIComponent(item.projectId)}` : '';
            navigate(`/timer?${taskParam}${projectParam}`);
        }
        setSearchOpen(false);
    };

    const handleSearchKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
        if (!searchOpen || searchResults.length === 0) {
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveSearchIndex((current) => (current + 1) % searchResults.length);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveSearchIndex((current) => (current <= 0 ? searchResults.length - 1 : current - 1));
            return;
        }

        if (event.key === 'Enter' && activeSearchIndex >= 0) {
            event.preventDefault();
            selectSearchResult(searchResults[activeSearchIndex]);
            return;
        }

        if (event.key === 'Escape') {
            setSearchOpen(false);
        }
    };

    const notificationHint = useMemo(() => 'View notifications', []);

    const unreadNotifications = notifications.filter((notification) => !notification.is_read);
    const readNotifications = notifications.filter((notification) => notification.is_read);

    const syncNotification = (updated: NotificationItem) => {
        setNotifications((current) => {
            const previous = current.find((notification) => notification.id === updated.id);
            const next = current.map((notification) => (notification.id === updated.id ? updated : notification));
            setAlertCount((count) => {
                if (!previous) {
                    return count;
                }
                if (!previous.is_read && updated.is_read) {
                    return Math.max(0, count - 1);
                }
                if (previous.is_read && !updated.is_read) {
                    return count + 1;
                }
                return count;
            });
            return next;
        });
    };

    const removeNotification = (notificationId: string) => {
        setNotifications((current) => {
            const removed = current.find((notification) => notification.id === notificationId);
            const next = current.filter((notification) => notification.id !== notificationId);
            if (removed && !removed.is_read) {
                setAlertCount((count) => Math.max(0, count - 1));
            }
            return next;
        });
        setSelectedNotification((current) => (current?.id === notificationId ? null : current));
    };

    const handleOpenNotification = async (notificationId: string) => {
        try {
            const response = await api.get<{ notification: NotificationItem }>(`/users/me/notifications/${notificationId}`);
            syncNotification(response.data.notification);
            setSelectedNotification(response.data.notification);
        } catch (error) {
            console.error('Failed to open notification:', error);
        }
    };

    const handleDeleteNotification = async (notificationId: string) => {
        try {
            await api.delete(`/users/me/notifications/${notificationId}`);
            removeNotification(notificationId);
        } catch (error) {
            console.error('Failed to delete notification:', error);
        }
    };

    return (
        <header className="top-navbar">
            <div className="navbar-left">
                <button className="menu-trigger" onClick={onMenuClick} type="button" aria-label="Open navigation menu">
                    <Menu size={24} />
                </button>
                <div className="workspace-meta">
                    <p className="workspace-kicker">Workspace</p>
                    <p className="workspace-title">{currentLabel}</p>
                </div>
                <div className="search-wrapper" ref={searchRef}>
                    <div className="search-bar">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search projects or tasks... (Press ⌘K)"
                        className="search-input"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onFocus={() => {
                            if (query.trim().length >= 2 || searchError) {
                                setSearchOpen(true);
                            }
                        }}
                        onKeyDown={handleSearchKeyDown}
                        aria-label="Search projects or tasks"
                        autoComplete="off"
                    />
                    </div>
                    {searchOpen && (
                        <div className="search-dropdown" role="listbox" aria-label="Search results">
                            {searchLoading && (
                                <div className="search-dropdown-state">Searching…</div>
                            )}
                            {!searchLoading && searchError && (
                                <div className="search-dropdown-state search-dropdown-error">{searchError}</div>
                            )}
                            {!searchLoading && !searchError && searchResults.length === 0 && (
                                <div className="search-dropdown-state">No matching projects or tasks.</div>
                            )}
                            {!searchLoading && !searchError && searchResults.length > 0 && searchResults.map((item, index) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    className={`search-result-item ${index === activeSearchIndex ? 'active' : ''}`}
                                    onMouseEnter={() => setActiveSearchIndex(index)}
                                    onClick={() => selectSearchResult(item)}
                                >
                                    <span className="search-result-kind">{item.kind === 'project' ? 'Project' : 'Task'}</span>
                                    <span className="search-result-label">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="navbar-right">
                <button
                    type="button"
                    className="navbar-logo-btn"
                    onClick={() => navigate('/dashboard')}
                    aria-label="Go to Dashboard"
                    title="Go to Dashboard"
                >
                    <img src="/webforx-logo.png" alt="Web Forx" className="navbar-logo-img" />
                </button>

                <div className="notification-wrapper" ref={notificationRef}>
                    <button
                        className="notification-btn"
                        onClick={() => setNotificationsOpen((open) => !open)}
                        title={notificationHint}
                        type="button"
                        aria-label="View notifications"
                        aria-expanded={notificationsOpen}
                        aria-haspopup="dialog"
                        aria-controls="top-notifications-panel"
                    >
                        <Bell size={20} />
                        {alertCount > 0 && (
                            <span className="badge" style={{ animation: 'badge-pulse 2s ease-in-out infinite' }}>
                                {alertCount > 99 ? '99+' : alertCount}
                            </span>
                        )}
                    </button>
                    {notificationsOpen && (
                        <div id="top-notifications-panel" className="notification-dropdown" role="dialog" aria-label="Notifications">
                            <div className="notification-dropdown-header">
                                <p>Notifications</p>
                                {(role === 'Admin' || role === 'Manager') && (
                                    <button type="button" onClick={() => navigate('/admin?tab=notifications')}>
                                        Open All
                                    </button>
                                )}
                            </div>
                            <div className="notification-dropdown-body">
                                {notifications.length === 0 && (
                                    <p className="notification-empty">No recent notifications.</p>
                                )}
                                {selectedNotification && (
                                    <div className="notification-item notification-item-detail">
                                        <div className="notification-item-detail-header">
                                            <div>
                                                <p className="notification-item-type">{selectedNotification.type}</p>
                                                <p className="notification-item-message">{selectedNotification.message}</p>
                                                <p className="notification-item-date">
                                                    {new Date(selectedNotification.created_at).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="notification-item-detail-actions">
                                            <button type="button" onClick={() => setSelectedNotification(null)}>
                                                Back
                                            </button>
                                            <button
                                                type="button"
                                                className="notification-item-delete"
                                                onClick={() => void handleDeleteNotification(selectedNotification.id)}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {!selectedNotification && unreadNotifications.length > 0 && (
                                    <>
                                        <p className="notification-group-label">Unread</p>
                                        {unreadNotifications.map((notification) => (
                                            <div key={notification.id} className="notification-item notification-item-unread">
                                                <button type="button" className="notification-item-content" onClick={() => void handleOpenNotification(notification.id)}>
                                                    <p className="notification-item-type">{notification.type}</p>
                                                    <p className="notification-item-message">{notification.message}</p>
                                                    <p className="notification-item-date">{new Date(notification.created_at).toLocaleString()}</p>
                                                </button>
                                                <button type="button" className="notification-item-delete" onClick={() => void handleDeleteNotification(notification.id)}>
                                                    Delete
                                                </button>
                                            </div>
                                        ))}
                                    </>
                                )}
                                {!selectedNotification && readNotifications.length > 0 && (
                                    <>
                                        <p className="notification-group-label">Read</p>
                                        {readNotifications.map((notification) => (
                                            <div key={notification.id} className="notification-item">
                                                <button type="button" className="notification-item-content" onClick={() => void handleOpenNotification(notification.id)}>
                                                    <p className="notification-item-type">{notification.type}</p>
                                                    <p className="notification-item-message">{notification.message}</p>
                                                    <p className="notification-item-date">{new Date(notification.created_at).toLocaleString()}</p>
                                                </button>
                                                <button type="button" className="notification-item-delete" onClick={() => void handleDeleteNotification(notification.id)}>
                                                    Delete
                                                </button>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Navbar;
