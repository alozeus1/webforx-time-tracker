import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import type {
    ActiveTimerSummary,
    CalendarEventSuggestion,
    CalendarStatus,
    NotificationSummary,
    ProjectSummary,
    TimerCorrectionRequestSummary,
    TimeEntrySummary,
    TimerEntriesResponse,
} from '../types/api';
import { emitTimeEntryChanged, TIME_ENTRY_CHANGED_EVENT } from '../utils/timeEntryEvents';
import { TIMER_IDLE_WARNING_EVENT, TIMER_IDLE_RESUMED_EVENT, TIMER_PAUSED_EVENT } from '../hooks/useActiveTimerHeartbeat';

const getElapsedSeconds = (
    startTime: string,
    pausedDurationSeconds = 0,
    isPaused = false,
    pausedAt?: string | null,
) => {
    const startMs = new Date(startTime).getTime();
    if (!Number.isFinite(startMs)) {
        return 0;
    }

    const pauseCutoffMs = isPaused && pausedAt ? new Date(pausedAt).getTime() : null;
    const endMs = pauseCutoffMs !== null && Number.isFinite(pauseCutoffMs) ? pauseCutoffMs : Date.now();
    const rawSeconds = Math.max(Math.floor((endMs - startMs) / 1000), 0);
    return Math.max(rawSeconds - pausedDurationSeconds, 0);
};

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
const isApiRouteNotFoundError = (error: unknown) => {
    const message = extractErrorMessage(error, '').toLowerCase();
    return message.includes('api route not found');
};

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
    const [timerPaused, setTimerPaused] = useState(false);
    const [timerPausedDurationSeconds, setTimerPausedDurationSeconds] = useState(0);
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
    const [correctionRequests, setCorrectionRequests] = useState<TimerCorrectionRequestSummary[]>([]);
    const [correctionStart, setCorrectionStart] = useState('');
    const [correctionEnd, setCorrectionEnd] = useState('');
    const [correctionReason, setCorrectionReason] = useState('');
    const [correctionWorkNote, setCorrectionWorkNote] = useState('');
    const [correctionFeedback, setCorrectionFeedback] = useState<string | null>(null);

    const isRunning = timerStartedAt !== null;
    const isActivelyRecording = isRunning && !timerPaused;
    const todaysProgress = completedSeconds + time;

    const syncFromActiveTimer = useCallback((activeTimer?: ActiveTimerSummary | null, clearDraft = false) => {
        if (activeTimer) {
            const isPaused = Boolean(activeTimer.is_paused);
            const pausedAt = activeTimer.paused_at ?? null;
            const pausedDurationSeconds = Number(activeTimer.paused_duration_seconds ?? 0);
            setTimerStartedAt(activeTimer.start_time);
            setTimerPaused(isPaused);
            setTimerPausedDurationSeconds(pausedDurationSeconds);
            setTime(getElapsedSeconds(activeTimer.start_time, pausedDurationSeconds, isPaused, pausedAt));
            setTask(activeTimer.task_description);
            setSelectedProject(activeTimer.project_id || '');
            return;
        }

        setTimerStartedAt(null);
        setTimerPaused(false);
        setTimerPausedDurationSeconds(0);
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

            try {
                const correctionResponse = await api.get<{ corrections: TimerCorrectionRequestSummary[] }>('/timers/corrections');
                setCorrectionRequests(correctionResponse.data.corrections || []);
            } catch {
                setCorrectionRequests([]);
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
        const handleTimeEntryChange = () => {
            void loadTimerPageData();
        };

        const handleIdleWarning = () => {
            setTimerPaused(true);
        };

        const handleIdleResumed = () => {
            setTimerPaused(false);
            void loadTimerPageData();
        };

        window.addEventListener(TIME_ENTRY_CHANGED_EVENT, handleTimeEntryChange as EventListener);
        window.addEventListener(TIMER_PAUSED_EVENT, handleTimeEntryChange as EventListener);
        window.addEventListener(TIMER_IDLE_WARNING_EVENT, handleIdleWarning as EventListener);
        window.addEventListener(TIMER_IDLE_RESUMED_EVENT, handleIdleResumed as EventListener);
        
        return () => {
            window.removeEventListener(TIME_ENTRY_CHANGED_EVENT, handleTimeEntryChange as EventListener);
            window.removeEventListener(TIMER_PAUSED_EVENT, handleTimeEntryChange as EventListener);
            window.removeEventListener(TIMER_IDLE_WARNING_EVENT, handleIdleWarning as EventListener);
            window.removeEventListener(TIMER_IDLE_RESUMED_EVENT, handleIdleResumed as EventListener);
        };
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

        if (timerStartedAt && !timerPaused) {
            interval = window.setInterval(() => {
                setTime(getElapsedSeconds(timerStartedAt, timerPausedDurationSeconds, false, null));
            }, 1000);
        }

        return () => {
            if (interval) {
                window.clearInterval(interval);
            }
        };
    }, [timerStartedAt, timerPaused, timerPausedDurationSeconds]);

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

    const handleStartTimer = useCallback(async () => {
        if (!task.trim()) {
            setTaskError('Task name is required before starting the timer.');
            return;
        }

        setTaskError(null);
        setSubmitting(true);

        try {
            const response = await api.post<ActiveTimerSummary>('/timers/start', {
                project_id: selectedProject || undefined,
                task_description: task.trim(),
                is_billable: isBillable,
                tag_ids: selectedTagIds,
            });

            syncFromActiveTimer(response.data);
            emitTimeEntryChanged();
        } catch (error) {
            console.error('Failed to start timer', error);
            alert(extractErrorMessage(error, 'Failed to start timer'));
            await loadTimerPageData(false);
        } finally {
            setSubmitting(false);
        }
    }, [isBillable, loadTimerPageData, selectedProject, selectedTagIds, syncFromActiveTimer, task]);

    const handleStopTimer = useCallback(async (clearDraft = true) => {
        setTaskError(null);
        setSubmitting(true);

        try {
            setTimerStartedAt(null);
            setTimerPaused(false);
            setTimerPausedDurationSeconds(0);
            setTime(0);
            await api.post('/timers/stop');
            await loadTimerPageData(clearDraft, true);
            emitTimeEntryChanged();
        } catch (error) {
            console.error('Failed to stop timer', error);
            const message = extractErrorMessage(error, 'Failed to stop timer');

            if (message.toLowerCase().includes('no active timer found')) {
                await loadTimerPageData(clearDraft);
                emitTimeEntryChanged();
                alert('Timer was already stopped. The page has been refreshed.');
                return;
            }

            alert(message);
            await loadTimerPageData(false);
        } finally {
            setSubmitting(false);
        }
    }, [loadTimerPageData]);

    const handlePauseTimer = async () => {
        setTaskError(null);
        setSubmitting(true);

        try {
            await api.post('/timers/pause');
            await loadTimerPageData(false);
            window.dispatchEvent(new CustomEvent(TIMER_PAUSED_EVENT));
            emitTimeEntryChanged();
        } catch (error) {
            console.error('Failed to pause timer', error);
            alert(extractErrorMessage(error, 'Failed to pause timer'));
            await loadTimerPageData(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleResumeTimer = async () => {
        setTaskError(null);
        setSubmitting(true);

        try {
            await api.post('/timers/resume');
            await loadTimerPageData(false);
            window.dispatchEvent(new CustomEvent(TIMER_IDLE_RESUMED_EVENT));
            emitTimeEntryChanged();
        } catch (error) {
            console.error('Failed to resume timer', error);
            alert(extractErrorMessage(error, 'Failed to resume timer'));
            await loadTimerPageData(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleStartNewTimer = async () => {
        await handleStopTimer(true);
    };

    const handleSubmitCorrectionRequest = async (event: React.FormEvent) => {
        event.preventDefault();
        setCorrectionFeedback(null);
        const payload = {
            requested_start_time: correctionStart ? new Date(correctionStart).toISOString() : '',
            requested_end_time: correctionEnd ? new Date(correctionEnd).toISOString() : '',
            reason: correctionReason,
            work_note: correctionWorkNote,
        };

        try {
            await api.post('/timers/corrections', payload);
            setCorrectionStart('');
            setCorrectionEnd('');
            setCorrectionReason('');
            setCorrectionWorkNote('');
            setCorrectionFeedback('Correction request submitted for admin review.');
            await loadTimerPageData(false);
        } catch (error) {
            if (isApiRouteNotFoundError(error)) {
                try {
                    await api.post('/timers/correction', payload);
                    setCorrectionStart('');
                    setCorrectionEnd('');
                    setCorrectionReason('');
                    setCorrectionWorkNote('');
                    setCorrectionFeedback('Correction request submitted for admin review.');
                    await loadTimerPageData(false);
                    return;
                } catch (retryError) {
                    setCorrectionFeedback(extractErrorMessage(retryError, 'Failed to submit correction request'));
                    return;
                }
            }

            setCorrectionFeedback(extractErrorMessage(error, 'Failed to submit correction request'));
        }
    };

    // Keyboard shortcut: Ctrl+Enter to start/stop timer
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !submitting) {
                e.preventDefault();
                if (isRunning) {
                    void handleStopTimer(true);
                } else {
                    void handleStartTimer();
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleStartTimer, handleStopTimer, isRunning, submitting]);

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
                        {isActivelyRecording && (
                            <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-600">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                                Recording
                            </div>
                        )}
                        {isRunning && timerPaused && (
                            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700">
                                <span className="h-2 w-2 rounded-full bg-amber-500" />
                                Paused
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

                            {isRunning ? (
                                <div className={`mt-2 grid gap-3 ${timerPaused ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
                                    {timerPaused ? (
                                        <button
                                            onClick={() => void handleResumeTimer()}
                                            disabled={submitting}
                                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white bg-slate-900 shadow-lg shadow-slate-900/15 transition-all hover:bg-slate-800 disabled:opacity-70 disabled:cursor-not-allowed"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                                            Resume Timer
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => void handlePauseTimer()}
                                            disabled={submitting}
                                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-slate-700 bg-slate-100 shadow-sm transition-all hover:bg-slate-200 disabled:opacity-70 disabled:cursor-not-allowed"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">pause</span>
                                            Pause Task
                                        </button>
                                    )}
                                    {timerPaused && (
                                        <button
                                            onClick={() => void handleStartNewTimer()}
                                            disabled={submitting}
                                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-slate-700 bg-slate-100 shadow-sm transition-all hover:bg-slate-200 disabled:opacity-70 disabled:cursor-not-allowed"
                                            title="Save this paused timer and open a fresh timer workspace"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">add_circle</span>
                                            Start New Timer
                                        </button>
                                    )}
                                    <button
                                        onClick={() => void handleStopTimer(true)}
                                        disabled={submitting}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white bg-rose-500 shadow-lg shadow-rose-500/20 transition-all hover:bg-rose-600 disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">stop</span>
                                        Stop Timer
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => void handleStartTimer()}
                                    disabled={submitting}
                                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white bg-emerald-500 shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-600 disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                                    {submitting ? 'Saving...' : 'Start Timer'}
                                </button>
                            )}
                        </div>
                    </div>

                    <aside className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Session Status</p>
                            <p className="mt-2 text-lg font-black text-slate-900">
                                {isRunning ? (timerPaused ? 'Timer is paused' : 'Timer is running') : 'Timer is stopped'}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                                {isRunning
                                    ? (
                                        timerPaused
                                            ? 'Resume this timer, stop it, or save it and start a different task.'
                                            : 'Current task and project are locked until you pause or stop tracking.'
                                    )
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

                <section className={`rounded-2xl border p-5 shadow-sm ${
                    searchParams.get('correction') === '1'
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-slate-200 bg-white'
                }`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-bold tracking-wide text-slate-900">Correction Request</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Request review for time that was missed while you were working. Approved requests are reviewed before they affect official time.
                            </p>
                        </div>
                        {correctionRequests.length > 0 && (
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-500">
                                {correctionRequests[0].status}
                            </span>
                        )}
                    </div>
                    <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => void handleSubmitCorrectionRequest(event)}>
                        <label className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                            Start time
                            <input
                                type="datetime-local"
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={correctionStart}
                                onChange={(event) => setCorrectionStart(event.target.value)}
                                required
                            />
                        </label>
                        <label className="text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                            End time
                            <input
                                type="datetime-local"
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={correctionEnd}
                                onChange={(event) => setCorrectionEnd(event.target.value)}
                                required
                            />
                        </label>
                        <label className="text-left text-xs font-bold uppercase tracking-wide text-slate-500 md:col-span-2">
                            Reason
                            <input
                                type="text"
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                value={correctionReason}
                                onChange={(event) => setCorrectionReason(event.target.value)}
                                placeholder="Timer paused while I was working in another tool"
                                required
                            />
                        </label>
                        <label className="text-left text-xs font-bold uppercase tracking-wide text-slate-500 md:col-span-2">
                            Work note
                            <textarea
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                rows={3}
                                value={correctionWorkNote}
                                onChange={(event) => setCorrectionWorkNote(event.target.value)}
                                placeholder="Optional context for the reviewer"
                            />
                        </label>
                        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                            <button
                                type="submit"
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
                            >
                                Submit request
                            </button>
                            {correctionFeedback && (
                                <p className="text-sm font-semibold text-slate-600">{correctionFeedback}</p>
                            )}
                        </div>
                    </form>
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
