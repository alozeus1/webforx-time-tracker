import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import type {
    ActiveTimerSummary,
    CalendarEventSuggestion,
    CalendarStatus,
    ProjectSummary,
    TimeEntrySummary,
    TimerEntriesResponse,
} from '../types/api';

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
        }
    }, []);

    const loadTimerPageData = useCallback(async (clearDraft = false, expectStopped = false) => {
        setLoading(true);

        try {
            const [projectResponse, timerResponse] = await Promise.all([
                api.get<ProjectSummary[]>('/projects'),
                api.get<TimerEntriesResponse>('/timers/me'),
            ]);

            let resolvedTimerPayload = timerResponse.data;
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

            setProjects(projectResponse.data || []);
            setCompletedSeconds(getTodaysCompletedSeconds(resolvedTimerPayload.entries || []));
            syncFromActiveTimer(resolvedTimerPayload.activeTimer, clearDraft);

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
        let pingInterval: number | undefined;

        if (timerStartedAt) {
            interval = window.setInterval(() => {
                setTime(getElapsedSeconds(timerStartedAt));
            }, 1000);

            pingInterval = window.setInterval(async () => {
                try {
                    await api.post('/timers/ping');
                } catch (error) {
                    console.error('Failed to ping timer activity:', error);
                }
            }, 60000);
        }

        return () => {
            if (interval) {
                window.clearInterval(interval);
            }

            if (pingInterval) {
                window.clearInterval(pingInterval);
            }
        };
    }, [timerStartedAt]);

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
                await api.post('/timers/stop');
                await loadTimerPageData(true, true);
            } else {
                const response = await api.post<ActiveTimerSummary>('/timers/start', {
                    project_id: selectedProject || undefined,
                    task_description: task.trim(),
                });

                syncFromActiveTimer(response.data);
            }
        } catch (error) {
            console.error(isRunning ? 'Failed to stop timer' : 'Failed to start timer', error);
            const fallback = isRunning ? 'Failed to stop timer' : 'Failed to start timer';
            const message = extractErrorMessage(error, fallback);

            if (isRunning && message.toLowerCase().includes('no active timer found')) {
                // Keep UI in sync if the timer has already been cleared server-side.
                await loadTimerPageData(true);
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
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-background-dark w-full pb-24">
            <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-8 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                        <span className="material-symbols-outlined">timer</span>
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Web Forx Tracker</h1>
                </div>
            </header>

            <main className="max-w-xl mx-auto px-4 pt-10 space-y-8">
                <section className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                    <div className="flex justify-between items-end mb-4">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Today's Progress</p>
                            <h2 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                                {loading ? '...' : formatProgressHours(todaysProgress)}
                            </h2>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-medium text-slate-400">Goal: 8h</p>
                            <p className="text-sm font-bold text-emerald-500">{Math.round(progressPercentage)}% Complete</p>
                        </div>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${progressPercentage}%` }}></div>
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Live Timer</h2>
                        {isRunning && (
                            <span className="text-xs font-medium text-red-500 bg-red-500/10 px-2 py-1 rounded-full uppercase flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                Recording
                            </span>
                        )}
                    </div>

                    <div className="bg-white dark:bg-slate-800/50 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                        <div className={`text-6xl font-black font-mono tracking-tighter mb-8 ${isRunning ? 'text-primary' : 'text-slate-300 dark:text-slate-600'}`}>
                            {formatTime(time)}
                        </div>

                        <div className="space-y-4">
                            <div className="relative group text-left">
                                <label className="text-xs font-bold text-slate-500 uppercase ml-1 block mb-1">Task</label>
                                <input
                                    className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder:text-slate-400 ${taskError ? 'border-rose-400 focus:ring-rose-400' : 'border-slate-200 dark:border-slate-700'}`}
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
                                {taskError && (
                                    <p className="mt-2 text-xs font-semibold text-rose-600">{taskError}</p>
                                )}
                                {isRunning && (
                                    <p className="mt-2 text-xs text-slate-500">
                                        Task is locked while recording. Stop timer to edit task/project.
                                    </p>
                                )}
                            </div>

                            <div className="relative text-left">
                                <label className="text-xs font-bold text-slate-500 uppercase ml-1 block mb-1">Project</label>
                                <select
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary focus:outline-none appearance-none"
                                    value={selectedProject}
                                    onChange={(event) => setSelectedProject(event.target.value)}
                                    disabled={isRunning || submitting}
                                >
                                    <option value="">Select Project (Optional)</option>
                                    {projects.map((project) => (
                                        <option key={project.id} value={project.id}>{project.name}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-[38px] pointer-events-none text-slate-400">
                                    <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
                                </div>
                            </div>

                            <div className="pt-4">
                                <button
                                    onClick={() => void handleToggle()}
                                    disabled={submitting}
                                    className={`w-full font-bold rounded-xl flex items-center justify-center py-4 gap-2 transition-all active:scale-95 shadow-lg disabled:cursor-not-allowed disabled:opacity-70 ${isRunning ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'}`}
                                >
                                    <span className="material-symbols-outlined">{isRunning ? 'stop' : 'play_arrow'}</span>
                                    {submitting ? 'Saving...' : (isRunning ? 'Stop Timer' : 'Start Timer')}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {calendarStatus?.configured && !calendarStatus.connected && (
                    <section className="space-y-3 pt-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-800/50">
                            <h2 className="text-sm font-bold tracking-wide text-slate-900 dark:text-slate-100">Connect Google Calendar</h2>
                            <p className="mt-2 text-sm text-slate-500">Pull today&apos;s real meetings into your timer suggestions and map them to active projects.</p>
                            <button
                                onClick={() => void handleGoogleCalendarConnect()}
                                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90"
                            >
                                <span className="material-symbols-outlined text-sm">calendar_month</span>
                                Connect Google Calendar
                            </button>
                        </div>
                    </section>
                )}

                {calendarStatus?.configured === false && (
                    <section className="space-y-3 pt-4">
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                            <h2 className="text-sm font-bold tracking-wide text-amber-900">Google Calendar Not Configured</h2>
                            <p className="mt-2 text-sm text-amber-700">Add Google OAuth credentials to the backend env before users can connect calendars.</p>
                        </div>
                    </section>
                )}

                {calendarEvents.length > 0 && (
                    <section className="space-y-4 pt-4">
                        <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 mb-2">
                            <span className="material-symbols-outlined text-[#6366f1] text-[20px]">auto_awesome</span>
                            <h2 className="text-sm font-bold tracking-wide">Suggested from Calendar</h2>
                        </div>
                        <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar">
                            {calendarEvents.map((event) => (
                                <div
                                    key={event.id}
                                    className="snap-start min-w-[280px] bg-slate-50 border border-slate-200 dark:bg-slate-800/50 dark:border-slate-700/50 p-4 rounded-xl shadow-sm hover:border-primary/50 cursor-pointer transition-all group"
                                    onClick={() => handleApplySuggestion(event)}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{event.title}</p>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#6366f1]/10 text-[#6366f1] whitespace-nowrap">
                                            {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mb-3 line-clamp-1">{event.suggested_project}</p>
                                    <button className="text-xs font-bold text-primary group-hover:underline">Use This Task</button>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
};

export default Timer;
