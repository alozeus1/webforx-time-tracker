import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import type { TimeEntrySummary, AnalyticsDashboardResponse, ProjectSummary, UserSummary } from '../types/api';
import { hasAnyRole } from '../utils/session';

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899', '#8b5cf6'];

const formatHoursText = (hours: number) => {
    if (hours <= 0) return '0.0h';
    if (hours < 0.1) return `${Math.max(1, Math.round(hours * 60))}m`;
    if (hours < 1) return `${hours.toFixed(2)}h`;
    return `${hours.toFixed(1)}h`;
};

const formatSecondsText = (seconds: number) => formatHoursText(seconds / 3600);

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

    const [pendingApprovals, setPendingApprovals] = useState<TimeEntrySummary[]>([]);
    const [analytics, setAnalytics] = useState<AnalyticsDashboardResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [range, setRange] = useState(initialRange);
    const [projectId, setProjectId] = useState(initialProjectId);
    const [queryUserId, setQueryUserId] = useState(initialQueryUserId);

    // Dropdown Data
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [users, setUsers] = useState<UserSummary[]>([]);
    const [productivityFilter, setProductivityFilter] = useState<'all' | 'top' | 'needs_attention'>('all');

    const canReviewApprovals = hasAnyRole(['Manager', 'Admin']);

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
        } catch (error) {
            console.error('Failed to fetch filter options:', error);
        }
    }

    const fetchAnalytics = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await api.get<AnalyticsDashboardResponse>('/reports/dashboard', {
                params: { range, projectId, queryUserId }
            });
            setAnalytics(res.data);
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
        } finally {
            setIsLoading(false);
        }
    }, [range, projectId, queryUserId]);

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
        const focusDate = searchParams.get('focusDate');
        const source = searchParams.get('source');
        if (focusDate) nextParams.set('focusDate', focusDate);
        if (source) nextParams.set('source', source);
        setSearchParams(nextParams, { replace: true });
        // Intentionally keep this effect driven by active filters only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, queryUserId, range, setSearchParams]);

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
            const res = await api.get('/reports/export', { responseType: 'blob' });
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
                                onChange={(e) => setQueryUserId(e.target.value)}
                                className={pillSelectClass}
                            >
                                <option value="all">User: All</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
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
                    </div>
                </div>

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
                        </div>

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
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Primary Project</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Total Hours</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Efficiency</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {filteredBreakdown.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">
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
                                                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{u.primaryProject}</td>
                                                <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">{formatHoursText(Number(u.totalHours))}</td>
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
