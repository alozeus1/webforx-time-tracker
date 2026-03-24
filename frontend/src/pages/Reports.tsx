import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import type { TimeEntrySummary, AnalyticsDashboardResponse, ProjectSummary, UserSummary } from '../types/api';
import { hasAnyRole } from '../utils/session';

const Reports: React.FC = () => {
    const [pendingApprovals, setPendingApprovals] = useState<TimeEntrySummary[]>([]);
    const [analytics, setAnalytics] = useState<AnalyticsDashboardResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    // Filters
    const [range, setRange] = useState('30d');
    const [projectId, setProjectId] = useState('all');
    const [queryUserId, setQueryUserId] = useState('all');
    
    // Dropdown Data
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [users, setUsers] = useState<UserSummary[]>([]);

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

    const maxHours = Math.max(...(analytics?.hoursTrend || []).map(t => t.hours), 1);
    
    // Pastel colors mappings for projects
    const colorClasses = [
        'bg-primary', 'bg-indigo-400', 'bg-slate-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400'
    ];

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 p-8 w-full">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header & Filters */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Reports Dashboard</h1>
                        <p className="text-slate-500 text-base">Performance analysis for Engineering team projects.</p>
                    </div>
                    <div className="flex flex-wrap gap-3 items-center">
                        {canReviewApprovals && (
                            <select 
                                value={queryUserId}
                                onChange={(e) => setQueryUserId(e.target.value)}
                                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:shadow-sm transition-all text-slate-700 dark:text-slate-300 focus:ring-primary focus:border-primary outline-none"
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
                            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:shadow-sm transition-all text-slate-700 dark:text-slate-300 focus:ring-primary focus:border-primary outline-none"
                        >
                            <option value="all">Project: All</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <select 
                            value={range}
                            onChange={(e) => setRange(e.target.value)}
                            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:shadow-sm transition-all text-slate-700 dark:text-slate-300 focus:ring-primary focus:border-primary outline-none"
                        >
                            <option value="7d">Last 7 Days</option>
                            <option value="30d">Last 30 Days</option>
                            <option value="90d">Last 90 Days</option>
                        </select>
                        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
                            <span className="material-symbols-outlined text-lg">download</span>
                            <span>Export CSV</span>
                        </button>
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
                                    <p className="text-sm font-medium text-slate-500">Total Hours</p>
                                    <span className="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded text-xs font-bold">{analytics?.metrics.trends.hours}</span>
                                </div>
                                <h3 className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">{analytics?.metrics.totalHours}h</h3>
                                <p className="text-xs text-slate-400 mt-1">Logged over timeframe</p>
                            </div>

                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <p className="text-sm font-medium text-slate-500">Active Projects</p>
                                    <span className="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded text-xs font-bold">{analytics?.metrics.trends.projects}</span>
                                </div>
                                <h3 className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">{analytics?.metrics.activeProjects}</h3>
                                <p className="text-xs text-slate-400 mt-1">With logged hours</p>
                            </div>

                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <p className="text-sm font-medium text-slate-500">Avg. Productivity</p>
                                    <span className="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded text-xs font-bold">{analytics?.metrics.trends.productivity}</span>
                                </div>
                                <h3 className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">{analytics?.metrics.avgProductivity}%</h3>
                                <p className="text-xs text-slate-400 mt-1">Target is 85%</p>
                            </div>

                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex justify-between items-start">
                                    <p className="text-sm font-medium text-slate-500">Billable Amount</p>
                                    <span className="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded text-xs font-bold">{analytics?.metrics.trends.billable}</span>
                                </div>
                                <h3 className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">${analytics?.metrics.billableAmount}</h3>
                                <p className="text-xs text-slate-400 mt-1">Computed by hourly rate</p>
                            </div>
                        </div>

                        {/* Charts Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Hours Trend Graph */}
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                                <div className="flex items-center justify-between mb-6">
                                    <h4 className="font-bold text-slate-900 dark:text-white">Hours Logged Trend</h4>
                                    <button className="text-slate-400 hover:text-primary"><span className="material-symbols-outlined">more_vert</span></button>
                                </div>
                                <div className="h-64 flex items-end gap-2 px-2 relative flex-1">
                                    <div className="absolute left-0 top-0 h-full w-full flex flex-col justify-between text-[10px] text-slate-400 pointer-events-none">
                                        <div className="border-t border-slate-100 dark:border-slate-700 w-full pt-1">{maxHours}h</div>
                                        <div className="border-t border-slate-100 dark:border-slate-700 w-full pt-1">{Math.round(maxHours * 0.75)}h</div>
                                        <div className="border-t border-slate-100 dark:border-slate-700 w-full pt-1">{Math.round(maxHours * 0.50)}h</div>
                                        <div className="border-t border-slate-100 dark:border-slate-700 w-full pt-1">{Math.round(maxHours * 0.25)}h</div>
                                        <div className="base-line w-full pt-1">0h</div>
                                    </div>
                                    
                                    {analytics?.hoursTrend.map((t, idx) => {
                                        const hPercent = Math.max((t.hours / maxHours) * 100, 2);
                                        return (
                                            <div key={idx} style={{ height: `${hPercent}%` }} className="flex-1 bg-primary/40 rounded-t group relative cursor-pointer hover:bg-primary/90 transition-all">
                                                <div className="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded z-10 whitespace-nowrap">
                                                    {t.hours.toFixed(1)}h
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex justify-between mt-4 text-[10px] font-medium text-slate-400 px-4">
                                    {analytics?.hoursTrend.map((t, idx) => (
                                        <span key={idx} className="w-12 text-center overflow-hidden text-ellipsis">{t.name}</span>
                                    ))}
                                </div>
                            </div>

                            {/* Project Distribution */}
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex items-center justify-between mb-6">
                                    <h4 className="font-bold text-slate-900 dark:text-white">Project Distribution</h4>
                                    <select className="bg-transparent border-none text-xs font-medium text-slate-500 focus:ring-0 cursor-pointer outline-none">
                                        <option>Hours</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-5 mt-4">
                                    {analytics?.projectDistribution.length === 0 ? (
                                        <p className="text-sm text-slate-500 text-center py-10">No project data for this period.</p>
                                    ) : (
                                        analytics?.projectDistribution.slice(0, 5).map((p, idx) => (
                                            <div key={p.id} className="space-y-2">
                                                <div className="flex justify-between text-xs font-medium">
                                                    <span className="text-slate-700 dark:text-slate-300 truncate w-3/5">{p.name}</span>
                                                    <span className="text-slate-500">{p.hours.toFixed(1)}h ({p.percentage}%)</span>
                                                </div>
                                                <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                                                    <div className={`${colorClasses[idx % colorClasses.length]} h-full`} style={{ width: `${p.percentage}%` }}></div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Pending Approvals Table */}
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
                                                    {(entry.duration / 3600).toFixed(2)}h
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

                        {/* Data Table */}
                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden mb-8">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                <h4 className="font-bold text-slate-900 dark:text-white">User Productivity Breakdown</h4>
                                <div className="flex gap-2">
                                    <button className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors text-slate-500">
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
                                        {analytics?.userBreakdown.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">
                                                    No activity found for this period.
                                                </td>
                                            </tr>
                                        ) : analytics?.userBreakdown.map((u) => (
                                            <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-primary/10 text-primary`}>
                                                            {u.initials}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-900 dark:text-white">{u.name}</p>
                                                            <p className="text-xs text-slate-500">{u.role}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{u.primaryProject}</td>
                                                <td className="px-6 py-4 text-sm font-semibold text-slate-900 dark:text-white">{u.totalHours}h</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-16 bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full">
                                                            <div className="bg-emerald-500 h-full border-radius-full" style={{ width: `${Math.min(u.efficiency, 100)}%` }}></div>
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{u.efficiency}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">{u.status}</span>
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
