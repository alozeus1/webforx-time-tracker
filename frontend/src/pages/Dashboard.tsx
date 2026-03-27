import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, TrendingUp } from 'lucide-react';
import api from '../services/api';
import type { NotificationSummary, ProjectSummary, TimeEntrySummary, TimerEntriesResponse } from '../types/api';
import { getStoredRole } from '../utils/session';

const ENTRY_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#0ea5e9'];

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
    const [budgets, setBudgets] = useState<{
        id: string; name: string; budget_hours: number | null;
        hours_used: number; hours_used_pct: number | null; over_budget: boolean;
    }[]>([]);
    const [hoursTrend, setHoursTrend] = useState<string | null>(null);
    const [overtimeAlerts, setOvertimeAlerts] = useState<NotificationSummary[]>([]);
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

            // Fetch dynamic trend data
            try {
                const dashResponse = await api.get<{ metrics: { trends: { hours: string } } }>('/reports/dashboard?range=7d');
                setHoursTrend(dashResponse.data.metrics?.trends?.hours ?? null);
            } catch {
                setHoursTrend(null);
            }

            if (role === 'Admin' || role === 'Manager') {
                const notificationsResponse = await api.get<{ notifications: NotificationSummary[] }>('/admin/notifications');
                const allNotifications = notificationsResponse.data.notifications || [];
                setNotifications(allNotifications.slice(0, 5));

                // Filter overtime alerts from the last 7 days
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                const recentOvertimeAlerts = allNotifications.filter(
                    (n) => n.type === 'overtime_alert' && new Date(n.created_at) >= sevenDaysAgo,
                );
                setOvertimeAlerts(recentOvertimeAlerts);

                try {
                    const budgetResponse = await api.get<{ budgets: typeof budgets }>('/projects/budgets');
                    setBudgets(budgetResponse.data.budgets || []);
                } catch {
                    setBudgets([]);
                }
            } else {
                // Non-admin users: check their own notifications for overtime alerts
                try {
                    const userNotifResponse = await api.get<{ notifications: NotificationSummary[] }>('/admin/notifications');
                    const allUserNotifs = userNotifResponse.data.notifications || [];
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    setOvertimeAlerts(
                        allUserNotifs.filter(
                            (n) => n.type === 'overtime_alert' && new Date(n.created_at) >= sevenDaysAgo,
                        ),
                    );
                } catch {
                    setOvertimeAlerts([]);
                }
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
    const goalReached = progressPercent >= 100;

    // Last completed entry duration for the Live Timer card
    const lastEntry = entries.length > 0 ? entries[0] : null;

    return (
        <div className="flex-1 flex flex-col min-w-0 w-full">
            {/* In-page dashboard header */}
            <header className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-800/85 backdrop-blur-md flex items-center justify-between px-5 py-4 mb-6 shadow-sm hidden md:flex">
                <div className="flex items-center gap-4">
                    <div>
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-slate-500">Overview</p>
                        <h1 className="text-xl font-black text-slate-900 dark:text-slate-100" style={{ fontFamily: 'var(--font-family-display)' }}>Dashboard</h1>
                    </div>
                    {activeTimerStart && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
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
                        aria-label="View alerts"
                    >
                        <span className="material-symbols-outlined">notifications</span>
                        <span className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
                    </button>
                    <button
                        onClick={() => navigate('/timer')}
                        className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                    >
                        <span className="material-symbols-outlined text-sm">add</span>
                        New Entry
                    </button>

                    {notificationsOpen && (
                        <div className="absolute right-0 top-12 w-80 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                <p className="text-sm font-bold dark:text-slate-100">Recent Alerts</p>
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

            <div className="overflow-y-auto">
                <div className="max-w-6xl mx-auto space-y-6">

                    {/* Overtime Alert Banner */}
                    {overtimeAlerts.length > 0 && (
                        <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-5 py-4 shadow-sm">
                            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">warning</span>
                            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                                ⚠️ You exceeded your weekly hour limit this week. Consider taking a break.
                            </p>
                        </div>
                    )}

                    {/* Timer Widget */}
                    <section className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm transition-colors">
                        <div className="flex flex-col lg:flex-row gap-6 items-center">
                            {/* Clock digits + play button */}
                            <div className="flex items-center gap-4 lg:pr-8 lg:border-r border-slate-200 dark:border-slate-700 w-full lg:w-auto justify-center">
                                <div className="flex items-center gap-3">
                                    {/* Digit blocks */}
                                    <div className="flex gap-2">
                                        <div className="bg-slate-100 dark:bg-slate-700 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 text-center">
                                            <span className="text-5xl font-black tracking-tighter" style={{ fontFamily: 'var(--font-family-display)' }}>{clock.hh}</span>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mt-1">HR</p>
                                        </div>
                                        <div className="text-2xl font-bold self-center text-slate-300 dark:text-slate-600">:</div>
                                        <div className="bg-slate-100 dark:bg-slate-700 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 text-center">
                                            <span className="text-5xl font-black tracking-tighter" style={{ fontFamily: 'var(--font-family-display)' }}>{clock.mm}</span>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mt-1">MIN</p>
                                        </div>
                                        <div className="text-2xl font-bold self-center text-slate-300 dark:text-slate-600">:</div>
                                        <div className="bg-slate-100 dark:bg-slate-700 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 text-center">
                                            <span className="text-5xl font-black tracking-tighter" style={{ fontFamily: 'var(--font-family-display)' }}>{clock.ss}</span>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mt-1">SEC</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => navigate('/timer')}
                                        className="btn btn-primary timer-play-btn"
                                        aria-label="Start timer"
                                    >
                                        <span className="material-symbols-outlined text-3xl">{activeTimerStart ? 'pause' : 'play_arrow'}</span>
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Project</label>
                                    <select className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none">
                                        <option value="">Select a project</option>
                                        {projects.map((project) => (
                                            <option key={project.id} value={project.id}>
                                                {project.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Top Project</label>
                                    <div className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm px-3 py-2 text-slate-900 dark:text-slate-100">
                                        {topProject.name} ({formatHours(topProject.seconds)})
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Stat Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                        {/* Daily Goal */}
                        <div className="stat-card bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all cursor-default">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">Daily Goal</span>
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                    <TrendingUp size={12} /> {hoursTrend !== null ? `${hoursTrend} vs last week` : '—'}
                                </span>
                            </div>
                            <div className="text-2xl font-bold mt-3 dark:text-slate-100">
                                {loading ? <div className="skeleton h-8 w-20 rounded" /> : `${(totalSeconds / 3600).toFixed(1)} / 8h`}
                            </div>
                            <div className="mt-4">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-1000"
                                            style={{
                                                width: `${progressPercent}%`,
                                                background: goalReached
                                                    ? 'var(--color-success)'
                                                    : 'linear-gradient(90deg, var(--color-primary), #818cf8)',
                                            }}
                                        />
                                    </div>
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        {Math.round(progressPercent)}%
                                    </span>
                                </div>
                                {goalReached && (
                                    <div className="mt-1.5 flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle size={12} />
                                        Goal reached!
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Projects */}
                        <div className="stat-card bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all cursor-default">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">Projects</span>
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                    <TrendingUp size={12} /> Active
                                </span>
                            </div>
                            <div className="text-2xl font-bold mt-3 dark:text-slate-100">
                                {loading ? <div className="skeleton h-8 w-12 rounded" /> : projects.length}
                            </div>
                        </div>

                        {/* Recent Entries */}
                        <div className="stat-card bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all cursor-default">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">Recent Entries</span>
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-500">
                                    <TrendingUp size={12} /> Today
                                </span>
                            </div>
                            <div className="text-2xl font-bold mt-3 dark:text-slate-100">
                                {loading ? <div className="skeleton h-8 w-12 rounded" /> : entries.length}
                            </div>
                        </div>

                        {/* Live Timer */}
                        <div className="stat-card bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all cursor-default">
                            <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">Live Timer</span>
                            <div className="text-2xl font-bold mt-3 dark:text-slate-100">
                                {loading
                                    ? <div className="skeleton h-8 w-20 rounded" />
                                    : activeTimerStart
                                        ? `${formatClock(liveSeconds).hh}:${formatClock(liveSeconds).mm}`
                                        : 'Stopped'
                                }
                            </div>
                            {!loading && !activeTimerStart && (
                                <>
                                    {lastEntry && (
                                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                            Last session: {formatHours(lastEntry.duration || 0)}
                                        </p>
                                    )}
                                    <button
                                        onClick={() => navigate('/timer')}
                                        className="mt-2 text-xs font-bold text-primary hover:underline"
                                    >
                                        Start Timer →
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Budget Alerts */}
                    {budgets.filter(b => b.budget_hours !== null).length > 0 && (
                        <section className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: 'var(--font-family-display)' }}>
                                    Project Budgets
                                </h3>
                                <span className="text-xs font-semibold text-slate-500">Hours Utilization</span>
                            </div>
                            <div className="space-y-3">
                                {budgets.filter(b => b.budget_hours !== null).map(budget => (
                                    <div key={budget.id} className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{budget.name}</span>
                                            <span className={`text-xs font-bold ${budget.over_budget ? 'text-rose-600' : (budget.hours_used_pct ?? 0) > 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                {budget.hours_used}h / {budget.budget_hours}h ({budget.hours_used_pct ?? 0}%)
                                            </span>
                                        </div>
                                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                            <div
                                                className={`h-full rounded-full transition-all ${budget.over_budget ? 'bg-rose-500' : (budget.hours_used_pct ?? 0) > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                style={{ width: `${Math.min(budget.hours_used_pct ?? 0, 100)}%` }}
                                            />
                                        </div>
                                        {budget.over_budget && (
                                            <p className="text-xs font-semibold text-rose-600 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs">warning</span>
                                                Over budget
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Recent Tasks */}
                    <section className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: 'var(--font-family-display)' }}>
                                Recent Tasks
                            </h3>
                            <button
                                onClick={() => navigate('/timer')}
                                className="text-xs font-semibold text-primary hover:underline"
                            >
                                View Timer
                            </button>
                        </div>
                        {loading ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="skeleton h-10 w-full rounded-lg" />
                                ))}
                            </div>
                        ) : entries.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">No completed tasks yet today.</p>
                        ) : (
                            <div className="space-y-1">
                                {entries.slice(0, 6).map((entry, index) => {
                                    const dotColor = ENTRY_COLORS[index % ENTRY_COLORS.length];
                                    const duration = entry.duration ? formatHours(entry.duration) : '—';
                                    return (
                                        <div
                                            key={entry.id}
                                            className="flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                        >
                                            <div
                                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: dotColor }}
                                            />
                                            <span className="flex-1 text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                                                {entry.task_description}
                                            </span>
                                            {entry.project?.name && (
                                                <span className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                                                    {entry.project.name}
                                                </span>
                                            )}
                                            <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap font-medium tabular-nums">
                                                {duration}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
