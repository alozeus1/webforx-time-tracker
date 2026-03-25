import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import type { NotificationSummary, ProjectSummary, TimeEntrySummary, TimerEntriesResponse } from '../types/api';
import { getStoredRole } from '../utils/session';

const getElapsedSeconds = (startTime: string) =>
    Math.max(Math.floor((Date.now() - new Date(startTime).getTime()) / 1000), 0);

const Dashboard: React.FC = () => {
    const [entries, setEntries] = useState<TimeEntrySummary[]>([]);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [activeTimerStart, setActiveTimerStart] = useState<string | null>(null);
    const [liveSeconds, setLiveSeconds] = useState(0);
    const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const role = getStoredRole();

    const fetchDashboardData = useCallback(async () => {
        setLoading(true);
        try {
            const [timersResponse, projectsResponse] = await Promise.all([
                api.get<TimerEntriesResponse>('/timers/me'),
                api.get<ProjectSummary[]>('/projects'),
            ]);

            setEntries(timersResponse.data.entries || []);
            setProjects(projectsResponse.data || []);

            if (timersResponse.data.activeTimer?.start_time) {
                setActiveTimerStart(timersResponse.data.activeTimer.start_time);
                setLiveSeconds(getElapsedSeconds(timersResponse.data.activeTimer.start_time));
            } else {
                setActiveTimerStart(null);
                setLiveSeconds(0);
            }

            if (role === 'Admin' || role === 'Manager') {
                const notificationsResponse = await api.get<{ notifications: NotificationSummary[] }>('/admin/notifications');
                setNotifications((notificationsResponse.data.notifications || []).slice(0, 5));
            }
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        } finally {
            setLoading(false);
        }
    }, [role]);

    useEffect(() => {
        void fetchDashboardData();
    }, [fetchDashboardData]);

    useEffect(() => {
        if (!activeTimerStart) {
            return;
        }

        const interval = window.setInterval(() => {
            setLiveSeconds(getElapsedSeconds(activeTimerStart));
        }, 1000);

        return () => window.clearInterval(interval);
    }, [activeTimerStart]);

    const completedSeconds = useMemo(
        () => entries.reduce((total, entry) => total + (entry.duration || 0), 0),
        [entries]
    );
    const totalSeconds = completedSeconds + liveSeconds;

    const topProject = useMemo(() => {
        const durations = new Map<string, number>();
        entries.forEach((entry) => {
            if (entry.project?.name) {
                durations.set(entry.project.name, (durations.get(entry.project.name) || 0) + (entry.duration || 0));
            }
        });

        let winner = 'None';
        let winnerSeconds = 0;

        durations.forEach((seconds, name) => {
            if (seconds > winnerSeconds) {
                winner = name;
                winnerSeconds = seconds;
            }
        });

        return { name: winner, seconds: winnerSeconds };
    }, [entries]);

    const formatClock = (seconds: number) => {
        const hh = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const mm = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const ss = (seconds % 60).toString().padStart(2, '0');
        return { hh, mm, ss };
    };

    const formatHours = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    };

    const clock = formatClock(liveSeconds);
    const progressPercent = Math.min((totalSeconds / (8 * 3600)) * 100, 100);

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-background-light dark:bg-background-dark w-full">
            <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10 hidden md:flex">
                <div className="flex items-center gap-4">
                    <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
                    {activeTimerStart && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Timer Running
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3 relative">
                    <button
                        className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg relative"
                        onClick={() => setNotificationsOpen((prev) => !prev)}
                        title="View alerts"
                    >
                        <span className="material-symbols-outlined">notifications</span>
                        <span className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
                    </button>
                    <button
                        onClick={() => navigate('/timer')}
                        className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-primary/90 transition-all"
                    >
                        <span className="material-symbols-outlined text-sm">add</span>
                        New Entry
                    </button>

                    {notificationsOpen && (
                        <div className="absolute right-0 top-12 w-80 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                <p className="text-sm font-bold">Recent Alerts</p>
                                <button
                                    className="text-xs font-semibold text-primary hover:underline"
                                    onClick={() => navigate('/admin?tab=notifications')}
                                >
                                    Open All
                                </button>
                            </div>
                            <div className="max-h-72 overflow-y-auto">
                                {notifications.length === 0 && (
                                    <p className="px-4 py-6 text-sm text-slate-500">No alerts found.</p>
                                )}
                                {notifications.map((notification) => (
                                    <div key={notification.id} className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                                        <p className="text-xs font-semibold text-slate-500">{notification.type}</p>
                                        <p className="text-sm text-slate-900 dark:text-slate-100">{notification.message}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </header>

            <div className="p-8 overflow-y-auto">
                <div className="max-w-6xl mx-auto space-y-8">
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                        <div className="flex flex-col lg:flex-row gap-6 items-center">
                            <div className="flex items-center gap-4 lg:pr-8 lg:border-r border-slate-200 dark:border-slate-800 w-full lg:w-auto justify-center">
                                <div className="text-center">
                                    <div className="flex gap-2">
                                        <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                            <span className="text-3xl font-bold tracking-tighter font-mono">{clock.hh}</span>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1">HR</p>
                                        </div>
                                        <div className="text-2xl font-bold self-center text-slate-300">:</div>
                                        <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                            <span className="text-3xl font-bold tracking-tighter font-mono">{clock.mm}</span>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1">MIN</p>
                                        </div>
                                        <div className="text-2xl font-bold self-center text-slate-300">:</div>
                                        <div className="bg-primary/10 text-primary px-4 py-3 rounded-xl border border-primary/20">
                                            <span className="text-3xl font-bold tracking-tighter font-mono">{clock.ss}</span>
                                            <p className="text-[10px] uppercase tracking-wider text-primary/60 font-semibold mt-1">SEC</p>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => navigate('/timer')}
                                    className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-105 transition-transform"
                                >
                                    <span className="material-symbols-outlined text-3xl">{activeTimerStart ? 'pause' : 'play_arrow'}</span>
                                </button>
                            </div>

                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</label>
                                    <select className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm px-3 py-2 focus:outline-none">
                                        <option value="">Select a project</option>
                                        {projects.map((project) => (
                                            <option key={project.id} value={project.id}>
                                                {project.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Top Project</label>
                                    <div className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm px-3 py-2">
                                        {topProject.name} ({formatHours(topProject.seconds)})
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <span className="text-slate-500 text-sm font-medium">Daily Goal</span>
                            <div className="text-2xl font-bold mt-3">{loading ? '...' : (totalSeconds / 3600).toFixed(1)} / 8h</div>
                            <div className="mt-4 h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%` }}></div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <span className="text-slate-500 text-sm font-medium">Projects</span>
                            <div className="text-2xl font-bold mt-3">{loading ? '...' : projects.length}</div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <span className="text-slate-500 text-sm font-medium">Recent Entries</span>
                            <div className="text-2xl font-bold mt-3">{loading ? '...' : entries.length}</div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <span className="text-slate-500 text-sm font-medium">Live Timer</span>
                            <div className="text-2xl font-bold mt-3">{activeTimerStart ? formatClock(liveSeconds).hh + ':' + formatClock(liveSeconds).mm : 'Stopped'}</div>
                        </div>
                    </div>

                    <section className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Recent Tasks</h3>
                            <button
                                onClick={() => navigate('/timer')}
                                className="text-xs font-semibold text-primary hover:underline"
                            >
                                View Timer
                            </button>
                        </div>
                        {entries.length === 0 ? (
                            <p className="text-sm text-slate-500">No completed tasks yet today.</p>
                        ) : (
                            <div className="space-y-2">
                                {entries.slice(0, 6).map((entry) => (
                                    <div key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                                        {entry.task_description}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
