import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import type { TimeEntrySummary, AnalyticsDashboardResponse, DailyBreakdownResponse, ProjectSummary, TeamSummary, UserSummary } from '../types/api';
import { hasAnyRole } from '../utils/session';

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899', '#8b5cf6'];

const formatHoursText = (hours: number) => {
    if (hours <= 0) return '0.0h';
    if (hours < 0.1) return `${Math.max(1, Math.round(hours * 60))}m`;
    if (hours < 1) return `${hours.toFixed(2)}h`;
    return `${hours.toFixed(1)}h`;
};

const formatSecondsText = (seconds: number) => formatHoursText(seconds / 3600);

const parseDateInputValue = (value: string): Date => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
};

const toDateInputValue = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getStartOfWeek = (date: Date): Date => {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    const day = value.getDay();
    const diff = (day + 6) % 7; // Monday-start week
    value.setDate(value.getDate() - diff);
    return value;
};

const formatDayLabel = (date: Date): string =>
    date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

const formatStopReason = (reason?: string | null) => {
    if (!reason) return null;
    if (reason === 'active_duration_limit') return '8h cap reached';
    if (reason === 'idle_timeout') return 'Idle timeout';
    if (reason === 'heartbeat_missing') return 'Heartbeat missing';
    if (reason === 'pause_expired') return 'Paused too long';
    return reason.replace(/_/g, ' ');
};

/** Returns Tailwind classes based on a trend string like "+5%", "-3%", "0%" */
function getTrendClasses(trend: string | undefined): string {
    if (!trend) return 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400';
    const trimmed = trend.trim();
    if (trimmed.startsWith('+')) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (trimmed.startsWith('-')) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400';
}

const Reports: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialRange = ['7d', '30d', '90d'].includes(searchParams.get('range') || '') ? (searchParams.get('range') as string) : '30d';
    const initialProjectId = searchParams.get('projectId') || 'all';
    const initialQueryUserId = searchParams.get('queryUserId') || 'all';
    const initialTeamName = searchParams.get('teamName') || 'all';
    const initialFocusDate = searchParams.get('focusDate') || '';

    const [pendingApprovals, setPendingApprovals] = useState<TimeEntrySummary[]>([]);
    const [analytics, setAnalytics] = useState<AnalyticsDashboardResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [range, setRange] = useState(initialRange);
    const [projectId, setProjectId] = useState(initialProjectId);
    const [queryUserId, setQueryUserId] = useState(initialQueryUserId);
    const [teamName, setTeamName] = useState(initialTeamName);

    // Daily breakdown (pick a user + a specific day)
    const [focusDate, setFocusDate] = useState(initialFocusDate);
    const [dailyBreakdown, setDailyBreakdown] = useState<DailyBreakdownResponse | null>(null);
    const [dailyLoading, setDailyLoading] = useState(false);

    // Dropdown Data
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [users, setUsers] = useState<UserSummary[]>([]);
    const [managedTeams, setManagedTeams] = useState<TeamSummary[]>([]);
    const [productivityFilter, setProductivityFilter] = useState<'all' | 'top' | 'needs_attention'>('all');

    const canReviewApprovals = hasAnyRole(['Manager', 'Admin']);
    const teamOptions = useMemo(() => {
        const values = new Set(managedTeams.filter((team) => team.is_active).map((team) => team.name));
        users.forEach((user) => {
            if (user.team_name?.trim()) {
                values.add(user.team_name.trim());
            }
        });
        return Array.from(values).sort((a, b) => a.localeCompare(b));
    }, [managedTeams, users]);

    async function fetchApprovals() {
        try {
            const res = await api.get<{ entries: TimeEntrySummary[] }>('/timers/approvals');
            setPendingApprovals(res.data.entries || []);
        } catch (error) {
            console.error('Failed to fetch approvals:', error);
        }
    }

    async function fetchFilterData() {
        try {
            const [projRes, usersRes] = await Promise.all([
                api.get<ProjectSummary[]>('/projects'),
                api.get<UserSummary[]>('/users').catch(() => ({ data: [] as UserSummary[] }))
            ]);
            setProjects(projRes.data || []);
            setUsers(usersRes.data || []);
            if (canReviewApprovals) {
                const teamsRes = await api.get<{ teams: TeamSummary[] }>('/admin/teams').catch(() => ({ data: { teams: [] as TeamSummary[] } }));
                setManagedTeams(teamsRes.data.teams || []);
            }
        } catch (error) {
            console.error('Failed to fetch filter options:', error);
        }
    }

    const fetchAnalytics = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get<AnalyticsDashboardResponse>('/reports/dashboard', {
                params: { range, projectId, queryUserId, teamName }
            });
            setAnalytics(res.data);
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
        } finally {
            setIsLoading(false);
        }
    }, [range, projectId, queryUserId, teamName]);

    useEffect(() => {
        const init = async () => {
            await fetchFilterData();
            if (canReviewApprovals) {
                await fetchApprovals();
            }
        };
        void init();
    }, [canReviewApprovals]);

    useEffect(() => {
        void fetchAnalytics();
    }, [fetchAnalytics]);

    useEffect(() => {
        const nextParams = new URLSearchParams();
        nextParams.set('range', range);
        if (projectId !== 'all') nextParams.set('projectId', projectId);
        if (queryUserId !== 'all') nextParams.set('queryUserId', queryUserId);
        if (teamName !== 'all') nextParams.set('teamName', teamName);
        if (focusDate) nextParams.set('focusDate', focusDate);
        const source = searchParams.get('source');
        if (source) nextParams.set('source', source);
        setSearchParams(nextParams, { replace: true });
        // Intentionally keep this effect driven by active filters only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, queryUserId, range, teamName, focusDate, setSearchParams]);

    // A specific user must be selected before an admin/manager can drill into
    // a single day; individual contributors always see their own day.
    const canShowDailyBreakdown = !canReviewApprovals || queryUserId !== 'all';

    const fetchDailyBreakdown = useCallback(async () => {
        if (!focusDate || !canShowDailyBreakdown) {
            setDailyBreakdown(null);
            return;
        }
        setDailyLoading(true);
        try {
            const res = await api.get<DailyBreakdownResponse>('/reports/day', {
                params: {
                    date: focusDate,
                    ...(canReviewApprovals && queryUserId !== 'all' ? { queryUserId } : {}),
                },
            });
            setDailyBreakdown(res.data);
        } catch (error) {
            console.error('Failed to fetch daily breakdown:', error);
            setDailyBreakdown(null);
        } finally {
            setDailyLoading(false);
        }
    }, [focusDate, canShowDailyBreakdown, canReviewApprovals, queryUserId]);

    useEffect(() => {
        void fetchDailyBreakdown();
    }, [fetchDailyBreakdown]);

    const calendarWeekDays = useMemo(() => {
        const anchor = focusDate ? parseDateInputValue(focusDate) : new Date();
        const weekStart = getStartOfWeek(anchor);
        return Array.from({ length: 7 }, (_, index) => {
            const next = new Date(weekStart);
            next.setDate(weekStart.getDate() + index);
            return next;
        });
    }, [focusDate]);

    const handleReview = async (entryId: string, action: 'approve' | 'reject') => {
        try {
            await api.post(`/timers/approvals/${entryId}`, { action });
            void fetchApprovals();
        } catch (error) {
            console.error(`Failed to ${action} timesheet:`, error);
        }
    };

    const handleExport = async () => {
        try {
            const res = await api.get('/reports/export', {
                params: { range, projectId, queryUserId, teamName },
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'timesheet_export.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Failed to export report:', error);
            alert('Export failed. Please try again.');
        }
    };

    const filteredBreakdown = useMemo(() => {
        const source = analytics?.userBreakdown || [];
        if (productivityFilter === 'top') {
            return source.filter((item) => item.efficiency >= 85);
        }
        if (productivityFilter === 'needs_attention') {
            return source.filter((item) => item.efficiency < 85);
        }
        return source;
    }, [analytics?.userBreakdown, productivityFilter]);

    const autoStoppedPendingApprovals = useMemo(
        () => pendingApprovals.filter((entry) => entry.auto_stopped || entry.stop_reason === 'active_duration_limit'),
        [pendingApprovals],
    );

    const pillSelectClass = 'px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all cursor-pointer hover:border-slate-300 dark:hover:border-slate-600';

    return (
        <div className="flex-1 w-full overflow-y-auto bg-slate-50 dark:bg-slate-900 p-4 md:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <div>
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div className="space-y-1">
                            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight" style={{ fontFamily: 'var(--font-family-display)' }}>
                                Reports Dashboard
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 text-base">Performance analysis for Engineering team projects.</p>
                        </div>
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all self-start md:self-auto"
                        >
                            <span className="material-symbols-outlined text-lg">download</span>
                            <span>Export CSV</span>
                        </button>
                    </div>

                    {/* Filter bar — pill-style, below title */}
                    <div className="mt-4 flex flex-wrap gap-2 items-center">
                        {canReviewApprovals && (
                            <select
                                value={queryUserId}
                                onChange={(e) => {
                                    setQueryUserId(e.target.value);
                                    if (e.target.value !== 'all') setTeamName('all');
                                }}
                                className={pillSelectClass}
                            >
                                <option value="all">User: All</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                                ))}
                            </select>
                        )}
                        {canReviewApprovals && (
                            <select
                                value={teamName}
                                onChange={(e) => {
                                    setTeamName(e.target.value);
                                    if (e.target.value !== 'all') setQueryUserId('all');
                                }}
                                className={pillSelectClass}
                            >
                                <option value="all">Team: All</option>
                                {teamOptions.map((team) => (
                                    <option key={team} value={team}>{team}</option>
                                ))}
                            </select>
                        )}
                        <select
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value)}
                            className={pillSelectClass}
                        >
                            <option value="all">Project: All</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <select
                            value={range}
                            onChange={(e) => setRange(e.target.value)}
                            className={pillSelectClass}
                        >
                            <option value="7d">Last 7 Days</option>
                            <option value="30d">Last 30 Days</option>
                            <option value="90d">Last 90 Days</option>
                        </select>
                        <div className="flex items-center gap-1">
                            <input
                                type="date"
                                value={focusDate}
                                onChange={(e) => setFocusDate(e.target.value)}
                                className={pillSelectClass}
                                aria-label="Pick a day to see its breakdown"
                            />
                            {focusDate && (
                                <button
                                    type="button"
                                    onClick={() => setFocusDate('')}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                    title="Clear selected day"
                                >
                                    <span className="material-symbols-outlined text-lg">close</span>
                                </button>
                            )}
                        </div>
                    </div>
                    {canReviewApprovals && queryUserId === 'all' && focusDate && (
                        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                            Select a specific user above to see their day-by-day breakdown for {focusDate}.
                        </p>
                    )}
                </div>

                {/* Daily Breakdown — pick a user (admin/manager) or view your own day, then pick a day */}
                {focusDate && canShowDailyBreakdown && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h4 className="font-bold text-slate-900 dark:text-white">Daily Breakdown</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    {dailyBreakdown?.user
                                        ? `${dailyBreakdown.user.first_name} ${dailyBreakdown.user.last_name} — ${formatDayLabel(parseDateInputValue(focusDate))}`
                                        : formatDayLabel(parseDateInputValue(focusDate))}
                                </p>
                            </div>
                            <div className="grid grid-cols-7 gap-1 text-center">
                                {calendarWeekDays.map((day) => {
                                    const dayValue = toDateInputValue(day);
                                    const isSelected = dayValue === focusDate;
                                    return (
                                        <button
                                            type="button"
                                            key={dayValue}
                                            onClick={() => setFocusDate(dayValue)}
                                            className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${isSelected ? 'bg-primary text-white font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                                            title={formatDayLabel(day)}
                                        >
                                            <div className="text-[10px] uppercase opacity-70">{day.toLocaleDateString([], { weekday: 'short' }).slice(0, 2)}</div>
                                            <div>{day.getDate()}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {dailyLoading ? (
                            <div className="px-6 py-10 text-center text-slate-400 text-sm">Loading day...</div>
                        ) : !dailyBreakdown || dailyBreakdown.entries.length === 0 ? (
                            <div className="px-6 py-10 text-center">
                                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No time logged this day.</p>
                                <p className="text-xs text-slate-400 mt-1">
                                    {dailyBreakdown?.user ? `${dailyBreakdown.user.first_name} ${dailyBreakdown.user.last_name} did not log any hours on this date.` : 'Nothing logged for this date.'}
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                                        <tr>
                                            <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Task</th>
                                            <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Project</th>
                                            <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Duration</th>
                                            <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {dailyBreakdown.entries.map((entry) => (
                                            <tr key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-slate-200">{entry.task_description}</td>
                                                <td className="px-6 py-4 text-sm text-slate-500">{entry.project?.name || 'Unassigned'}</td>
                                                <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-white">{formatSecondsText(entry.duration)}</td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 capitalize">
                                                        {entry.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 dark:bg-slate-900/50">
                                            <td colSpan={2} className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Total</td>
                                            <td className="px-6 py-3 text-sm font-bold text-slate-900 dark:text-white">{formatSecondsText(dailyBreakdown.totalSeconds)}</td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {isLoading && !analytics ? (
                    <div className="flex justify-center items-center py-20 text-slate-400">Loading analytics...</div>
                ) : (
                    <>
                        {/* Metric Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Hours</p>
                                    <span
                                        className={`px-2 py-1 rounded text-xs font-bold ${getTrendClasses(analytics?.metrics.trends.hours)}`}
                                        title="Compared to previous period"
                                    >
                                        {analytics?.metrics.trends.hours}
                                    </span>
                                </div>
                                <h3 className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">{analytics?.metrics.totalHours}h</h3>
                                <p className="text-xs text-slate-400 mt-1">Logged over timeframe</p>
                            </div>

                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Active Projects</p>
                                    <span
                                        className={`px-2 py-1 rounded text-xs font-bold ${getTrendClasses(analytics?.metrics.trends.projects)}`}
                                        title="Compared to previous period"
                                    >
                                        {analytics?.metrics.trends.projects}
                                    </span>
                                </div>
                                <h3 className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">{analytics?.metrics.activeProjects}</h3>
                                <p className="text-xs text-slate-400 mt-1">Currently active projects</p>
                            </div>

                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Avg. Productivity</p>
                                    <span
                                        className={`px-2 py-1 rounded text-xs font-bold ${getTrendClasses(analytics?.metrics.trends.productivity)}`}
                                        title="Compared to previous period"
                                    >
                                        {analytics?.metrics.trends.productivity}
                                    </span>
                                </div>
                                <h3 className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">{analytics?.metrics.avgProductivity}%</h3>
                                <p className="text-xs text-slate-400 mt-1">Target is 85%</p>
                            </div>

                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Billable Amount</p>
                                    <span
                                        className={`px-2 py-1 rounded text-xs font-bold ${getTrendClasses(analytics?.metrics.trends.billable)}`}
                                        title="Compared to previous period"
                                    >
                                        {analytics?.metrics.trends.billable}
                                    </span>
                                </div>
                                <h3 className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">${analytics?.metrics.billableAmount}</h3>
                                <p className="text-xs text-slate-400 mt-1">Computed by hourly rate</p>
                            </div>

                            {canReviewApprovals && (
                                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-amber-200 dark:border-amber-900/40 shadow-sm">
                                    <div className="flex justify-between items-start">
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Flagged Auto-Stops</p>
                                        <span className="px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                            Review
                                        </span>
                                    </div>
                                    <h3 className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">{autoStoppedPendingApprovals.length}</h3>
                                    <p className="text-xs text-slate-400 mt-1">Pending approvals triggered by inactivity or the 8h cap.</p>
                                </div>
                            )}
                        </div>

                        {/* Approval, Monthly, PTO & Correction Insights */}
                        {(analytics?.hoursByStatus || analytics?.monthly || analytics?.pto || analytics?.corrections) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                {analytics?.hoursByStatus && (
                                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Hours by Approval Status</p>
                                        <div className="mt-3 space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Approved</span>
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">{formatHoursText(analytics.hoursByStatus.approved_hours)}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Pending</span>
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">{formatHoursText(analytics.hoursByStatus.pending_hours)}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-rose-600 dark:text-rose-400">Rejected</span>
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">{formatHoursText(analytics.hoursByStatus.rejected_hours)}</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-2">Within selected timeframe</p>
                                    </div>
                                )}

                                {analytics?.monthly && (
                                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                        <div className="flex justify-between items-start">
                                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">This Month</p>
                                            <span className="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                                                {analytics.monthly.month_label}
                                            </span>
                                        </div>
                                        <h3 className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">{formatHoursText(analytics.monthly.total_hours)}</h3>
                                        <p className="text-xs text-slate-400 mt-1">
                                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatHoursText(analytics.monthly.approved_hours)}</span> approved this month
                                        </p>
                                    </div>
                                )}

                                {analytics?.pto && (
                                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">PTO Requests (this year)</p>
                                        <div className="mt-3 space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Approved</span>
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">{analytics.pto.approved.count} <span className="text-xs font-medium text-slate-400">({analytics.pto.approved.days}d)</span></span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Pending</span>
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">{analytics.pto.pending.count} <span className="text-xs font-medium text-slate-400">({analytics.pto.pending.days}d)</span></span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-rose-600 dark:text-rose-400">Rejected</span>
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">{analytics.pto.rejected.count} <span className="text-xs font-medium text-slate-400">({analytics.pto.rejected.days}d)</span></span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-2">Leave requests by status</p>
                                    </div>
                                )}

                                {analytics?.corrections && (
                                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Correction Requests (this year)</p>
                                        <div className="mt-3 space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Pending</span>
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">{analytics.corrections.pending}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Approved</span>
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">{analytics.corrections.approved}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-rose-600 dark:text-rose-400">Rejected</span>
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">{analytics.corrections.rejected}</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-2">Timer correction requests by status</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Charts Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Hours Trend — Recharts Bar */}
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                                <h4 className="font-bold text-slate-900 dark:text-white mb-4">Hours Logged Trend</h4>
                                <ResponsiveContainer width="100%" height={256} minWidth={280}>
                                        <BarChart data={analytics?.hoursTrend || []} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.9}/>
                                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.2}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.2)" />
                                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                                            <Tooltip 
                                                cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)', backgroundColor: 'var(--bg-glass, #ffffff)' }}
                                                formatter={(value) => [formatHoursText(Number(value)), 'Hours']} 
                                            />
                                            <Bar dataKey="hours" fill="url(#colorHours)" radius={[6, 6, 0, 0]} />
                                        </BarChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Project Distribution — Recharts Pie */}
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                                <h4 className="font-bold text-slate-900 dark:text-white mb-4">Project Distribution</h4>
                                {(analytics?.projectDistribution.length ?? 0) === 0 ? (
                                    <p className="text-sm text-slate-500 text-center py-20">No project data for this period.</p>
                                ) : (
                                    <ResponsiveContainer width="100%" height={256} minWidth={280}>
                                            <PieChart>
                                                <Pie
                                                    data={analytics?.projectDistribution.slice(0, 6)}
                                                    dataKey="hours"
                                                    nameKey="name"
                                                    cx="50%"
                                                    cy="50%"
                                                    outerRadius={85}
                                                    innerRadius={60}
                                                    paddingAngle={5}
                                                    stroke="none"
                                                    label={({ name, percent }: PieLabelRenderProps) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                                                    labelLine={false}
                                                >
                                                    {analytics?.projectDistribution.slice(0, 6).map((_entry, idx) => (
                                                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip formatter={(value) => [formatHoursText(Number(value)), 'Hours']} />
                                                <Legend />
                                            </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>

                        {/* Pending Approvals */}
                        {canReviewApprovals && (
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-rose-200 dark:border-rose-900/50 shadow-sm overflow-hidden mb-8">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-rose-50/50 dark:bg-rose-900/10">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-rose-500">pending_actions</span>
                                    <h4 className="font-bold text-slate-900 dark:text-white">Timesheet Approvals Required ({pendingApprovals.length})</h4>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Employee</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Task & Project</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Duration</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {pendingApprovals.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">
                                                    No pending timesheets require your approval.
                                                </td>
                                            </tr>
                                        ) : pendingApprovals.map(entry => (
                                            <tr key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-600 dark:text-slate-300">
                                                            {entry.user.first_name[0]}{entry.user.last_name[0]}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-900 dark:text-white">{entry.user.first_name} {entry.user.last_name}</p>
                                                            <p className="text-xs text-slate-500">{entry.user.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm">
                                                    <p className="font-semibold text-slate-900 dark:text-slate-200">{entry.task_description}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">{entry.project?.name || 'Unassigned Project'}</p>
                                                    {(entry.auto_stopped || entry.stop_reason || entry.intelligence) && (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {entry.intelligence && (
                                                                <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${
                                                                    entry.intelligence.level === 'high'
                                                                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                                                                        : entry.intelligence.level === 'medium'
                                                                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                                                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                                }`}>
                                                                    {entry.intelligence.level} risk
                                                                </span>
                                                            )}
                                                            {entry.auto_stopped && (
                                                                <span className="inline-flex rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                                                                    auto-stopped
                                                                </span>
                                                            )}
                                                            {formatStopReason(entry.stop_reason) && (
                                                                <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                                                    {formatStopReason(entry.stop_reason)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-white">
                                                    {formatSecondsText(entry.duration)}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-500">
                                                    {new Date(entry.start_time).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => handleReview(entry.id, 'reject')} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded transition-colors" title="Reject">
                                                            <span className="material-symbols-outlined text-xl">close</span>
                                                        </button>
                                                        <button onClick={() => handleReview(entry.id, 'approve')} className="p-1.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition-colors" title="Approve">
                                                            <span className="material-symbols-outlined text-xl">check</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        )}

                        {/* User Productivity */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden mb-8">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                <h4 className="font-bold text-slate-900 dark:text-white">User Productivity Breakdown</h4>
                                <div className="flex gap-2 items-center">
                                    <span className="text-xs text-slate-500 capitalize">
                                        {productivityFilter === 'all' ? 'All users' : productivityFilter.replace('_', ' ')}
                                    </span>
                                    <button
                                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-500"
                                        onClick={() => setProductivityFilter((previous) => {
                                            if (previous === 'all') return 'top';
                                            if (previous === 'top') return 'needs_attention';
                                            return 'all';
                                        })}
                                        title="Cycle productivity filters"
                                    >
                                        <span className="material-symbols-outlined text-xl">filter_list</span>
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">User</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Team</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Primary Project</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Total Hours</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Approved h</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Pending h</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Rejected h</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Efficiency</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {filteredBreakdown.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} className="px-6 py-8 text-center text-slate-500 text-sm">
                                                    No users match the selected productivity filter.
                                                </td>
                                            </tr>
                                        ) : filteredBreakdown.map((u) => (
                                            <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-primary/10 text-primary">
                                                            {u.initials}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-900 dark:text-white">{u.name}</p>
                                                            <p className="text-xs text-slate-500">{u.role}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{u.teamName || 'Unassigned'}</td>
                                                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{u.primaryProject}</td>
                                                <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">{formatHoursText(Number(u.totalHours))}</td>
                                                <td className="px-6 py-4 text-sm font-semibold text-emerald-600 dark:text-emerald-400">{u.approved_hours !== undefined ? formatHoursText(u.approved_hours) : '—'}</td>
                                                <td className="px-6 py-4 text-sm font-semibold text-amber-600 dark:text-amber-400">{u.pending_hours !== undefined ? formatHoursText(u.pending_hours) : '—'}</td>
                                                <td className="px-6 py-4 text-sm font-semibold text-rose-600 dark:text-rose-400">{u.rejected_hours !== undefined ? formatHoursText(u.rejected_hours) : '—'}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-1.5 w-16 rounded-full bg-slate-100 dark:bg-slate-700">
                                                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(u.efficiency, 100)}%` }}></div>
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{u.efficiency}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                        {u.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default Reports;
