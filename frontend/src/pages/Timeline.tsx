import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarX } from 'lucide-react';
import api, { getApiErrorMessage } from '../services/api';
import type { ActiveTimerSummary, ProjectSummary, TimeEntrySummary, TimerEntriesResponse } from '../types/api';
import { emitTimeEntryChanged } from '../utils/timeEntryEvents';

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
    if (safe > 0 && safe < 60) {
        return '1m';
    }
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const getEntryDurationSeconds = (entry: TimeEntrySummary) => {
    const storedDuration = Number(entry.duration || 0);
    if (storedDuration > 0) {
        return storedDuration;
    }

    const start = new Date(entry.start_time).getTime();
    const end = new Date(entry.end_time).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return 0;
    }

    return Math.floor((end - start) / 1000);
};

const toLocalInputValue = (value: Date) => {
    const local = new Date(value);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    return local.toISOString().slice(0, 19);
};

const Timeline: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [entries, setEntries] = useState<TimeEntrySummary[]>([]);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [activeTimer, setActiveTimer] = useState<ActiveTimerSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(() => getStartOfDay(new Date()));
    const [showOnlyCurrentDay, setShowOnlyCurrentDay] = useState(true);
    const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorSaving, setEditorSaving] = useState(false);
    const [editorError, setEditorError] = useState<string | null>(null);
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [entryForm, setEntryForm] = useState({
        task_description: '',
        project_id: '',
        start_time: '',
        end_time: '',
        notes: '',
    });

    const loadTimeline = useCallback(async () => {
        setLoading(true);
        try {
            const [timerResponse, projectResponse] = await Promise.all([
                api.get<TimerEntriesResponse>('/timers/me'),
                api.get<ProjectSummary[]>('/projects'),
            ]);
            setEntries(timerResponse.data.entries || []);
            setActiveTimer(timerResponse.data.activeTimer || null);
            setProjects(projectResponse.data || []);
        } catch (error) {
            console.error('Failed to load timeline:', error);
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to load timeline entries') });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadTimeline();
    }, [loadTimeline]);

    useEffect(() => {
        const refreshTimeline = () => {
            void loadTimeline();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void loadTimeline();
            }
        };

        window.addEventListener('wfx:time-entry-changed', refreshTimeline as EventListener);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('wfx:time-entry-changed', refreshTimeline as EventListener);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [loadTimeline]);

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
            const statusPrefix = activeTimer.is_paused ? 'Paused' : 'Running';
            items.push({
                id: `active-${activeTimer.id}`,
                text: `${statusPrefix}: ${activeTimer.task_description}${activeTimer.project?.name ? ` on ${activeTimer.project.name}` : ''}`,
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
    const totalSeconds = displayedEntries.reduce((sum, entry) => sum + getEntryDurationSeconds(entry), 0);
    const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const currentLineTopPercent = Math.min((currentMinutes / (24 * 60)) * 100, 100);

    const moveDay = (delta: number) => {
        setCurrentDate((prev) => {
            const next = new Date(prev);
            next.setDate(next.getDate() + delta);
            return getStartOfDay(next);
        });
    };

    const openCreateEntry = useCallback(() => {
        const defaultStart = new Date(currentDate);
        defaultStart.setHours(9, 0, 0, 0);
        const defaultEnd = new Date(defaultStart);
        defaultEnd.setHours(defaultStart.getHours() + 1);
        setEditingEntryId(null);
        setEntryForm({
            task_description: '',
            project_id: '',
            start_time: toLocalInputValue(defaultStart),
            end_time: toLocalInputValue(defaultEnd),
            notes: '',
        });
        setEditorError(null);
        setEditorOpen(true);
    }, [currentDate]);

    const openEditEntry = (entry: TimeEntrySummary) => {
        setEditingEntryId(entry.id);
        setEntryForm({
            task_description: entry.task_description || '',
            project_id: entry.project?.id || '',
            start_time: toLocalInputValue(new Date(entry.start_time)),
            end_time: toLocalInputValue(new Date(entry.end_time)),
            notes: '',
        });
        setEditorError(null);
        setEditorOpen(true);
    };

    const closeEditor = () => {
        setEditorOpen(false);
        setEditorError(null);
    };

    const handleSaveEntry = async () => {
        if (!entryForm.task_description.trim()) {
            setEditorError('Task description is required.');
            return;
        }

        const start = new Date(entryForm.start_time);
        const end = new Date(entryForm.end_time);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
            setEditorError('End time must be after start time.');
            return;
        }

        setEditorSaving(true);
        setEditorError(null);
        try {
            const payload = {
                task_description: entryForm.task_description.trim(),
                project_id: entryForm.project_id || undefined,
                start_time: start.toISOString(),
                end_time: end.toISOString(),
                notes: entryForm.notes.trim() || undefined,
            };

            if (editingEntryId) {
                await api.put(`/timers/${editingEntryId}`, payload);
                setFeedback({ tone: 'success', message: 'Entry updated successfully.' });
            } else {
                await api.post('/timers/manual', payload);
                setFeedback({ tone: 'success', message: 'Entry added successfully.' });
            }

            closeEditor();
            await loadTimeline();
            emitTimeEntryChanged();
        } catch (error) {
            setEditorError(getApiErrorMessage(error, 'Failed to save entry'));
        } finally {
            setEditorSaving(false);
        }
    };

    const resolveProjectFilter = (sourceEntries: TimeEntrySummary[]) => sourceEntries.find((entry) => entry.project?.id)?.project?.id;

    const openAnalytics = (source: 'timeline' | 'weekly-summary', sourceEntries: TimeEntrySummary[]) => {
        const params = new URLSearchParams();
        params.set('range', showOnlyCurrentDay ? '7d' : '30d');
        params.set('focusDate', dayStart.toISOString().slice(0, 10));
        params.set('source', source);
        const projectFilter = resolveProjectFilter(sourceEntries);
        if (projectFilter) {
            params.set('projectId', projectFilter);
        }
        navigate(`/reports?${params.toString()}`);
    };

    useEffect(() => {
        if (loading) {
            return;
        }
        if (searchParams.get('action') === 'new') {
            openCreateEntry();
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('action');
            setSearchParams(nextParams, { replace: true });
        }
    }, [loading, openCreateEntry, searchParams, setSearchParams]);

    return (
        <div className="flex-1 flex w-full flex-col overflow-y-auto bg-slate-50 dark:bg-slate-900">
            <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 p-4 backdrop-blur md:flex-row md:items-center md:justify-between md:gap-4 md:p-6">
                <div className="flex w-full items-center gap-2 md:w-auto md:justify-start md:gap-4">
                    <button
                        type="button"
                        className="flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        onClick={() => moveDay(-1)}
                        title="Previous day"
                    >
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <div className="min-w-0 flex-1 text-center">
                        <h2 className="truncate text-lg font-black tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl md:text-2xl" style={{ fontFamily: 'var(--font-family-display)' }}>
                            {toDayLabel(currentDate)}
                        </h2>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400 sm:text-sm">Week {toWeekNumber(currentDate)} of {currentDate.getFullYear()}</p>
                    </div>
                    <button
                        type="button"
                        className="flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        onClick={() => moveDay(1)}
                        title="Next day"
                    >
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                    <button
                        type="button"
                        className="shrink-0 rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors sm:px-4 sm:text-sm"
                        onClick={() => setCurrentDate(today)}
                    >
                        Today
                    </button>
                </div>

                <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto md:gap-3">
                    <button
                        type="button"
                        className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 px-4 py-2 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 border border-transparent hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                        onClick={() => setShowOnlyCurrentDay((value) => !value)}
                        title={showOnlyCurrentDay ? 'Showing selected day only' : 'Showing full week'}
                    >
                        <span className="material-symbols-outlined text-[18px]">filter_list</span>
                        Filter
                    </button>
                    <button
                        type="button"
                        className="flex items-center gap-2 bg-primary px-6 py-2 rounded-lg text-sm font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all"
                        onClick={openCreateEntry}
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        New Task
                    </button>
                </div>
            </div>

            {feedback && (
                <div className={`mx-4 mt-4 rounded-lg px-4 py-3 text-sm font-medium md:mx-6 ${feedback.tone === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                    {feedback.message}
                </div>
            )}

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
                                type="button"
                                className="text-sm font-semibold text-primary hover:underline"
                                onClick={() => openAnalytics('timeline', displayedEntries)}
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
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
                                    onClick={openCreateEntry}
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
                                                {formatDuration(getEntryDurationSeconds(entry))}
                                            </span>
                                            {(entry.entry_type === 'manual' || entry.entry_type === 'ai_suggested') && entry.status === 'pending' && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" title="Manual entries require manager approval">
                                                    <span className="material-symbols-outlined text-[12px]">pending_actions</span>
                                                    Pending Approval
                                                </span>
                                            )}
                                            {(entry as unknown as Record<string, unknown>).is_billable === false && (
                                                <span className="text-[10px] font-semibold text-slate-400">Non-billable</span>
                                            )}
                                            <button
                                                type="button"
                                                className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                                                title="Edit entry"
                                                onClick={() => openEditEntry(entry)}
                                            >
                                                <span className="material-symbols-outlined text-[18px]">edit</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors text-emerald-600 dark:text-emerald-500"
                                                title="Resume Task (Starts a new timer with these details)"
                                                onClick={async () => {
                                                    try {
                                                        await api.post('/timers/start', {
                                                            project_id: entry.project?.id || undefined,
                                                            task_description: entry.task_description,
                                                            is_billable: (entry as unknown as Record<string, unknown>).is_billable,
                                                            tag_ids: (entry as unknown as Record<string, unknown>).tags ? ((entry as unknown as Record<string, unknown>).tags as {tag_id: string}[]).map(t => t.tag_id) : []
                                                        });
                                                        emitTimeEntryChanged();
                                                        navigate('/timer');
                                                    } catch (err) {
                                                        setFeedback({ tone: 'error', message: getApiErrorMessage(err, 'Failed to resume task') });
                                                    }
                                                }}
                                            >
                                                <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="border-t border-slate-100 dark:border-slate-700 px-5 py-4">
                            <button
                                type="button"
                                className="w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                onClick={openCreateEntry}
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
                                        type="button"
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
                                You&apos;ve logged {formatDuration(weekEntries.reduce((sum, entry) => sum + getEntryDurationSeconds(entry), 0))} this week.
                            </p>
                            <button
                                type="button"
                                className="w-full py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-all"
                                onClick={() => openAnalytics('weekly-summary', weekEntries)}
                            >
                                View Analytics
                            </button>
                        </div>
                    </section>
                </aside>
            </div>

            {editorOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
                    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                        <div className="mb-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Timeline Entry</p>
                            <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">{editingEntryId ? 'Edit Entry' : 'Add Entry'}</h3>
                        </div>
                        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-300">
                            <div className="flex items-center gap-1.5 font-bold mb-1">
                                <span className="material-symbols-outlined text-sm">info</span>
                                Managerial Approval Required
                            </div>
                            Manual timeline adjustments require your manager's approval before being added to your final timesheet.
                        </div>
                        <div className="space-y-3">
                            {editorError && (
                                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-900/20 dark:text-rose-300">
                                    {editorError}
                                </div>
                            )}
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Task</label>
                                <input
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                    value={entryForm.task_description}
                                    onChange={(event) => setEntryForm((prev) => ({ ...prev, task_description: event.target.value }))}
                                    placeholder="What did you work on?"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Project</label>
                                <select
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                    value={entryForm.project_id}
                                    onChange={(event) => setEntryForm((prev) => ({ ...prev, project_id: event.target.value }))}
                                >
                                    <option value="">No project</option>
                                    {projects.map((project) => (
                                        <option key={project.id} value={project.id}>{project.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Start Time</label>
                                    <input
                                        type="datetime-local"
                                        step={1}
                                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                        value={entryForm.start_time}
                                        onChange={(event) => setEntryForm((prev) => ({ ...prev, start_time: event.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">End Time</label>
                                    <input
                                        type="datetime-local"
                                        step={1}
                                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                                        value={entryForm.end_time}
                                        onChange={(event) => setEntryForm((prev) => ({ ...prev, end_time: event.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                                onClick={closeEditor}
                                disabled={editorSaving}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-70"
                                onClick={() => void handleSaveEntry()}
                                disabled={editorSaving}
                            >
                                {editorSaving ? 'Saving...' : editingEntryId ? 'Save Changes' : 'Add Entry'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Timeline;
