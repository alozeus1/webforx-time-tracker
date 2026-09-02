/**
 * Presentation helpers shared by every surface that renders a time entry.
 *
 * These lived as byte-identical copies inside Timesheet.tsx and Reports.tsx, which is
 * how the two pages drifted apart. They sit in their own module rather than beside a
 * component so React Fast Refresh keeps working (a component file must export only
 * components).
 */

export const formatStopReason = (reason?: string | null): string | null => {
    if (!reason) return null;
    if (reason === 'active_duration_limit') return '8h cap reached';
    if (reason === 'abandoned_timer') return 'Abandoned — trimmed';
    if (reason === 'idle_timeout') return 'Idle timeout';
    if (reason === 'heartbeat_missing') return 'Heartbeat missing';
    if (reason === 'pause_expired') return 'Paused too long';
    return reason.replace(/_/g, ' ');
};

/** Compact duration for table cells: "45m", "0.75h", "4.6h". */
export const formatEntryDuration = (seconds: number): string => {
    const hours = seconds / 3600;
    if (hours <= 0) return '0.0h';
    if (hours < 0.1) return `${Math.max(1, Math.round(hours * 60))}m`;
    if (hours < 1) return `${hours.toFixed(2)}h`;
    return `${hours.toFixed(1)}h`;
};

export const riskChipClass = (level: string): string => {
    if (level === 'high') return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
    if (level === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
};

export type ReviewAction = 'approve' | 'reject';

/**
 * Chip colours for a time entry's review status.
 *
 * Reports previously hardcoded emerald for every status, so a rejected entry rendered
 * as a green "rejected" chip — reassuring and wrong. An unknown status falls back to
 * slate rather than borrowing a colour that implies a verdict.
 */
export const entryStatusChipClass = (status: string): string => {
    if (status === 'approved') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (status === 'rejected') return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400';
    if (status === 'pending') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
};

/**
 * The reason label to show for a rejected entry.
 *
 * Entries rejected before the reason taxonomy shipped carry no code. They are
 * historical and must never be given a fabricated reason — but they must not render
 * blank either, so they read as "No reason recorded".
 */
export const rejectionReasonText = (entry: { rejection_reason_label?: string | null }): string =>
    entry.rejection_reason_label || 'No reason recorded';
