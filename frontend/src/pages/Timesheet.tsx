import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, CheckCircle, ChevronLeft, ChevronRight, Download, XCircle } from 'lucide-react';
import api, { getApiErrorMessage } from '../services/api';
import ApprovalQueue from '../components/ApprovalQueue';
import type { ReviewAction } from '../utils/timeEntryLabels';
import type { BulkReviewResult, RejectionReasonInput, TimeEntrySummary, TimerEntriesResponse, TimesheetStatusTotals } from '../types/api';
import { hasAnyRole } from '../utils/session';

/**
 * The Weekly Timesheet.
 *
 * WHAT CHANGED AND WHY
 * --------------------
 * This screen used to show one number: total hours logged. People are measured on
 * *approved* hours, which it never showed. An intern read "Weekly total: 10.2h" off
 * this page, concluded she had cleared the 10-hour intern minimum, and disputed the
 * compliance warning that followed — 7.58h of that week had been rejected and only
 * 2.64h approved. She read the screen correctly; the screen was wrong.
 *
 * So the header now leads with Approved, states plainly that it is the figure the
 * minimum is measured against, and shows Rejected and Pending beside it. Total logged
 * is still here so nobody thinks hours vanished — it is just no longer the headline.
 *
 * The split comes from the API (`totals`) rather than being re-derived here: a screen
 * doing its own arithmetic over a set it had not filtered by status is the whole
 * incident. Per-day and per-project cells are bucketed client-side from the same
 * entries, using the browser's local day exactly as before, so the grid and the header
 * always describe the same set of rows.
 */

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

/** Two decimals, for the header figures — 2.64h has to read as 2.64h, not 2.6h. */
const formatExactHours = (seconds: number) => `${(seconds / 3600).toFixed(2)}h`;

const entryDate = (entry: TimeEntrySummary) => new Date(entry.start_time);

/** Hours by status for one bucket (a day, a project-day, or a whole row). */
interface StatusSplit {
    approved: number;
    rejected: number;
    pending: number;
    total: number;
}

const emptySplit = (): StatusSplit => ({ approved: 0, rejected: 0, pending: 0, total: 0 });

const addToSplit = (split: StatusSplit, status: string, hours: number) => {
    split.total += hours;
    if (status === 'approved') split.approved += hours;
    else if (status === 'rejected') split.rejected += hours;
    else if (status === 'pending') split.pending += hours;
};

/**
 * One grid cell: approved hours in full, with rejected and pending underneath when
 * they exist. A day whose hours were all rejected must not look like a day worked.
 */
const SplitCell: React.FC<{ split: StatusSplit; emphasis?: boolean }> = ({ split, emphasis = false }) => {
    if (split.total <= 0) {
        return <span className={emphasis ? 'text-sm font-bold text-slate-500' : 'text-sm text-slate-400 dark:text-slate-500'}>0.0h</span>;
    }

    return (
        <div className="space-y-0.5 leading-tight">
            <div className={emphasis ? 'text-sm font-black text-slate-900 dark:text-slate-100' : 'text-sm font-semibold text-slate-700 dark:text-slate-200'}>
                {formatHoursValue(split.approved)}
            </div>
            {split.rejected > 0 && (
                <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    {formatHoursValue(split.rejected)} rejected
                </div>
            )}
            {split.pending > 0 && (
                <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {formatHoursValue(split.pending)} pending
                </div>
            )}
        </div>
    );
};

const Timesheet: React.FC = () => {
    const [entries, setEntries] = useState<TimeEntrySummary[]>([]);
    const [totals, setTotals] = useState<TimesheetStatusTotals | null>(null);
    const [pendingApprovals, setPendingApprovals] = useState<TimeEntrySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [approvalsLoading, setApprovalsLoading] = useState(false);
    const [showApprovals, setShowApprovals] = useState(false);
    const [weekAnchorDate, setWeekAnchorDate] = useState(() => new Date());
    const [exporting, setExporting] = useState(false);
    const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
    const datePickerRef = useRef<HTMLInputElement | null>(null);
    const canReviewApprovals = hasAnyRole(['Manager', 'Admin']);

    const weekStart = useMemo(() => startOfWeek(weekAnchorDate), [weekAnchorDate]);
    const weekEnd = useMemo(() => {
        const end = new Date(weekStart);
        end.setDate(weekStart.getDate() + 7);
        return end;
    }, [weekStart]);

    const loadEntries = useCallback(async () => {
        setLoading(true);
        try {
            // The window is sent to the API so the approved/rejected/pending split comes
            // back computed. It also fixes an older bug: this page used to fetch the most
            // recent 50 entries and filter them client-side, so navigating back far enough
            // showed an empty week that was not actually empty.
            const response = await api.get<TimerEntriesResponse>('/timers/me', {
                params: { from: weekStart.toISOString(), to: weekEnd.toISOString(), limit: 200 },
            });
            setEntries(response.data.entries || []);
            setTotals(response.data.totals ?? null);
        } catch (error) {
            console.error('Failed to load weekly timesheet:', error);
            setFeedback({ message: getApiErrorMessage(error, 'Failed to load this week’s timesheet'), tone: 'error' });
        } finally {
            setLoading(false);
        }
    }, [weekStart, weekEnd]);

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

    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, index) => {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + index);
            return day;
        }),
        [weekStart],
    );

    const { rows, dailySplits, derivedTotal, rejectedEntries } = useMemo(() => {
        const weeklyEntries = entries.filter((entry) => {
            const date = entryDate(entry);
            return date >= weekStart && date < weekEnd;
        });

        const projectMap = new Map<string, { project: string; splits: StatusSplit[] }>();
        const days = Array.from({ length: 7 }, emptySplit);

        weeklyEntries.forEach((entry) => {
            const dayIndex = Math.floor((entryDate(entry).getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));

            if (dayIndex < 0 || dayIndex > 6) {
                return;
            }

            const projectName = entry.project?.name
                || (entry.task_description === 'Approved timer correction' ? 'Time Corrections' : 'Unassigned');
            const existing = projectMap.get(projectName) || {
                project: projectName,
                splits: Array.from({ length: 7 }, emptySplit),
            };

            const hours = entry.duration / 3600;
            addToSplit(existing.splits[dayIndex], entry.status, hours);
            addToSplit(days[dayIndex], entry.status, hours);
            projectMap.set(projectName, existing);
        });

        const projectRows = Array.from(projectMap.values()).sort((left, right) => {
            const leftTotal = left.splits.reduce((sum, split) => sum + split.total, 0);
            const rightTotal = right.splits.reduce((sum, split) => sum + split.total, 0);
            return rightTotal - leftTotal;
        });

        return {
            rows: projectRows,
            dailySplits: days,
            derivedTotal: days.reduce((sum, split) => sum + split.total, 0),
            rejectedEntries: weeklyEntries
                .filter((entry) => entry.status === 'rejected')
                .sort((left, right) => entryDate(right).getTime() - entryDate(left).getTime()),
        };
    }, [entries, weekStart, weekEnd]);

    // The API is authoritative for the headline figures — it aggregates the whole window,
    // not just the rows this page happens to be holding. It falls back to the client-side
    // buckets so an older backend, or a failed request, still renders something honest.
    const approvedHours = totals ? totals.approved_seconds / 3600 : dailySplits.reduce((s, d) => s + d.approved, 0);
    const rejectedHours = totals ? totals.rejected_seconds / 3600 : dailySplits.reduce((s, d) => s + d.rejected, 0);
    const pendingHours = totals ? totals.pending_seconds / 3600 : dailySplits.reduce((s, d) => s + d.pending, 0);
    const loggedHours = totals ? totals.total_seconds / 3600 : derivedTotal;

    const weekLabel = `${dayFormatter.format(weekDays[0])} - ${dayFormatter.format(weekDays[6])}`;
    const maxDailyHours = Math.max(...dailySplits.map((split) => split.total), 1);

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

    const handleReview = async (entryId: string, action: ReviewAction, reason?: RejectionReasonInput) => {
        try {
            await api.post(`/timers/approvals/${entryId}`, { action, ...(reason ?? {}) });
            setFeedback({ message: `Entry ${action}d successfully`, tone: 'success' });
            await fetchApprovals();
            await loadEntries();
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, `Failed to ${action} entry`), tone: 'error' });
        }
    };

    const handleBulkReview = async (entryIds: string[], action: ReviewAction, reason?: RejectionReasonInput) => {
        try {
            const response = await api.post<BulkReviewResult>('/timers/approvals/bulk', {
                entry_ids: entryIds,
                action,
                ...(reason ?? {}),
            });
            const { updated, skipped_locked: skippedLocked = [], skipped_not_pending: skippedNotPending = [] } = response.data;

            // Report what was skipped rather than silently under-delivering: a manager
            // who selects 20 rows and sees "18 approved" needs to know why.
            const notes: string[] = [];
            if (skippedLocked.length > 0) notes.push(`${skippedLocked.length} skipped (locked payroll period)`);
            if (skippedNotPending.length > 0) notes.push(`${skippedNotPending.length} already reviewed`);

            setFeedback({
                message: `${updated} ${updated === 1 ? 'entry' : 'entries'} ${action}d${notes.length ? ` — ${notes.join(', ')}` : ''}.`,
                tone: 'success',
            });
            await fetchApprovals();
            await loadEntries();
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, `Failed to ${action} the selected entries`), tone: 'error' });
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
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">Weekly Timesheet</h1>
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

            {/* The headline. Approved leads because approved is the number a weekly
                minimum is measured against — the single fact this screen used to hide. */}
            <div className="card mb-6" data-testid="weekly-status-summary">
                <div className="card-body">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-900/20">
                            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Approved</p>
                            <p className="mt-1 text-4xl font-black text-emerald-700 dark:text-emerald-300" data-testid="approved-hours">
                                {loading ? '—' : formatExactHours(approvedHours * 3600)}
                            </p>
                            <p className="mt-1 text-xs font-medium text-emerald-800/80 dark:text-emerald-300/80">
                                This is the figure counted toward your weekly minimum.
                            </p>
                        </div>
                        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900/60 dark:bg-rose-900/20">
                            <p className="text-xs font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400">Rejected</p>
                            <p className="mt-1 text-2xl font-black text-rose-700 dark:text-rose-300" data-testid="rejected-hours">
                                {loading ? '—' : formatExactHours(rejectedHours * 3600)}
                            </p>
                            <p className="mt-1 text-xs font-medium text-rose-800/80 dark:text-rose-300/80">
                                Not counted. See the reasons below.
                            </p>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-900/20">
                            <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Pending</p>
                            <p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-300" data-testid="pending-hours">
                                {loading ? '—' : formatExactHours(pendingHours * 3600)}
                            </p>
                            <p className="mt-1 text-xs font-medium text-amber-800/80 dark:text-amber-300/80">
                                Awaiting your manager’s review.
                            </p>
                        </div>
                    </div>
                    <p className="mt-4 text-sm text-slate-500 dark:text-slate-400" data-testid="total-logged-hours">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Total logged this week: {loading ? '—' : formatExactHours(loggedHours * 3600)}</span>
                        {' '}— every hour you recorded, whatever its review status.
                    </p>
                </div>
            </div>

            {canReviewApprovals && showApprovals && (
                <div className="card mb-6">
                    <div className="card-body">
                        <ApprovalQueue
                            entries={pendingApprovals}
                            loading={approvalsLoading}
                            onReviewOne={handleReview}
                            onReviewBulk={handleBulkReview}
                        />
                    </div>
                </div>
            )}

            {/* Only rendered when there is something to explain, so a clean week does not
                grow an empty panel. */}
            {!loading && rejectedEntries.length > 0 && (
                <div className="card mb-6" data-testid="rejected-entries">
                    <div className="card-body">
                        <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-rose-700 dark:text-rose-400">
                            <XCircle size={18} />
                            {rejectedEntries.length} rejected {rejectedEntries.length === 1 ? 'entry' : 'entries'} this week
                        </h3>
                        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                            Fix what the reason describes and log the time again, or raise a correction request from
                            the Timeline screen if it cannot be re-logged.
                        </p>
                        <ul className="space-y-3">
                            {rejectedEntries.map((entry) => (
                                <li
                                    key={entry.id}
                                    className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900/60 dark:bg-rose-900/20"
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{entry.task_description}</p>
                                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            {dayFormatter.format(entryDate(entry))} · {formatExactHours(entry.duration)} · {entry.project?.name || 'Unassigned'}
                                        </p>
                                    </div>
                                    {/* Historical rejections carry no reason and must never be
                                        given a fabricated one, nor render as a blank line. */}
                                    <p className="mt-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
                                        Reason: {entry.rejection_reason_label || 'No reason recorded'}
                                    </p>
                                    {entry.rejection_reason_note && (
                                        <p className="mt-1 text-sm italic text-slate-600 dark:text-slate-300">
                                            “{entry.rejection_reason_note}”
                                        </p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            <div className="card mb-6">
                <div className="card-body">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Hours Logged Trend</h3>
                        <span className="text-sm font-medium text-slate-500">Approved this week: {formatExactHours(approvedHours * 3600)}</span>
                    </div>
                    {/* Each bar is total logged, with the approved portion filled solid, so a
                        day that was largely rejected cannot look like a full day worked. */}
                    <div className="grid min-h-[150px] grid-cols-7 items-end gap-3">
                        {dailySplits.map((split, index) => {
                            const ratio = Math.max((split.total / maxDailyHours) * 100, 4);
                            const approvedRatio = split.total > 0 ? (split.approved / split.total) * 100 : 0;
                            return (
                                <div key={`trend-${index}`} className="text-center">
                                    <div
                                        className="mx-auto flex min-h-[10px] w-full max-w-[52px] flex-col justify-end overflow-hidden rounded-t-lg bg-slate-200 transition-all dark:bg-slate-700"
                                        style={{ height: `${ratio}%` }}
                                        title={`${formatHoursValue(split.approved)} approved of ${formatHoursValue(split.total)} logged`}
                                    >
                                        <div className="w-full bg-primary" style={{ height: `${approvedRatio}%` }} />
                                    </div>
                                    <div className="mt-2 text-[11px] font-semibold text-slate-500">{dayFormatter.format(weekDays[index])}</div>
                                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300">{formatHoursValue(split.approved)}</div>
                                    {split.rejected > 0 && (
                                        <div className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                                            {formatHoursValue(split.rejected)} rejected
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="overflow-x-auto">
                    <table className="min-w-[980px] w-full border-collapse text-center">
                        <caption className="px-4 pt-4 text-left text-xs text-slate-500 dark:text-slate-400">
                            Each cell shows approved hours, with rejected and pending listed beneath when present.
                        </caption>
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Project</th>
                                {weekDays.map((day) => (
                                    <th key={day.toISOString()} className="px-2 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                                        {dayFormatter.format(day)}
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Approved / Total</th>
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
                                const rowSplit = row.splits.reduce<StatusSplit>((acc, split) => {
                                    acc.approved += split.approved;
                                    acc.rejected += split.rejected;
                                    acc.pending += split.pending;
                                    acc.total += split.total;
                                    return acc;
                                }, emptySplit());

                                return (
                                    <tr key={row.project} className="border-b border-slate-100 dark:border-slate-800">
                                        <td className="px-4 py-3 text-left text-sm font-semibold text-slate-800 dark:text-slate-200">{row.project}</td>
                                        {row.splits.map((split, index) => (
                                            <td key={`${row.project}-${index}`} className="px-2 py-3">
                                                <div className="mx-auto flex min-h-[38px] w-[96px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-center dark:border-slate-700 dark:bg-slate-800/60">
                                                    <SplitCell split={split} />
                                                </div>
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 text-right text-sm font-bold text-primary">
                                            {formatHoursValue(rowSplit.approved)}
                                            <span className="ml-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                                                / {formatHoursValue(rowSplit.total)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}

                            {!loading && (
                                <tr className="border-t-2 border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                                    <td className="px-4 py-3 text-left text-sm font-black text-slate-900 dark:text-slate-100">Daily Total</td>
                                    {dailySplits.map((split, index) => (
                                        <td key={`total-${index}`} className="px-2 py-3">
                                            <SplitCell split={split} emphasis />
                                        </td>
                                    ))}
                                    <td className="px-4 py-3 text-right text-base font-black text-slate-900 dark:text-slate-100">
                                        {formatHoursValue(approvedHours)}
                                        <span className="ml-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                                            / {formatHoursValue(loggedHours)}
                                        </span>
                                    </td>
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
