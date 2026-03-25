import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import type { ActiveTimerSummary, TimeEntrySummary, TimerEntriesResponse } from '../types/api';

interface ActivityItem {
    id: string;
    text: string;
    timestamp: string;
}

const formatDuration = (seconds: number) => {
    const safeSeconds = Math.max(seconds, 0);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    if (hours === 0) {
        return `${minutes}m`;
    }

    return `${hours}h ${minutes}m`;
};

const getWeekStart = (date: Date) => {
    const next = new Date(date);
    const day = next.getDay();
    const diff = (day + 6) % 7; // Monday start
    next.setDate(next.getDate() - diff);
    next.setHours(0, 0, 0, 0);
    return next;
};

const Timeline: React.FC = () => {
    const navigate = useNavigate();
    const [entries, setEntries] = useState<TimeEntrySummary[]>([]);
    const [activeTimer, setActiveTimer] = useState<ActiveTimerSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [dateContext] = useState(() => {
        const now = new Date();
        const weekStart = getWeekStart(now);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        return {
            weekStartMs: weekStart.getTime(),
            weekEndMs: weekEnd.getTime(),
            todayStartMs: todayStart.getTime(),
        };
    });

    useEffect(() => {
        const loadTimeline = async () => {
            setLoading(true);
            try {
                const response = await api.get<TimerEntriesResponse>('/timers/me');
                setEntries(response.data.entries || []);
                setActiveTimer(response.data.activeTimer || null);
            } catch (error) {
                console.error('Failed to load timeline:', error);
            } finally {
                setLoading(false);
            }
        };

        void loadTimeline();
    }, []);

    const weekEntries = useMemo(
        () => entries.filter((entry) => {
            const startedAt = new Date(entry.start_time);
            const startedMs = startedAt.getTime();
            return startedMs >= dateContext.weekStartMs && startedMs < dateContext.weekEndMs;
        }),
        [entries, dateContext.weekEndMs, dateContext.weekStartMs],
    );

    const todayEntries = useMemo(
        () => entries.filter((entry) => new Date(entry.start_time).getTime() >= dateContext.todayStartMs),
        [entries, dateContext.todayStartMs],
    );

    const weeklySeconds = weekEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
    const todaySeconds = todayEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
    const weeklyGoalSeconds = 40 * 3600;
    const weeklyGoalPct = Math.min((weeklySeconds / weeklyGoalSeconds) * 100, 100);

    const activity = useMemo<ActivityItem[]>(() => {
        const items: ActivityItem[] = [];

        if (activeTimer) {
            items.push({
                id: `active-${activeTimer.id}`,
                text: `Running timer: ${activeTimer.task_description}${activeTimer.project?.name ? ` on ${activeTimer.project.name}` : ''}`,
                timestamp: activeTimer.start_time,
            });
        }

        entries.slice(0, 6).forEach((entry) => {
            items.push({
                id: entry.id,
                text: `${entry.task_description}${entry.project?.name ? ` for ${entry.project.name}` : ''}`,
                timestamp: entry.start_time,
            });
        });

        return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [entries, activeTimer]);

    return (
        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-background-dark w-full overflow-y-auto">
            <div className="flex flex-wrap justify-between items-center gap-4 p-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 hidden md:flex">
                <div className="flex items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Timeline</h2>
                        <p className="text-sm text-slate-500">
                            {new Date(dateContext.weekStartMs).toLocaleDateString()} - {new Date(dateContext.weekEndMs - 1).toLocaleDateString()}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 border border-transparent hover:border-slate-300"
                        onClick={() => navigate('/reports')}
                    >
                        <span className="material-symbols-outlined text-[18px]">query_stats</span>
                        View Analytics
                    </button>
                    <button
                        className="flex items-center gap-2 bg-primary px-6 py-2 rounded-lg text-sm font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary/90"
                        onClick={() => navigate('/timer')}
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        New Task
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                <main className="flex-1 flex flex-col p-6 overflow-y-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                            <p className="text-sm text-slate-500">Today Logged</p>
                            <p className="text-3xl font-black mt-2 text-slate-900 dark:text-slate-100">
                                {loading ? '...' : formatDuration(todaySeconds)}
                            </p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                            <p className="text-sm text-slate-500">Week Logged</p>
                            <p className="text-3xl font-black mt-2 text-slate-900 dark:text-slate-100">
                                {loading ? '...' : formatDuration(weeklySeconds)}
                            </p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                            <p className="text-sm text-slate-500">Weekly Goal</p>
                            <p className="text-3xl font-black mt-2 text-slate-900 dark:text-slate-100">{Math.round(weeklyGoalPct)}%</p>
                            <div className="mt-3 h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${weeklyGoalPct}%` }}></div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Recent Time Entries</h3>
                            <button
                                className="text-sm font-semibold text-primary hover:underline"
                                onClick={() => navigate('/timer')}
                            >
                                Manage Timer
                            </button>
                        </div>

                        {loading && <p className="px-5 py-8 text-sm text-slate-500">Loading timeline...</p>}
                        {!loading && entries.length === 0 && (
                            <p className="px-5 py-8 text-sm text-slate-500">No entries yet. Start your first timer.</p>
                        )}

                        {!loading && entries.length > 0 && (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {entries.slice(0, 12).map((entry) => (
                                    <div key={entry.id} className="px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                        <div>
                                            <p className="font-bold text-slate-900 dark:text-slate-100">{entry.task_description}</p>
                                            <p className="text-sm text-slate-500">
                                                {entry.project?.name || 'No project'} • {new Date(entry.start_time).toLocaleString()}
                                            </p>
                                        </div>
                                        <span className="inline-flex w-max items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                                            {formatDuration(entry.duration || 0)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>

                <aside className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hidden lg:flex flex-col p-6 gap-8 overflow-y-auto">
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest">Project Activity</h3>
                            <span className="material-symbols-outlined text-slate-400">history</span>
                        </div>
                        <div className="space-y-4">
                            {activity.length === 0 && (
                                <p className="text-sm text-slate-500">No project activity yet.</p>
                            )}
                            {activity.map((item) => (
                                <div key={item.id} className="flex gap-3">
                                    <div className="w-2 h-2 bg-primary rounded-full mt-1.5 shrink-0"></div>
                                    <div>
                                        <p className="text-sm text-slate-700 dark:text-slate-300">{item.text}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">{new Date(item.timestamp).toLocaleString()}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="mt-auto">
                        <div className="bg-primary/5 rounded-xl p-4 border border-primary/20 text-center">
                            <span className="material-symbols-outlined text-primary text-4xl mb-2">stars</span>
                            <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-1">Weekly Summary</h4>
                            <p className="text-xs text-slate-500 mb-4">You&apos;ve logged {formatDuration(weeklySeconds)} this week.</p>
                            <button
                                className="w-full py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-all"
                                onClick={() => navigate('/reports')}
                            >
                                View Analytics
                            </button>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
};

export default Timeline;
