import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarX } from 'lucide-react';
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
        <div className="flex-1 flex w-full flex-col overflow-y-auto bg-slate-50 dark:bg-slate-900">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 p-4 backdrop-blur md:p-6">
                <div className="flex flex-wrap items-center gap-3 md:gap-4">
                    <button
                        className="flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        onClick={() => moveDay(-1)}
                        title="Previous day"
                    >
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <div className="text-center">
                        <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: 'var(--font-family-display)' }}>
                            {toDayLabel(currentDate)}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Week {toWeekNumber(currentDate)} of {currentDate.getFullYear()}</p>
                    </div>
                    <button
                        className="flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        onClick={() => moveDay(1)}
                        title="Next day"
                    >
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                    <button
                        className="ml-1 rounded-lg bg-slate-100 dark:bg-slate-700 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                        onClick={() => setCurrentDate(today)}
                    >
                        Today
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                    <button
                        className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 px-4 py-2 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 border border-transparent hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                        onClick={() => setShowOnlyCurrentDay((value) => !value)}
                        title={showOnlyCurrentDay ? 'Showing selected day only' : 'Showing full week'}
                    >
                        <span className="material-symbols-outlined text-[18px]">filter_list</span>
                        Filter
                    </button>
                    <button
                        className="flex items-center gap-2 bg-primary px-6 py-2 rounded-lg text-sm font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all"
                        onClick={() => navigate('/timer')}
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        New Task
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                <main className="flex flex-1 flex-col overflow-y-auto p-4 md:p-6">
                    {/* Timeline container — position:relative + overflow:hidden keeps the time pill inside */}
                    <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                        {isCurrentDateToday && (
                            <div className="absolute z-10 w-full border-t-2 border-rose-500" style={{ top: `${currentLineTopPercent}%` }}>
                                <div className="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-rose-500 ring-4 ring-rose-500/20"></div>
                                <div className="absolute left-[88px] top-0.5 px-2 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full whitespace-nowrap">
                                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-5 py-4">
                            <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                    {showOnlyCurrentDay ? 'Selected Day Entries' : 'Week Entries'}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
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

                        {loading && (
                            <div className="px-5 py-8 space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="skeleton h-14 w-full rounded-lg" />
                                ))}
                            </div>
                        )}

                        {/* Empty state */}
                        {!loading && displayedEntries.length === 0 && (
                            <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
                                <div className="mb-5 flex items-center justify-center w-20 h-20 rounded-full"
                                    style={{ backgroundColor: 'rgba(53, 74, 192, 0.12)' }}>
                                    <CalendarX size={40} style={{ color: 'var(--color-primary)' }} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
                                    Nothing tracked yet
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xs">
                                    Start tracking your work to see it appear here.
                                </p>
                                <button
                                    className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
                                    onClick={() => navigate('/timer')}
                                >
                                    <span className="material-symbols-outlined text-base">add</span>
                                    Add Entry
                                </button>
                            </div>
                        )}

                        {!loading && displayedEntries.length > 0 && (
                            <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                {displayedEntries.map((entry) => (
                                    <div key={entry.id} className="px-5 py-4 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <div>
                                            <p className="font-bold text-slate-900 dark:text-slate-100">{entry.task_description}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                {entry.project?.name || 'No project'} • {new Date(entry.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(entry.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                            {(() => {
                                                const tagList = (entry as unknown as Record<string, unknown>).tags as { tag: { name: string; color: string } }[] | undefined;
                                                return tagList && tagList.length > 0 ? (
                                                    <div className="flex gap-1 mt-1">
                                                        {tagList.map((t, i) => (
                                                            <span key={i} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: t.tag.color }}>
                                                                {t.tag.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : null;
                                            })()}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                                                {formatDuration(entry.duration || 0)}
                                            </span>
                                            {(entry as unknown as Record<string, unknown>).is_billable === false && (
                                                <span className="text-[10px] font-semibold text-slate-400">Non-billable</span>
                                            )}
                                            <button
                                                className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
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

                        <div className="border-t border-slate-100 dark:border-slate-700 px-5 py-4">
                            <button
                                className="w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                onClick={() => navigate('/timer')}
                            >
                                + Add Entry
                            </button>
                        </div>
                    </div>
                </main>

                <aside className="hidden w-80 flex-col gap-8 overflow-y-auto border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 lg:flex">
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest">Mini Calendar</h3>
                            <span className="material-symbols-outlined text-slate-400">calendar_view_day</span>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center mb-2">
                            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                                <span key={i} className="text-[10px] font-bold text-slate-400">{day}</span>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center">
                            {weekDays.map((day) => {
                                const isSelected = getStartOfDay(day).getTime() === dayStart.getTime();
                                return (
                                    <button
                                        key={day.toISOString()}
                                        className={`text-xs p-1 rounded-lg transition-colors ${isSelected ? 'bg-primary text-white font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
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
                                <p className="text-sm text-slate-500 dark:text-slate-400">No project activity yet.</p>
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
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                                You&apos;ve logged {formatDuration(weekEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0))} this week.
                            </p>
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
