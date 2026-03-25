import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import type { ActiveTimerSummary, TimeEntrySummary, TimerEntriesResponse } from '../types/api';

interface ActivityItem {
    id: string;
    text: string;
    timestamp: string;
}

const getStartOfDay = (date: Date) => {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
};

const getStartOfWeek = (date: Date) => {
    const value = getStartOfDay(date);
    const day = value.getDay();
    const diff = (day + 6) % 7; // Monday
    value.setDate(value.getDate() - diff);
    return value;
};

const toDayLabel = (date: Date) => date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
const toWeekNumber = (date: Date) => {
    const start = new Date(date.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86400000) + 1;
    return Math.ceil(dayOfYear / 7);
};

const formatDuration = (seconds: number) => {
    const safe = Math.max(seconds, 0);
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const Timeline: React.FC = () => {
    const navigate = useNavigate();
    const [entries, setEntries] = useState<TimeEntrySummary[]>([]);
    const [activeTimer, setActiveTimer] = useState<ActiveTimerSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(() => getStartOfDay(new Date()));
    const [showOnlyCurrentDay, setShowOnlyCurrentDay] = useState(true);

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

    const weekStart = useMemo(() => getStartOfWeek(currentDate), [currentDate]);
    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, index) => {
            const next = new Date(weekStart);
            next.setDate(weekStart.getDate() + index);
            return next;
        }),
        [weekStart],
    );

    const dayStart = useMemo(() => getStartOfDay(currentDate), [currentDate]);
    const nextDayStart = useMemo(() => {
        const next = new Date(dayStart);
        next.setDate(next.getDate() + 1);
        return next;
    }, [dayStart]);

    const weekEnd = useMemo(() => {
        const next = new Date(weekStart);
        next.setDate(next.getDate() + 7);
        return next;
    }, [weekStart]);

    const weekEntries = useMemo(
        () => entries.filter((entry) => {
            const start = new Date(entry.start_time);
            return start >= weekStart && start < weekEnd;
        }),
        [entries, weekEnd, weekStart],
    );

    const dayEntries = useMemo(
        () => entries.filter((entry) => {
            const start = new Date(entry.start_time);
            return start >= dayStart && start < nextDayStart;
        }),
        [entries, dayStart, nextDayStart],
    );

    const displayedEntries = useMemo(
        () => (showOnlyCurrentDay ? dayEntries : weekEntries).slice().sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime()),
        [dayEntries, showOnlyCurrentDay, weekEntries],
    );

    const activity = useMemo<ActivityItem[]>(() => {
        const items: ActivityItem[] = [];
        if (activeTimer) {
            items.push({
                id: `active-${activeTimer.id}`,
                text: `Running: ${activeTimer.task_description}${activeTimer.project?.name ? ` on ${activeTimer.project.name}` : ''}`,
                timestamp: activeTimer.start_time,
            });
        }

        displayedEntries.slice(0, 8).forEach((entry) => {
            items.push({
                id: entry.id,
                text: `${entry.task_description}${entry.project?.name ? ` for ${entry.project.name}` : ''}`,
                timestamp: entry.start_time,
            });
        });

        return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [activeTimer, displayedEntries]);

    const today = getStartOfDay(new Date());
    const isCurrentDateToday = dayStart.getTime() === today.getTime();
    const totalSeconds = displayedEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
    const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const currentLineTopPercent = Math.min((currentMinutes / (24 * 60)) * 100, 100);

    const moveDay = (delta: number) => {
        setCurrentDate((prev) => {
            const next = new Date(prev);
            next.setDate(next.getDate() + delta);
            return getStartOfDay(next);
        });
    };

    return (
        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-background-dark w-full overflow-y-auto">
            <div className="flex flex-wrap justify-between items-center gap-4 p-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 hidden md:flex">
                <div className="flex items-center gap-4">
                    <button
                        className="flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50"
                        onClick={() => moveDay(-1)}
                        title="Previous day"
                    >
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <div className="text-center">
                        <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{toDayLabel(currentDate)}</h2>
                        <p className="text-sm text-slate-500">Week {toWeekNumber(currentDate)} of {currentDate.getFullYear()}</p>
                    </div>
                    <button
                        className="flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50"
                        onClick={() => moveDay(1)}
                        title="Next day"
                    >
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                    <button
                        className="ml-2 px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg"
                        onClick={() => setCurrentDate(today)}
                    >
                        Today
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 border border-transparent hover:border-slate-300"
                        onClick={() => setShowOnlyCurrentDay((value) => !value)}
                        title={showOnlyCurrentDay ? 'Showing selected day only' : 'Showing full week'}
                    >
                        <span className="material-symbols-outlined text-[18px]">filter_list</span>
                        Filter
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
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden relative">
                        {isCurrentDateToday && (
                            <div className="absolute w-full border-t-2 border-rose-500 z-10" style={{ top: `${currentLineTopPercent}%` }}>
                                <div className="absolute -left-2 -top-1 w-3 h-3 rounded-full bg-rose-500 ring-4 ring-rose-500/20"></div>
                                <div className="absolute left-[85px] -top-3 px-2 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full">
                                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        )}

                        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                    {showOnlyCurrentDay ? 'Selected Day Entries' : 'Week Entries'}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {formatDuration(totalSeconds)} logged • {displayedEntries.length} entries
                                </p>
                            </div>
                            <button
                                className="text-sm font-semibold text-primary hover:underline"
                                onClick={() => navigate('/reports')}
                            >
                                View Analytics
                            </button>
                        </div>

                        {loading && <p className="px-5 py-8 text-sm text-slate-500">Loading timeline...</p>}
                        {!loading && displayedEntries.length === 0 && (
                            <div className="px-5 py-8">
                                <p className="text-sm text-slate-500 mb-4">No entries for this range yet.</p>
                                <button
                                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary/90"
                                    onClick={() => navigate('/timer')}
                                >
                                    <span className="material-symbols-outlined text-base">add</span>
                                    Add Entry
                                </button>
                            </div>
                        )}

                        {!loading && displayedEntries.length > 0 && (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {displayedEntries.map((entry) => (
                                    <div key={entry.id} className="px-5 py-4 flex items-center justify-between gap-3">
                                        <div>
                                            <p className="font-bold text-slate-900 dark:text-slate-100">{entry.task_description}</p>
                                            <p className="text-xs text-slate-500">
                                                {entry.project?.name || 'No project'} • {new Date(entry.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(entry.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                                                {formatDuration(entry.duration || 0)}
                                            </span>
                                            <button
                                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                                                title="Edit in Timer"
                                                onClick={() => navigate(`/timer?task=${encodeURIComponent(entry.task_description)}${entry.project?.id ? `&projectId=${encodeURIComponent(entry.project.id)}` : ''}`)}
                                            >
                                                <span className="material-symbols-outlined text-[18px]">edit</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800">
                            <button
                                className="w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                onClick={() => navigate('/timer')}
                            >
                                + Add Entry
                            </button>
                        </div>
                    </div>
                </main>

                <aside className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hidden lg:flex flex-col p-6 gap-8 overflow-y-auto">
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest">Mini Calendar</h3>
                            <span className="material-symbols-outlined text-slate-400">calendar_view_day</span>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center mb-2">
                            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day) => (
                                <span key={day} className="text-[10px] font-bold text-slate-400">{day}</span>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center">
                            {weekDays.map((day) => {
                                const isSelected = getStartOfDay(day).getTime() === dayStart.getTime();
                                return (
                                    <button
                                        key={day.toISOString()}
                                        className={`text-xs p-1 rounded-lg ${isSelected ? 'bg-primary text-white font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                        onClick={() => setCurrentDate(getStartOfDay(day))}
                                    >
                                        {day.getDate()}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

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
                            <p className="text-xs text-slate-500 mb-4">You&apos;ve logged {formatDuration(weekEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0))} this week.</p>
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
