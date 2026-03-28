import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, CheckCircle, ChevronLeft, ChevronRight, Download, XCircle } from 'lucide-react';
import api, { getApiErrorMessage } from '../services/api';
import type { TimeEntrySummary } from '../types/api';
import { hasAnyRole } from '../utils/session';

const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const toISODate = (value: Date) => {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const startOfWeek = (date: Date) => {
    const copy = new Date(date);
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
};

const formatHoursValue = (hours: number) => {
    if (hours <= 0) {
        return '0.0h';
    }

    if (hours < 0.1) {
        return `${Math.max(1, Math.round(hours * 60))}m`;
    }

    if (hours < 1) {
        return `${hours.toFixed(2)}h`;
    }

    return `${hours.toFixed(1)}h`;
};

const formatSecondsValue = (seconds: number) => formatHoursValue(seconds / 3600);

const Timesheet: React.FC = () => {
    const [entries, setEntries] = useState<TimeEntrySummary[]>([]);
    const [pendingApprovals, setPendingApprovals] = useState<TimeEntrySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [approvalsLoading, setApprovalsLoading] = useState(false);
    const [showApprovals, setShowApprovals] = useState(false);
    const [weekAnchorDate, setWeekAnchorDate] = useState(() => new Date());
    const [exporting, setExporting] = useState(false);
    const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
    const datePickerRef = useRef<HTMLInputElement | null>(null);
    const canReviewApprovals = hasAnyRole(['Manager', 'Admin']);

    const loadEntries = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get<{ entries: TimeEntrySummary[] }>('/timers/me');
            setEntries(response.data.entries || []);
        } catch (error) {
            console.error('Failed to load weekly timesheet:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadEntries();
    }, [loadEntries]);

    useEffect(() => {
        const refreshTimesheet = () => {
            void loadEntries();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void loadEntries();
            }
        };

        window.addEventListener('wfx:time-entry-changed', refreshTimesheet as EventListener);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('wfx:time-entry-changed', refreshTimesheet as EventListener);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [loadEntries]);

    const fetchApprovals = useCallback(async () => {
        if (!canReviewApprovals) {
            return;
        }
        setApprovalsLoading(true);
        try {
            const response = await api.get<{ entries: TimeEntrySummary[] }>('/timers/approvals');
            setPendingApprovals(response.data.entries || []);
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, 'Failed to load pending approvals'), tone: 'error' });
        } finally {
            setApprovalsLoading(false);
        }
    }, [canReviewApprovals]);

    useEffect(() => {
        if (canReviewApprovals) {
            void fetchApprovals();
        }
    }, [canReviewApprovals, fetchApprovals]);

    const weekStart = useMemo(() => startOfWeek(weekAnchorDate), [weekAnchorDate]);
    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, index) => {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + index);
            return day;
        }),
        [weekStart],
    );

    const { rows, dailyTotals, weeklyTotal } = useMemo(() => {
        const weeklyEntries = entries.filter((entry) => {
            const entryDate = new Date(entry.start_time);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 7);
            return entryDate >= weekStart && entryDate < weekEnd;
        });

        const projectMap = new Map<string, { project: string; totals: number[] }>();
        const totals = Array.from({ length: 7 }, () => 0);

        weeklyEntries.forEach((entry) => {
            const entryDate = new Date(entry.start_time);
            const dayIndex = Math.floor((entryDate.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));

            if (dayIndex < 0 || dayIndex > 6) {
                return;
            }

            const projectName = entry.project?.name || 'Unassigned';
            const existing = projectMap.get(projectName) || {
                project: projectName,
                totals: Array.from({ length: 7 }, () => 0),
            };

            const hours = entry.duration / 3600;
            existing.totals[dayIndex] += hours;
            totals[dayIndex] += hours;
            projectMap.set(projectName, existing);
        });

        const projectRows = Array.from(projectMap.values()).sort((left, right) => {
            const leftTotal = left.totals.reduce((sum, value) => sum + value, 0);
            const rightTotal = right.totals.reduce((sum, value) => sum + value, 0);
            return rightTotal - leftTotal;
        });

        return {
            rows: projectRows,
            dailyTotals: totals,
            weeklyTotal: totals.reduce((sum, value) => sum + value, 0),
        };
    }, [entries, weekStart]);

    const weekLabel = `${dayFormatter.format(weekDays[0])} - ${dayFormatter.format(weekDays[6])}`;
    const maxDailyHours = Math.max(...dailyTotals, 1);

    const handleWeekShift = (delta: number) => {
        setWeekAnchorDate((previous) => {
            const next = new Date(previous);
            next.setDate(next.getDate() + delta * 7);
            return next;
        });
    };

    const handleOpenDatePicker = () => {
        const dateInput = datePickerRef.current;
        if (!dateInput) {
            return;
        }

        const pickerApi = dateInput as HTMLInputElement & { showPicker?: () => void };
        if (typeof pickerApi.showPicker === 'function') {
            pickerApi.showPicker();
            return;
        }

        dateInput.click();
    };

    const handleDateSelected = (value: string) => {
        if (!value) {
            return;
        }

        setWeekAnchorDate(new Date(`${value}T12:00:00`));
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await api.get('/reports/export', { responseType: 'blob' });
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `timesheet-${weekStart.toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            setFeedback({ message: 'Timesheet CSV exported', tone: 'success' });
        } catch (error) {
            console.error('Failed to export timesheet CSV:', error);
            setFeedback({ message: getApiErrorMessage(error, 'Export failed. Please try again.'), tone: 'error' });
        } finally {
            setExporting(false);
        }
    };

    const handleReview = async (entryId: string, action: 'approve' | 'reject') => {
        try {
            await api.post(`/timers/approvals/${entryId}`, { action });
            setFeedback({ message: `Entry ${action}d successfully`, tone: 'success' });
            await fetchApprovals();
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, `Failed to ${action} entry`), tone: 'error' });
        }
    };

    return (
        <div className="timesheet-container flex-1 w-full overflow-y-auto">
            {feedback && (
                <div className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${feedback.tone === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                    {feedback.message}
                </div>
            )}
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900">Weekly Timesheet</h1>
                    <p className="mt-1 text-sm text-slate-500">Review weekly totals by project and export structured time records.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button className="btn btn-outline" onClick={() => handleWeekShift(-1)}>
                        <ChevronLeft size={16} /> Prev Week
                    </button>
                    <div className="relative">
                        <button className="btn btn-outline" onClick={handleOpenDatePicker}>
                            <CalendarIcon size={16} /> {weekLabel}
                        </button>
                        <input
                            ref={datePickerRef}
                            type="date"
                            value={toISODate(weekAnchorDate)}
                            onChange={(event) => handleDateSelected(event.target.value)}
                            className="pointer-events-none absolute h-0 w-0 opacity-0"
                            tabIndex={-1}
                            aria-hidden="true"
                        />
                    </div>
                    <button className="btn btn-outline" onClick={() => handleWeekShift(1)}>
                        Next Week <ChevronRight size={16} />
                    </button>
                    {canReviewApprovals && (
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowApprovals((value) => !value)}
                        >
                            <CheckCircle size={16} /> Approval Queue ({pendingApprovals.length})
                        </button>
                    )}
                    <button className="btn btn-outline" onClick={() => void handleExport()} disabled={exporting}>
                        <Download size={16} /> {exporting ? 'Exporting...' : 'Export CSV'}
                    </button>
                </div>
            </div>

            {canReviewApprovals && showApprovals && (
                <div className="card mb-6">
                    <div className="card-body">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-900">Pending Approvals</h3>
                            <span className="text-sm text-slate-500">{pendingApprovals.length} pending</span>
                        </div>
                        {approvalsLoading ? (
                            <p className="py-6 text-sm text-slate-500">Loading approval queue…</p>
                        ) : pendingApprovals.length === 0 ? (
                            <p className="py-6 text-sm text-slate-500">No pending entries require review.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-[760px] w-full border-collapse text-left">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50">
                                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Employee</th>
                                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Task</th>
                                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Duration</th>
                                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Date</th>
                                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingApprovals.map((entry) => (
                                            <tr key={entry.id} className="border-b border-slate-100">
                                                <td className="px-4 py-3 text-sm font-medium text-slate-700">{entry.user.first_name} {entry.user.last_name}</td>
                                                <td className="px-4 py-3 text-sm text-slate-700">{entry.task_description}</td>
                                                <td className="px-4 py-3 text-sm font-semibold text-slate-700">{formatSecondsValue(entry.duration)}</td>
                                                <td className="px-4 py-3 text-sm text-slate-500">{new Date(entry.start_time).toLocaleDateString()}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex justify-end gap-2">
                                                        <button className="btn btn-outline !px-2.5 !py-2 text-rose-600" onClick={() => void handleReview(entry.id, 'reject')}>
                                                            <XCircle size={14} />
                                                        </button>
                                                        <button className="btn btn-outline !px-2.5 !py-2 text-emerald-600" onClick={() => void handleReview(entry.id, 'approve')}>
                                                            <CheckCircle size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="card mb-6">
                <div className="card-body">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-base font-bold text-slate-900">Hours Logged Trend</h3>
                        <span className="text-sm font-medium text-slate-500">Weekly total: {formatHoursValue(weeklyTotal)}</span>
                    </div>
                    <div className="grid min-h-[150px] grid-cols-7 items-end gap-3">
                        {dailyTotals.map((hours, index) => {
                            const ratio = Math.max((hours / maxDailyHours) * 100, 4);
                            return (
                                <div key={`trend-${index}`} className="text-center">
                                    <div
                                        className="mx-auto min-h-[10px] w-full max-w-[52px] rounded-t-lg bg-primary transition-all"
                                        style={{ height: `${ratio}%`, opacity: hours > 0 ? 0.95 : 0.35 }}
                                        title={formatHoursValue(hours)}
                                    />
                                    <div className="mt-2 text-[11px] font-semibold text-slate-500">{dayFormatter.format(weekDays[index])}</div>
                                    <div className="text-xs font-bold text-slate-700">{formatHoursValue(hours)}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="overflow-x-auto">
                    <table className="min-w-[880px] w-full border-collapse text-center">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Project</th>
                                {weekDays.map((day) => (
                                    <th key={day.toISOString()} className="px-2 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                                        {dayFormatter.format(day)}
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={9} className="px-6 py-7 text-sm text-slate-500">Loading weekly summary...</td>
                                </tr>
                            )}

                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-6 py-7 text-sm text-slate-500">No entries logged for this week yet.</td>
                                </tr>
                            )}

                            {!loading && rows.map((row) => {
                                const total = row.totals.reduce((sum, value) => sum + value, 0);

                                return (
                                    <tr key={row.project} className="border-b border-slate-100">
                                        <td className="px-4 py-3 text-left text-sm font-semibold text-slate-800">{row.project}</td>
                                        {row.totals.map((value, index) => (
                                            <td key={`${row.project}-${index}`} className="px-2 py-3">
                                                <div className="mx-auto flex h-9 w-[74px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-center text-sm font-semibold text-slate-700">
                                                    {formatHoursValue(value)}
                                                </div>
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 text-right text-sm font-bold text-primary">
                                            {formatHoursValue(total)}
                                        </td>
                                    </tr>
                                );
                            })}

                            {!loading && (
                                <tr className="border-t-2 border-slate-200 bg-slate-50">
                                    <td className="px-4 py-3 text-left text-sm font-black text-slate-900">Daily Total</td>
                                    {dailyTotals.map((value, index) => (
                                    <td key={`total-${index}`} className={`px-2 py-3 text-sm font-bold ${value > 0 ? 'text-slate-800' : 'text-slate-500'}`}>
                                            {formatHoursValue(value)}
                                    </td>
                                    ))}
                                    <td className="px-4 py-3 text-right text-base font-black text-slate-900">{formatHoursValue(weeklyTotal)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Timesheet;
