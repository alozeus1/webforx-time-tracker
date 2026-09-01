import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, CheckSquare, Square, XCircle } from 'lucide-react';
import RejectionReasonDialog from './RejectionReasonDialog';
import { formatEntryDuration, formatStopReason, riskChipClass, type ReviewAction } from '../utils/timeEntryLabels';
import type { RejectionReasonInput, TimeEntrySummary } from '../types/api';

/**
 * The manager approval queue, shared by /timesheet and /reports.
 *
 * Both pages previously carried their own near-identical copy of this table — right
 * down to a byte-identical `formatStopReason` — which is why they had drifted: only
 * one of them surfaced risk scores, and neither could act on more than one row at a
 * time. Selection and the bulk bar follow the pattern already proven on /timeline.
 *
 * Rejecting — single or bulk — goes through RejectionReasonDialog, which replaced the
 * plain "are you sure?" confirm. A rejection with no recorded reason is what left an
 * intern unable to find out why 7.58h of a 10.22h week had been thrown away, so the
 * dialog is the confirmation now: it cannot be submitted without a reason.
 */

interface ApprovalQueueProps {
    entries: TimeEntrySummary[];
    loading: boolean;
    /** Review a single entry. `reason` is present exactly when the action is 'reject'. */
    onReviewOne: (entryId: string, action: ReviewAction, reason?: RejectionReasonInput) => Promise<void> | void;
    /** Review every selected entry at once. One reason applies to the whole selection. */
    onReviewBulk: (entryIds: string[], action: ReviewAction, reason?: RejectionReasonInput) => Promise<void> | void;
    title?: string;
    emptyLabel?: string;
}

const ApprovalQueue: React.FC<ApprovalQueueProps> = ({
    entries,
    loading,
    onReviewOne,
    onReviewBulk,
    title = 'Pending Approvals',
    emptyLabel = 'No pending entries require review.',
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [working, setWorking] = useState(false);
    // null = closed. { scope: 'bulk' } = the current selection, { scope: 'one', … } = one row.
    const [rejecting, setRejecting] = useState<{ scope: 'bulk' } | { scope: 'one'; id: string; label: string } | null>(null);

    const entryIds = useMemo(() => entries.map((entry) => entry.id), [entries]);

    // Drop selections for rows that have left the queue (approved elsewhere, refetched),
    // so the bulk bar can never act on an id the user can no longer see.
    useEffect(() => {
        setSelectedIds((current) => {
            const visible = new Set(entryIds);
            const next = new Set([...current].filter((id) => visible.has(id)));
            return next.size === current.size ? current : next;
        });
    }, [entryIds]);

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const allSelected = entries.length > 0 && selectedIds.size === entries.length;
    const toggleSelectAll = useCallback(() => {
        setSelectedIds((current) => (current.size === entryIds.length ? new Set() : new Set(entryIds)));
    }, [entryIds]);

    const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

    const runBulk = useCallback(async (action: ReviewAction, reason?: RejectionReasonInput) => {
        const ids = [...selectedIds];
        if (ids.length === 0) return;
        setWorking(true);
        try {
            // Arity preserved on approve: no reason exists for an approval, and passing
            // an explicit `undefined` third argument is noise every caller has to ignore.
            await (reason ? onReviewBulk(ids, action, reason) : onReviewBulk(ids, action));
            setSelectedIds(new Set());
        } finally {
            setWorking(false);
            setRejecting(null);
        }
    }, [onReviewBulk, selectedIds]);

    /** Submits whichever rejection the dialog was opened for. */
    const submitRejection = useCallback(async (reason: RejectionReasonInput) => {
        if (!rejecting) return;
        if (rejecting.scope === 'bulk') {
            await runBulk('reject', reason);
            return;
        }
        setWorking(true);
        try {
            await onReviewOne(rejecting.id, 'reject', reason);
        } finally {
            setWorking(false);
            setRejecting(null);
        }
    }, [onReviewOne, rejecting, runBulk]);

    if (loading) {
        return <p className="py-6 text-sm text-slate-500">Loading approval queue…</p>;
    }

    if (entries.length === 0) {
        return <p className="py-6 text-sm text-slate-500">{emptyLabel}</p>;
    }

    return (
        <>
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
                <span className="text-sm text-slate-500">{entries.length} pending</span>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-[820px] w-full border-collapse text-left">
                    <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                            <th className="px-4 py-3 w-10">
                                <button
                                    type="button"
                                    onClick={toggleSelectAll}
                                    aria-label={allSelected ? 'Clear selection' : 'Select all pending entries'}
                                    aria-pressed={allSelected}
                                    className="text-slate-500 hover:text-primary"
                                >
                                    {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Employee</th>
                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Task</th>
                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Risk</th>
                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Duration</th>
                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Date</th>
                            <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry) => {
                            const selected = selectedIds.has(entry.id);
                            const employeeName = `${entry.user?.first_name ?? ''} ${entry.user?.last_name ?? ''}`.trim() || entry.user?.email || 'Unknown';
                            const stopReason = formatStopReason(entry.stop_reason);

                            return (
                                <tr
                                    key={entry.id}
                                    className={`border-b border-slate-100 dark:border-slate-800 ${selected ? 'bg-primary/5' : ''}`}
                                >
                                    <td className="px-4 py-3">
                                        <button
                                            type="button"
                                            onClick={() => toggleSelect(entry.id)}
                                            aria-label={`${selected ? 'Deselect' : 'Select'} ${employeeName} — ${entry.task_description}`}
                                            aria-pressed={selected}
                                            className="text-slate-400 hover:text-primary"
                                        >
                                            {selected ? <CheckSquare size={16} /> : <Square size={16} />}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">{employeeName}</td>
                                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{entry.task_description}</td>
                                    <td className="px-4 py-3 text-sm text-slate-700">
                                        {entry.intelligence ? (
                                            <div className="space-y-1">
                                                <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${riskChipClass(entry.intelligence.level)}`}>
                                                    {entry.intelligence.level} risk · {entry.intelligence.score}
                                                </span>
                                                {entry.intelligence.reasons.length > 0 && (
                                                    <p className="max-w-[200px] text-xs text-slate-500">
                                                        {entry.intelligence.reasons.join(', ')}
                                                    </p>
                                                )}
                                                <div className="flex flex-wrap gap-1.5">
                                                    {entry.over_daily_cap && (
                                                        <span
                                                            className="inline-flex rounded-full bg-rose-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                                                            title={entry.overtime_reason || undefined}
                                                        >
                                                            over daily cap
                                                        </span>
                                                    )}
                                                    {entry.auto_stopped && (
                                                        <span className="inline-flex rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                                                            auto-stopped
                                                        </span>
                                                    )}
                                                    {stopReason && (
                                                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                                            {stopReason}
                                                        </span>
                                                    )}
                                                </div>
                                                {entry.over_daily_cap && entry.overtime_reason && (
                                                    <p className="max-w-[240px] text-xs italic text-rose-600 dark:text-rose-300">
                                                        “{entry.overtime_reason}”
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-400">No flags</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{formatEntryDuration(entry.duration)}</td>
                                    <td className="px-4 py-3 text-sm text-slate-500">{new Date(entry.start_time).toLocaleDateString()}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                type="button"
                                                className="btn btn-outline !px-2.5 !py-2 text-rose-600"
                                                aria-label={`Reject ${employeeName} — ${entry.task_description}`}
                                                onClick={() => setRejecting({ scope: 'one', id: entry.id, label: entry.task_description })}
                                            >
                                                <XCircle size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-outline !px-2.5 !py-2 text-emerald-600"
                                                aria-label={`Approve ${employeeName} — ${entry.task_description}`}
                                                onClick={() => void onReviewOne(entry.id, 'approve')}
                                            >
                                                <CheckCircle size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
                    <div className="flex items-center gap-3 rounded-full bg-slate-900 px-5 py-3 text-sm text-white shadow-xl">
                        <span className="font-semibold">{selectedIds.size} selected</span>
                        <button
                            type="button"
                            disabled={working}
                            onClick={() => void runBulk('approve')}
                            className="rounded-full bg-emerald-500 px-4 py-1.5 font-semibold text-white disabled:opacity-60"
                        >
                            Approve all
                        </button>
                        <button
                            type="button"
                            disabled={working}
                            onClick={() => setRejecting({ scope: 'bulk' })}
                            className="rounded-full bg-rose-500 px-4 py-1.5 font-semibold text-white disabled:opacity-60"
                        >
                            Reject all
                        </button>
                        <button
                            type="button"
                            onClick={clearSelection}
                            className="text-slate-300 hover:text-white"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}

            {/* The reason picker IS the confirmation: it cannot be submitted without one.
                Rejecting notifies everyone affected, and now tells them why. */}
            <RejectionReasonDialog
                isOpen={rejecting !== null}
                onClose={() => setRejecting(null)}
                entryCount={rejecting?.scope === 'one' ? 1 : selectedIds.size}
                targetLabel={rejecting?.scope === 'one' ? rejecting.label : undefined}
                submitting={working}
                onSubmit={submitRejection}
            />
        </>
    );
};

export default ApprovalQueue;
