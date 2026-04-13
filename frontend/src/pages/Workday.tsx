import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, CalendarDays, Clock3, FolderClock, ShieldCheck, Sparkles } from 'lucide-react';
import api, { getApiErrorMessage } from '../services/api';
import type {
    CalendarEventSuggestion,
    CalendarStatus,
    ManagerOperationsResponse,
    ProjectSummary,
    TaskSourceSummary,
    TimeEntrySummary,
    TimerEntriesResponse,
    UserWellbeingSummary,
} from '../types/api';
import { getStoredRole } from '../utils/session';
import { getStoredPrivacyMode, type PrivacyMode } from '../utils/privacyMode';
import { getStoredWorkSignals, type BrowserWorkSignal } from '../utils/workSignals';
import { emitTimeEntryChanged } from '../utils/timeEntryEvents';

type WorkSuggestion = {
    id: string;
    title: string;
    start: string;
    end: string;
    source: 'calendar' | 'browser' | 'gap';
    suggested_project?: string | null;
};

const WORKDAY_START_HOUR = 8;
const WORKDAY_END_HOUR = 18;

const isToday = (value: string) => {
    const date = new Date(value);
    const now = new Date();
    return date.toDateString() === now.toDateString();
};

const overlaps = (start: Date, end: Date, entries: Array<{ start: Date; end: Date }>) =>
    entries.some((entry) => start < entry.end && end > entry.start);

const durationMinutes = (start: string, end: string) =>
    Math.max(Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000), 0);

const meetingLike = (title: string) => /meeting|sync|standup|1:1|review|retro|call/i.test(title);

const formatDateTime = (value: string) =>
    new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const formatDurationLabel = (minutes: number) => {
    if (minutes < 60) {
        return `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
};

const riskChipClass = (level: 'low' | 'medium' | 'high') => {
    if (level === 'high') return 'bg-rose-100 text-rose-700';
    if (level === 'medium') return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
};

const privacyLabels: Record<PrivacyMode, string> = {
    personal: 'Personal mode',
    team_ops: 'Team ops mode',
    compliance: 'Compliance mode',
};

const Workday: React.FC = () => {
    const role = getStoredRole();
    const isManagerView = role === 'Manager' || role === 'Admin';

    const [loading, setLoading] = useState(true);
    const [entries, setEntries] = useState<TimeEntrySummary[]>([]);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
    const [calendarEvents, setCalendarEvents] = useState<CalendarEventSuggestion[]>([]);
    const [taskSources, setTaskSources] = useState<TaskSourceSummary[]>([]);
    const [githubCommits, setGithubCommits] = useState<Array<{ id: string; message: string; repo: string; timestamp: string }>>([]);
    const [wellbeing, setWellbeing] = useState<UserWellbeingSummary | null>(null);
    const [operations, setOperations] = useState<ManagerOperationsResponse | null>(null);
    const [nonBlockingFeedback, setNonBlockingFeedback] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
    const [convertingId, setConvertingId] = useState<string | null>(null);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [desktopIdleSeconds, setDesktopIdleSeconds] = useState<number | null>(null);
    const [selectedShareProject, setSelectedShareProject] = useState('');

    const browserSignals = useMemo(
        () => getStoredWorkSignals().filter((signal) => isToday(signal.startedAt)),
        [],
    );

    const loadWorkday = useCallback(async () => {
        setLoading(true);
        setFeedback(null);
        setNonBlockingFeedback(null);

        try {
            const nonBlockingWarnings: string[] = [];
            const [
                timersResponse,
                projectsResponse,
                wellbeingResponse,
                calendarStatusResponse,
                taskSourcesResponse,
                githubResponse,
            ] = await Promise.all([
                api.get<TimerEntriesResponse>('/timers/me'),
                api.get<ProjectSummary[]>('/projects').catch(() => {
                    nonBlockingWarnings.push('Project context is temporarily unavailable.');
                    return { data: [] as ProjectSummary[] };
                }),
                api.get<UserWellbeingSummary>('/users/me/wellbeing').catch(() => {
                    nonBlockingWarnings.push('Wellbeing insights are temporarily unavailable.');
                    return { data: null as UserWellbeingSummary | null };
                }),
                api.get<CalendarStatus>('/calendar/status').catch(() => ({ data: null })),
                api.get<{ sources: TaskSourceSummary[] }>('/integrations/task-sources').catch(() => ({ data: { sources: [] } })),
                api.get<{ commits: Array<{ id: string; message: string; repo: string; timestamp: string }> }>('/integrations/github/commits').catch(() => ({ data: { commits: [] } })),
            ]);

            const entryList = (timersResponse.data.entries || []).filter((entry) => isToday(entry.start_time));
            setEntries(entryList);
            setProjects(projectsResponse.data || []);
            setWellbeing(wellbeingResponse.data || null);
            setCalendarStatus(calendarStatusResponse.data);
            setTaskSources(taskSourcesResponse.data.sources || []);
            setGithubCommits(githubResponse.data.commits || []);
            setSelectedShareProject((previous) => previous || projectsResponse.data?.[0]?.id || '');

            if (isManagerView) {
                try {
                    const operationsResponse = await api.get<ManagerOperationsResponse>('/reports/operations');
                    setOperations(operationsResponse.data);
                    if (operationsResponse.data?.meta?.degraded) {
                        nonBlockingWarnings.push('Team operations insights are partially unavailable right now. Core workday data is still available.');
                    }
                } catch {
                    setOperations(null);
                    nonBlockingWarnings.push('Team operations insights are temporarily unavailable.');
                }
            } else {
                setOperations(null);
            }

            setNonBlockingFeedback(nonBlockingWarnings.length > 0 ? nonBlockingWarnings.join(' ') : null);

            if (calendarStatusResponse.data?.connected) {
                try {
                    const eventsResponse = await api.get<{ events: CalendarEventSuggestion[] }>('/calendar/events');
                    setCalendarEvents(eventsResponse.data.events || []);
                } catch {
                    setCalendarEvents([]);
                }
            } else {
                setCalendarEvents([]);
            }

            const electronAPI = (window as Window & {
                electronAPI?: { getSystemIdleTime: () => Promise<number> };
            }).electronAPI;

            if (electronAPI?.getSystemIdleTime) {
                try {
                    setDesktopIdleSeconds(await electronAPI.getSystemIdleTime());
                } catch {
                    setDesktopIdleSeconds(null);
                }
            }
        } catch (error) {
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to load the workday intelligence view') });
        } finally {
            setLoading(false);
        }
    }, [isManagerView]);

    useEffect(() => {
        void loadWorkday();
    }, [loadWorkday]);

    const trackedHours = useMemo(
        () => Number((entries.reduce((sum, entry) => sum + entry.duration, 0) / 3600).toFixed(1)),
        [entries],
    );

    const entryBlocks = useMemo(
        () => entries.map((entry) => ({
            start: new Date(entry.start_time),
            end: new Date(entry.end_time),
            entry,
        })).sort((left, right) => left.start.getTime() - right.start.getTime()),
        [entries],
    );

    const workSuggestions = useMemo<WorkSuggestion[]>(() => {
        const suggestions: WorkSuggestion[] = [];
        const occupied = entryBlocks.map((block) => ({ start: block.start, end: block.end }));

        calendarEvents.forEach((event) => {
            const start = new Date(event.start);
            const end = new Date(event.end);
            if (!overlaps(start, end, occupied)) {
                suggestions.push({
                    id: `calendar-${event.id}`,
                    title: event.title,
                    start: event.start,
                    end: event.end,
                    source: 'calendar',
                    suggested_project: event.suggested_project || null,
                });
            }
        });

        browserSignals.forEach((signal) => {
            const start = new Date(signal.startedAt);
            const end = new Date(signal.endedAt);
            if (durationMinutes(signal.startedAt, signal.endedAt) >= 15 && !overlaps(start, end, occupied)) {
                suggestions.push({
                    id: signal.id,
                    title: signal.title,
                    start: signal.startedAt,
                    end: signal.endedAt,
                    source: 'browser',
                });
            }
        });

        const workdayStart = new Date();
        workdayStart.setHours(WORKDAY_START_HOUR, 0, 0, 0);
        const workdayEnd = new Date();
        workdayEnd.setHours(WORKDAY_END_HOUR, 0, 0, 0);

        let cursor = workdayStart;
        entryBlocks.forEach((block, index) => {
            if (block.start.getTime() - cursor.getTime() >= 45 * 60 * 1000) {
                suggestions.push({
                    id: `gap-${index}-${cursor.getTime()}`,
                    title: 'Untracked work block',
                    start: cursor.toISOString(),
                    end: block.start.toISOString(),
                    source: 'gap',
                });
            }

            cursor = block.end > cursor ? block.end : cursor;
        });

        if (workdayEnd.getTime() - cursor.getTime() >= 45 * 60 * 1000) {
            suggestions.push({
                id: `gap-end-${cursor.getTime()}`,
                title: 'End-of-day missing time',
                start: cursor.toISOString(),
                end: workdayEnd.toISOString(),
                source: 'gap',
            });
        }

        return suggestions
            .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())
            .slice(0, 8);
    }, [browserSignals, calendarEvents, entryBlocks]);

    const focusInsights = useMemo(() => {
        const deepWorkEntries = entries.filter((entry) => {
            const minutes = durationMinutes(entry.start_time, entry.end_time);
            return minutes >= 45 && !meetingLike(entry.task_description);
        });

        const deepWorkHours = Number((deepWorkEntries.reduce((sum, entry) => sum + entry.duration, 0) / 3600).toFixed(1));
        const contextSwitches = entryBlocks.reduce((count, block, index) => {
            if (index === 0) {
                return count;
            }

            const previous = entryBlocks[index - 1];
            return previous.entry.project?.name !== block.entry.project?.name ? count + 1 : count;
        }, 0);

        const meetingHours = Number((calendarEvents
            .filter((event) => meetingLike(event.title))
            .reduce((sum, event) => sum + durationMinutes(event.start, event.end), 0) / 60).toFixed(1));

        const longestFocusBlock = deepWorkEntries.reduce((longest, entry) => Math.max(longest, durationMinutes(entry.start_time, entry.end_time)), 0);
        const bestFocusWindow = deepWorkEntries.length > 0
            ? `${formatDateTime(deepWorkEntries[0].start_time)} - ${formatDateTime(deepWorkEntries[0].end_time)}`
            : 'No focus block detected yet';

        return {
            deepWorkHours,
            contextSwitches,
            meetingHours,
            longestFocusBlock,
            bestFocusWindow,
            recoveryRecommendation: wellbeing?.status === 'burnout_risk'
                ? 'Protect a lighter day or hand off non-critical work.'
                : wellbeing?.status === 'approaching_burnout'
                    ? 'Reserve a meeting-light focus block and wrap on time.'
                    : 'Current workload is in a healthy range.',
        };
    }, [calendarEvents, entries, entryBlocks, wellbeing]);

    const handleConvertSuggestion = async (suggestion: WorkSuggestion) => {
        setConvertingId(suggestion.id);
        try {
            const project = projects.find((item) => item.name === suggestion.suggested_project);
            await api.post('/timers/manual', {
                project_id: project?.id,
                task_description: suggestion.source === 'gap' ? 'Recovered work block' : suggestion.title,
                start_time: suggestion.start,
                end_time: suggestion.end,
                notes: `Created by missing-time copilot from ${suggestion.source} signal.`,
            });
            emitTimeEntryChanged();
            await loadWorkday();
            setFeedback({ tone: 'success', message: `Converted ${suggestion.title} into a manual time entry.` });
        } catch (error) {
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to convert suggestion into a time entry') });
        } finally {
            setConvertingId(null);
        }
    };

    const handleCreateShare = async (type: 'operations' | 'project-burn', id?: string) => {
        try {
            const response = await api.post<{ url: string }>('/reports/share', { type, id });
            setShareUrl(response.data.url);
            setFeedback({ tone: 'success', message: 'Client-ready share link generated.' });
        } catch (error) {
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to create share link') });
        }
    };

    if (loading) {
        return <div className="flex-1 w-full p-8 text-sm text-slate-500">Loading workday intelligence…</div>;
    }

    return (
        <div className="flex-1 w-full overflow-y-auto bg-slate-50 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Unified Workday</p>
                            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900" style={{ fontFamily: 'var(--font-family-display)' }}>
                                Workday Command Center
                            </h1>
                            <p className="mt-2 max-w-3xl text-sm text-slate-500">
                                Reconstruct your day, recover missing time, and monitor workload health from one place.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                                <ShieldCheck size={14} />
                                {privacyLabels[getStoredPrivacyMode()]}
                            </span>
                            {desktopIdleSeconds !== null && (
                                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                                    <Clock3 size={14} />
                                    Desktop idle: {Math.floor(desktopIdleSeconds / 60)}m
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {feedback && (
                    <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
                        feedback.tone === 'success'
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border border-rose-200 bg-rose-50 text-rose-800'
                    }`}>
                        {feedback.message}
                    </div>
                )}

                {nonBlockingFeedback && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                        {nonBlockingFeedback}
                    </div>
                )}

                {shareUrl && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">External Trust Layer</p>
                        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <p className="text-sm text-slate-600">{shareUrl}</p>
                            <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white"
                                onClick={() => void navigator.clipboard.writeText(shareUrl)}
                            >
                                <BadgeCheck size={16} />
                                Copy link
                            </button>
                        </div>
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-4">
                    {[
                        { label: 'Tracked Today', value: `${trackedHours}h`, icon: <Clock3 size={18} /> },
                        { label: 'Missing-Time Suggestions', value: workSuggestions.length, icon: <Sparkles size={18} /> },
                        { label: 'Deep Work', value: `${focusInsights.deepWorkHours}h`, icon: <FolderClock size={18} /> },
                        { label: 'Connected Task Sources', value: taskSources.length, icon: <CalendarDays size={18} /> },
                    ].map((metric) => (
                        <div key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                {metric.icon}
                                {metric.label}
                            </div>
                            <p className="mt-3 text-3xl font-black text-slate-900">{metric.value}</p>
                        </div>
                    ))}
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                    <section className="space-y-6">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Automatic Workday Reconstruction</p>
                                    <h2 className="mt-1 text-lg font-black text-slate-900">Work Memory Timeline</h2>
                                    <p className="mt-2 text-xs text-slate-500">
                                        Calendar {calendarStatus?.connected ? 'connected' : 'not connected'} · Browser signals {browserSignals.length > 0 ? 'active' : 'waiting'}
                                    </p>
                                </div>
                                <button type="button" className="text-sm font-semibold text-primary" onClick={() => void loadWorkday()}>
                                    Refresh signals
                                </button>
                            </div>
                            <div className="mt-4 space-y-3">
                                {entries.map((entry) => (
                                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-slate-900">{entry.task_description}</p>
                                            <span className="text-xs font-medium text-slate-500">
                                                {formatDateTime(entry.start_time)} - {formatDateTime(entry.end_time)}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {entry.project?.name || 'Unassigned'} · {formatDurationLabel(durationMinutes(entry.start_time, entry.end_time))}
                                        </p>
                                    </div>
                                ))}
                                {calendarEvents.slice(0, 3).map((event) => (
                                    <div key={event.id} className="rounded-xl border border-dashed border-blue-200 bg-blue-50 px-4 py-3">
                                        <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            Calendar signal · {formatDateTime(event.start)} - {formatDateTime(event.end)}
                                        </p>
                                    </div>
                                ))}
                                {browserSignals.slice(0, 3).map((signal: BrowserWorkSignal) => (
                                    <div key={signal.id} className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-sm font-semibold text-slate-900">{signal.title}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            Browser signal · {formatDateTime(signal.startedAt)} - {formatDateTime(signal.endedAt)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Missing-Time Copilot</p>
                                    <h2 className="mt-1 text-lg font-black text-slate-900">Recovered Suggestions</h2>
                                </div>
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                                    {workSuggestions.length} suggestions
                                </span>
                            </div>
                            <div className="mt-4 space-y-3">
                                {workSuggestions.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                        No missing-time blocks were detected today.
                                    </div>
                                )}
                                {workSuggestions.map((suggestion) => (
                                    <div key={suggestion.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900">{suggestion.title}</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {suggestion.source} · {formatDateTime(suggestion.start)} - {formatDateTime(suggestion.end)} · {formatDurationLabel(durationMinutes(suggestion.start, suggestion.end))}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                disabled={convertingId === suggestion.id}
                                                onClick={() => void handleConvertSuggestion(suggestion)}
                                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                                            >
                                                {convertingId === suggestion.id ? 'Converting...' : 'Convert to entry'}
                                                <ArrowRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="space-y-6">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Focus Intelligence</p>
                            <h2 className="mt-1 text-lg font-black text-slate-900">Flow & Recovery Signals</h2>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deep Work</p>
                                    <p className="mt-2 text-2xl font-black text-slate-900">{focusInsights.deepWorkHours}h</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Context Switches</p>
                                    <p className="mt-2 text-2xl font-black text-slate-900">{focusInsights.contextSwitches}</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meeting Load</p>
                                    <p className="mt-2 text-2xl font-black text-slate-900">{focusInsights.meetingHours}h</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Best Focus Window</p>
                                    <p className="mt-2 text-sm font-bold text-slate-900">{focusInsights.bestFocusWindow}</p>
                                </div>
                            </div>
                            <p className="mt-4 text-sm text-slate-600">{focusInsights.recoveryRecommendation}</p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Task-Native Sync</p>
                            <h2 className="mt-1 text-lg font-black text-slate-900">Connected Work Signals</h2>
                            <div className="mt-4 space-y-3">
                                {taskSources.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                                        No task connectors are configured yet. Add GitHub, Jira, Linear, Asana, ClickUp, or Trello in Integrations.
                                    </div>
                                )}
                                {taskSources.map((source) => (
                                    <div key={`${source.type}-${source.label}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-slate-900">{source.type}</p>
                                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                                                {source.readiness}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500">{source.label}</p>
                                    </div>
                                ))}
                                {githubCommits.slice(0, 3).map((commit) => (
                                    <div key={commit.id} className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-sm font-semibold text-slate-900">{commit.message}</p>
                                        <p className="mt-1 text-xs text-slate-500">{commit.repo} · {new Date(commit.timestamp).toLocaleString()}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {wellbeing && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Burnout & Capacity Forecasting</p>
                                <h2 className="mt-1 text-lg font-black text-slate-900">Two-Week Load Outlook</h2>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last 7 Days</p>
                                        <p className="mt-2 text-2xl font-black text-slate-900">{wellbeing.sevenDayHours.toFixed(1)}h</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Projected 14 Days</p>
                                        <p className="mt-2 text-2xl font-black text-slate-900">{(wellbeing.sevenDayHours * 2).toFixed(1)}h</p>
                                    </div>
                                </div>
                                <p className="mt-4 text-sm text-slate-600">
                                    Current status: <span className="font-semibold text-slate-900">{wellbeing.status.replace(/_/g, ' ')}</span>.
                                    {wellbeing.hoursUntilBurnout > 0 ? ` About ${wellbeing.hoursUntilBurnout.toFixed(1)}h remain before the burnout threshold.` : ' You are already above the burnout threshold.'}
                                </p>
                            </div>
                        )}
                    </section>
                </div>

                {isManagerView && operations && (
                    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Manager Exception Inbox</p>
                                    <h2 className="mt-1 text-lg font-black text-slate-900">Prioritized Approval Review</h2>
                                </div>
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white"
                                    onClick={() => void handleCreateShare('operations')}
                                >
                                    <ShieldCheck size={16} />
                                    Share trust summary
                                </button>
                            </div>
                            <div className="mt-4 space-y-3">
                                {operations.managerExceptions.pendingApprovals.slice(0, 6).map((entry) => (
                                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900">{entry.user.first_name} {entry.user.last_name} · {entry.task_description}</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {entry.project?.name || 'Unassigned'} · {new Date(entry.start_time).toLocaleDateString()} · {formatDurationLabel(durationMinutes(entry.start_time, entry.end_time))}
                                                </p>
                                                {entry.intelligence?.reasons.length ? (
                                                    <p className="mt-1 text-xs text-slate-500">{entry.intelligence.reasons.join(', ')}</p>
                                                ) : null}
                                            </div>
                                            {entry.intelligence && (
                                                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${riskChipClass(entry.intelligence.level)}`}>
                                                    {entry.intelligence.level} · {entry.intelligence.score}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {operations.managerExceptions.pendingApprovals.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                        No pending approvals require attention right now.
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="space-y-6">
                            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Team Benchmark Insights</p>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Planning Accuracy</p>
                                        <p className="mt-2 text-2xl font-black text-slate-900">{operations.teamBenchmarks.planningAccuracyPct}%</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approval Latency</p>
                                        <p className="mt-2 text-2xl font-black text-slate-900">{operations.teamBenchmarks.approvalLatencyHours}h</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billable Leakage</p>
                                        <p className="mt-2 text-2xl font-black text-slate-900">{operations.teamBenchmarks.billableLeakageHours}h</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overload Risks</p>
                                        <p className="mt-2 text-2xl font-black text-slate-900">{operations.teamBenchmarks.overloadRiskCount}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">External Trust Layer</p>
                                        <h2 className="mt-1 text-lg font-black text-slate-900">Project Burn Share Link</h2>
                                    </div>
                                    <div className="flex gap-2">
                                        <select
                                            value={selectedShareProject}
                                            onChange={(event) => setSelectedShareProject(event.target.value)}
                                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                        >
                                            {projects.map((project) => (
                                                <option key={project.id} value={project.id}>{project.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white"
                                            onClick={() => void handleCreateShare('project-burn', selectedShareProject)}
                                        >
                                            Generate link
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {operations.managerExceptions.budgetAlerts.slice(0, 4).map((alert) => (
                                        <div key={alert.project_id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                            <p className="text-sm font-semibold text-slate-900">{alert.project_name}</p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Budget {alert.budgetHours}h · Tracked {alert.trackedHours}h · Projected {alert.projectedHours}h
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Workday;
