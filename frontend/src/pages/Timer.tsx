import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import type {
    ActiveTimerSummary,
    CalendarEventSuggestion,
    CalendarStatus,
    NotificationSummary,
    ProjectSummary,
    TimeEntrySummary,
    TimerEntriesResponse,
} from '../types/api';
import { emitTimeEntryChanged } from '../utils/timeEntryEvents';

const getElapsedSeconds = (startTime: string) =>
    Math.max(Math.floor((Date.now() - new Date(startTime).getTime()) / 1000), 0);

const getTodaysCompletedSeconds = (entries: TimeEntrySummary[]) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return entries.reduce((total, entry) => {
        const startedAt = new Date(entry.start_time);
        if (startedAt >= todayStart) {
            return total + (entry.duration || 0);
        }

        return total;
    }, 0);
};

const extractErrorMessage = (error: unknown, fallback: string) =>
    typeof (error as { response?: { data?: { message?: string } } })?.response?.data?.message === 'string'
        ? (error as { response: { data: { message: string } } }).response.data.message
        : fallback;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const buildTaskSuggestions = (entries: TimeEntrySummary[]) => (
    Array.from(
        new Set(
            entries
                .map((entry) => (typeof entry.task_description === 'string' ? entry.task_description.trim() : ''))
                .filter(Boolean),
        ),
    ).slice(0, 5)
);

const Timer: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [time, setTime] = useState(0);
    const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [selectedProject, setSelectedProject] = useState('');
    const [task, setTask] = useState('');
    const [completedSeconds, setCompletedSeconds] = useState(0);
    const [calendarEvents, setCalendarEvents] = useState<CalendarEventSuggestion[]>([]);
    const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [taskError, setTaskError] = useState<string | null>(null);
    const [isBillable, setIsBillable] = useState(true);
    const [availableTags, setAvailableTags] = useState<{ id: string; name: string; color: string }[]>([]);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [timerStatusNotice, setTimerStatusNotice] = useState<NotificationSummary | null>(null);

    const isRunning = timerStartedAt !== null;
    const todaysProgress = completedSeconds + time;

    const syncFromActiveTimer = useCallback((activeTimer?: ActiveTimerSummary | null, clearDraft = false) => {
        if (activeTimer) {
            setTimerStartedAt(activeTimer.start_time);
            setTime(getElapsedSeconds(activeTimer.start_time));
            setTask(activeTimer.task_description);
            setSelectedProject(activeTimer.project_id || '');
            return;
        }

        setTimerStartedAt(null);
        setTime(0);

        if (clearDraft) {
            setTask('');
            setSelectedProject('');
            setIsBillable(true);
            setSelectedTagIds([]);
        }
    }, []);

    const loadTimerPageData = useCallback(async (clearDraft = false, expectStopped = false) => {
        setLoading(true);

        try {
            const [projectResult, timerResult] = await Promise.allSettled([
                api.get<ProjectSummary[]>('/projects'),
                api.get<TimerEntriesResponse>('/timers/me'),
            ]);

            if (projectResult.status === 'fulfilled') {
                setProjects(projectResult.value.data || []);
            } else {
                console.error('Failed to fetch projects for timer dropdown', projectResult.reason);
                setProjects([]);
            }

            if (timerResult.status === 'fulfilled') {
                let resolvedTimerPayload = timerResult.value.data;
                if (expectStopped && resolvedTimerPayload.activeTimer) {
                    for (let attempt = 0; attempt < 3; attempt += 1) {
                        await sleep(300);
                        const retryResponse = await api.get<TimerEntriesResponse>('/timers/me');
                        resolvedTimerPayload = retryResponse.data;
                        if (!resolvedTimerPayload.activeTimer) {
                            break;
                        }
                    }
                }

                setCompletedSeconds(getTodaysCompletedSeconds(resolvedTimerPayload.entries || []));
                setAiSuggestions(buildTaskSuggestions(resolvedTimerPayload.entries || []));
                syncFromActiveTimer(resolvedTimerPayload.activeTimer, clearDraft);
            } else {
                console.error('Failed to fetch timer session data', timerResult.reason);
                setCompletedSeconds(0);
                setAiSuggestions([]);
                syncFromActiveTimer(null, clearDraft);
            }

            try {
                const tagsResponse = await api.get<{ tags: { id: string; name: string; color: string }[] }>('/tags');
                setAvailableTags(tagsResponse.data.tags || []);
            } catch {
                setAvailableTags([]);
            }

            try {
                const statusResponse = await api.get<CalendarStatus>('/calendar/status');
                setCalendarStatus(statusResponse.data);

                if (statusResponse.data.connected) {
                    const calendarResponse = await api.get<{ events: CalendarEventSuggestion[] }>('/calendar/events');
                    setCalendarEvents(calendarResponse.data.events || []);
                } else {
                    setCalendarEvents([]);
                }
            } catch (error) {
                console.log('Calendar sync unavailable', error);
                setCalendarEvents([]);
            }

            try {
                const notificationResponse = await api.get<{ notifications: NotificationSummary[] }>('/users/me/notifications', {
                    params: { limit: 10 },
                });
                const latestTimerNotification = (notificationResponse.data.notifications || []).find(
                    (notification) => notification.type === 'timer_auto_stopped' || notification.type === 'idle_warning',
                );
                setTimerStatusNotice(latestTimerNotification || null);
            } catch {
                setTimerStatusNotice(null);
            }
        } catch (error) {
            console.error('Failed to fetch timer page data', error);
        } finally {
            setLoading(false);
        }
    }, [syncFromActiveTimer]);

    useEffect(() => {
        void loadTimerPageData();
    }, [loadTimerPageData]);

    useEffect(() => {
        if (loading || isRunning) {
            return;
        }

        const prefillTask = searchParams.get('task');
        const prefillProjectId = searchParams.get('projectId');

        if (prefillTask) {
            setTask(prefillTask);
        }

        if (prefillProjectId && projects.some((project) => project.id === prefillProjectId)) {
            setSelectedProject(prefillProjectId);
        }

        if (prefillTask || prefillProjectId) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete('task');
            nextParams.delete('projectId');
            setSearchParams(nextParams, { replace: true });
        }
    }, [isRunning, loading, projects, searchParams, setSearchParams]);

    useEffect(() => {
        let interval: number | undefined;

        if (timerStartedAt) {
            interval = window.setInterval(() => {
                setTime(getElapsedSeconds(timerStartedAt));
            }, 1000);
        }

        return () => {
            if (interval) {
                window.clearInterval(interval);
            }
        };
    }, [timerStartedAt]);

    // Keyboard shortcut: Ctrl+Enter to start/stop timer
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !submitting) {
                e.preventDefault();
                void handleToggle();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    });

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    const formatProgressHours = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    };

    const handleToggle = async () => {
        if (!isRunning && !task.trim()) {
            setTaskError('Task name is required before starting the timer.');
            return;
        }

        setTaskError(null);
        setSubmitting(true);

        try {
            if (isRunning) {
                // Optimistically reset the visual state while stop request is in flight.
                setTimerStartedAt(null);
                setTime(0);
                await api.post('/timers/stop');
                await loadTimerPageData(true, true);
                emitTimeEntryChanged();
            } else {
                const response = await api.post<ActiveTimerSummary>('/timers/start', {
                    project_id: selectedProject || undefined,
                    task_description: task.trim(),
                    is_billable: isBillable,
                    tag_ids: selectedTagIds,
                });

                syncFromActiveTimer(response.data);
                emitTimeEntryChanged();
            }
        } catch (error) {
            console.error(isRunning ? 'Failed to stop timer' : 'Failed to start timer', error);
            const fallback = isRunning ? 'Failed to stop timer' : 'Failed to start timer';
            const message = extractErrorMessage(error, fallback);

            if (isRunning && message.toLowerCase().includes('no active timer found')) {
                // Keep UI in sync if the timer has already been cleared server-side.
                await loadTimerPageData(true);
                emitTimeEntryChanged();
                alert('Timer was already stopped. The page has been refreshed.');
                return;
            }

            alert(message);
            await loadTimerPageData();
        } finally {
            setSubmitting(false);
        }
    };

    const handleApplySuggestion = (event: CalendarEventSuggestion) => {
        setTask(event.title);

        const matchedProject = projects.find(
            (project) => project.name.toLowerCase() === event.suggested_project?.toLowerCase(),
        );

        if (matchedProject) {
            setSelectedProject(matchedProject.id);
        }
    };

    const handleGoogleCalendarConnect = async () => {
        try {
            const response = await api.get<{ url: string }>('/calendar/connect', {
                params: { returnTo: '/timer' },
            });

            window.location.assign(response.data.url);
        } catch (error) {
            console.error('Failed to start Google Calendar connection:', error);
            alert('Could not start Google Calendar connection');
        }
    };

    const progressPercentage = Math.min((todaysProgress / (8 * 3600)) * 100, 100);

    return (
        <div className="flex-1 w-full overflow-y-auto pb-12">
            <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 lg:px-6">
                <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Time Workspace</p>
                            <h1 className="text-2xl font-black tracking-tight text-slate-900">Live Timer</h1>
                            <p className="text-sm text-slate-500">Track focused work sessions with project context and daily goal visibility.</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today</p>
                            <p className="text-xl font-black text-slate-900">{loading ? '...' : formatProgressHours(todaysProgress)}</p>
                        </div>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            {Math.round(progressPercentage)}% of 8h goal
                        </div>
                        {isRunning && (
                            <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-600">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                                Recording
                            </div>
                        )}
                    </div>
                    <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${progressPercentage}%` }} />
                    </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className={`mb-6 text-center font-mono text-6xl font-black tracking-tighter ${isRunning ? 'text-primary' : 'text-slate-300'}`}>
                            {formatTime(time)}
                        </div>

                        <div className="space-y-4">
                            <div className="relative text-left">
                                <label className="mb-1 ml-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Task</label>
                                <input
                                    className={`w-full rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${taskError ? 'border-rose-400 focus:ring-rose-400' : 'border-slate-200 focus:border-primary focus:ring-primary/20'}`}
                                    placeholder="What are you working on?"
                                    type="text"
                                    value={task}
                                    onChange={(event) => {
                                        setTask(event.target.value);
                                        if (taskError) {
                                            setTaskError(null);
                                        }
                                    }}
                                    disabled={isRunning || submitting}
                                    title={isRunning ? 'Task is locked while timer is running. Stop timer to edit.' : undefined}
                                />
                                {taskError && <p className="mt-2 text-xs font-semibold text-rose-600">{taskError}</p>}
                                {isRunning && (
                                    <p className="mt-2 text-xs text-slate-500">
                                        Task is locked while recording. Stop timer to edit task/project.
                                    </p>
                                )}
                                {!isRunning && aiSuggestions.length > 0 && !task.trim() && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {aiSuggestions.slice(0, 5).map((suggestion, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                                                onClick={() => setTask(suggestion)}
                                            >
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="relative text-left">
                                <label className="mb-1 ml-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Project</label>
                                <select
                                    className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    value={selectedProject}
                                    onChange={(event) => setSelectedProject(event.target.value)}
                                    disabled={isRunning || submitting}
                                >
                                    <option value="">Select Project (Optional)</option>
                                    {projects.map((project) => (
                                        <option key={project.id} value={project.id}>{project.name}</option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute right-4 top-[38px] text-slate-400">
                                    <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Billable</label>
                                    <button
                                        type="button"
                                        onClick={() => setIsBillable(!isBillable)}
                                        disabled={isRunning || submitting}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isBillable ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-50`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isBillable ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </div>

                            {availableTags.length > 0 && (
                                <div className="relative text-left">
                                    <label className="mb-1 ml-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Tags</label>
                                    <div className="flex flex-wrap gap-2">
                                        {availableTags.map((tag) => {
                                            const isSelected = selectedTagIds.includes(tag.id);
                                            return (
                                                <button
                                                    key={tag.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedTagIds(prev =>
                                                            isSelected ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                                                        );
                                                    }}
                                                    disabled={isRunning || submitting}
                                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all disabled:opacity-50 ${isSelected ? 'text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                                    style={isSelected ? { backgroundColor: tag.color } : undefined}
                                                >
                                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: isSelected ? '#fff' : tag.color }} />
                                                    {tag.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={() => void handleToggle()}
                                disabled={submitting}
                                className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-70 ${isRunning ? 'bg-rose-500 shadow-rose-500/20 hover:bg-rose-600' : 'bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-600'}`}
                            >
                                <span className="material-symbols-outlined">{isRunning ? 'stop' : 'play_arrow'}</span>
                                {submitting ? 'Saving...' : (isRunning ? 'Stop Timer' : 'Start Timer')}
                            </button>
                        </div>
                    </div>

                    <aside className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Session Status</p>
                            <p className="mt-2 text-lg font-black text-slate-900">{isRunning ? 'Timer is running' : 'Timer is stopped'}</p>
                            <p className="mt-1 text-sm text-slate-500">
                                {isRunning
                                    ? 'Current task and project are locked until you stop tracking.'
                                    : 'Add task context and start logging time.'}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Progress Breakdown</p>
                            <div className="mt-3 space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500">Tracked Today</span>
                                    <span className="font-semibold text-slate-900">{loading ? '...' : formatProgressHours(todaysProgress)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500">Daily Goal</span>
                                    <span className="font-semibold text-slate-900">8h 0m</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500">Completion</span>
                                    <span className="font-semibold text-emerald-600">{Math.round(progressPercentage)}%</span>
                                </div>
                            </div>
                        </div>
                    </aside>
                </section>

                {calendarStatus?.configured && !calendarStatus.connected && (
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h2 className="text-sm font-bold tracking-wide text-slate-900">Connect Google Calendar</h2>
                        <p className="mt-2 text-sm text-slate-500">Pull today&apos;s meetings into timer suggestions and map them to project work.</p>
                        <button
                            onClick={() => void handleGoogleCalendarConnect()}
                            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90"
                        >
                            <span className="material-symbols-outlined text-sm">calendar_month</span>
                            Connect Google Calendar
                        </button>
                    </section>
                )}

                {calendarStatus?.configured === false && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                        <h2 className="text-sm font-bold tracking-wide text-amber-900">Google Calendar Unavailable</h2>
                        <p className="mt-2 text-sm text-amber-700">Calendar suggestions are not enabled for this workspace yet. You can still track time normally.</p>
                    </section>
                )}

                {timerStatusNotice && (
                    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                        <h2 className="text-sm font-bold tracking-wide text-amber-900">Timer Status</h2>
                        <p className="mt-2 text-sm text-amber-700">{timerStatusNotice.message}</p>
                    </section>
                )}

                {calendarEvents.length > 0 && (
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 text-slate-900">
                            <span className="material-symbols-outlined text-[20px] text-[#6366f1]">auto_awesome</span>
                            <h2 className="text-sm font-bold tracking-wide">Suggested from Calendar</h2>
                        </div>
                        <div className="hide-scrollbar flex gap-4 overflow-x-auto pb-2">
                            {calendarEvents.map((event) => (
                                <button
                                    key={event.id}
                                    type="button"
                                    className="min-w-[280px] rounded-xl border border-slate-200 bg-slate-50 p-4 text-left shadow-sm transition-all hover:border-primary/50"
                                    onClick={() => handleApplySuggestion(event)}
                                >
                                    <div className="mb-2 flex items-start justify-between gap-2">
                                        <p className="line-clamp-1 text-sm font-bold text-slate-800">{event.title}</p>
                                        <span className="whitespace-nowrap rounded bg-[#6366f1]/10 px-2 py-0.5 text-[10px] font-bold text-[#6366f1]">
                                            {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="mb-3 line-clamp-1 text-xs text-slate-500">{event.suggested_project}</p>
                                    <span className="text-xs font-bold text-primary">Use This Task</span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
};

export default Timer;
