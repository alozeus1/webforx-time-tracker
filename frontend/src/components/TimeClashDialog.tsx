import React from 'react';
import AccessibleDialog from './AccessibleDialog';
import type { TimeClashConflict } from '../types/api';

/**
 * Shown when a write is refused because the requested window already has time on it.
 *
 * The point is to name the actual clash rather than say "overlap detected": people
 * file the same correction twice, or ask for time a timer already captured, and the
 * only useful response is showing them exactly what is already there.
 */

const formatWindow = (start: string, end: string): string => {
    const from = new Date(start);
    const to = new Date(end);
    const day = from.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    const time = (value: Date) => value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${day} · ${time(from)}–${time(to)}`;
};

interface TimeClashDialogProps {
    isOpen: boolean;
    message?: string;
    conflicts: TimeClashConflict[];
    onAdjust: () => void;
    onClose: () => void;
}

const TimeClashDialog: React.FC<TimeClashDialogProps> = ({
    isOpen,
    message,
    conflicts,
    onAdjust,
    onClose,
}) => (
    <AccessibleDialog
        isOpen={isOpen}
        onClose={onClose}
        ariaLabel="Time clash detected"
        panelClassName="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900"
    >
        <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Time clash</p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                That time is already on your timeline
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
                {message || 'This clashes with time already recorded or requested.'}
            </p>

            <ul className="space-y-2">
                {conflicts.map((conflict) => (
                    <li
                        key={`${conflict.kind}-${conflict.id}`}
                        className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                    >
                        <p className="font-semibold text-slate-800 dark:text-slate-100">
                            {formatWindow(conflict.start, conflict.end)}
                        </p>
                        <p className="text-slate-600 dark:text-slate-300">{conflict.label}</p>
                        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                            {conflict.kind === 'correction' ? 'Pending correction request' : `Time entry · ${conflict.status}`}
                        </p>
                    </li>
                ))}
            </ul>

            <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-outline" onClick={onClose}>
                    Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={onAdjust}>
                    Adjust my times
                </button>
            </div>
        </div>
    </AccessibleDialog>
);

export default TimeClashDialog;
