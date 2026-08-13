import React, { useState } from 'react';
import AccessibleDialog from './AccessibleDialog';

/**
 * The two-tier daily-limit prompt.
 *
 * `floor` is a light, one-per-day nudge shown to interns when they pass their daily
 * expectation — informational, no justification, easy to dismiss.
 *
 * `cap` is the real guardrail. Going past the daily limit is allowed but must be
 * deliberate and attributable, so it requires a typed reason and an explicit
 * acknowledgement that the time will be flagged for review. The resulting entry is
 * marked `over_daily_cap` and lands at the top of the manager's queue.
 */

export type DailyCapDialogMode = 'floor' | 'cap';

/** Mirrors MIN_OVERTIME_REASON_LENGTH on the server, which is the real gate. */
export const MIN_OVERTIME_REASON_LENGTH = 20;

const formatHm = (seconds: number): string => {
    const total = Math.max(Math.round(seconds / 60), 0);
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    if (hours === 0) return `${minutes}m`;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
};

interface DailyCapDialogProps {
    isOpen: boolean;
    mode: DailyCapDialogMode;
    workedSeconds: number;
    capSeconds: number;
    floorSeconds: number;
    /** Cap mode only. Receives the justification the user typed. */
    onContinue: (reason: string) => void;
    onStop: () => void;
    onDismiss: () => void;
    submitting?: boolean;
}

const DailyCapDialog: React.FC<DailyCapDialogProps> = ({
    isOpen,
    mode,
    workedSeconds,
    capSeconds,
    floorSeconds,
    onContinue,
    onStop,
    onDismiss,
    submitting = false,
}) => {
    const [reason, setReason] = useState('');
    const [acknowledged, setAcknowledged] = useState(false);
    const [wasOpen, setWasOpen] = useState(isOpen);

    // Never carry a previous justification into a new prompt. Adjusted during render
    // rather than in an effect, which is React's recommended pattern for resetting
    // state in response to a prop change and avoids a cascading second render.
    if (wasOpen !== isOpen) {
        setWasOpen(isOpen);
        if (!isOpen) {
            setReason('');
            setAcknowledged(false);
        }
    }

    if (mode === 'floor') {
        return (
            <AccessibleDialog
                isOpen={isOpen}
                onClose={onDismiss}
                ariaLabel="Daily expectation reached"
                panelClassName="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900"
            >
                <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Daily target met</p>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                        You’ve passed your {formatHm(floorSeconds)} for today
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        You’ve tracked {formatHm(workedSeconds)} so far. Carry on if you have more to
                        do — you have until {formatHm(capSeconds)} before you reach your daily limit.
                    </p>
                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-left text-sm font-semibold text-white"
                            onClick={onDismiss}
                        >
                            Keep working
                        </button>
                        <button
                            type="button"
                            className="w-full rounded-md border border-slate-200 px-4 py-2.5 text-left text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300"
                            onClick={onStop}
                        >
                            Stop for today
                        </button>
                    </div>
                </div>
            </AccessibleDialog>
        );
    }

    const trimmed = reason.trim();
    const reasonTooShort = trimmed.length < MIN_OVERTIME_REASON_LENGTH;
    const canContinue = acknowledged && !reasonTooShort && !submitting;

    return (
        <AccessibleDialog
            isOpen={isOpen}
            // Not dismissable by backdrop: this is a decision, not a notice.
            onClose={onStop}
            closeOnBackdrop={false}
            ariaLabel="Daily time limit reached"
            panelClassName="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900"
        >
            <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Daily limit reached</p>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    You’ve reached your {formatHm(capSeconds)} limit for today
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                    You’ve tracked {formatHm(workedSeconds)}. You can keep going, but this time is
                    recorded as over your daily limit and goes to your manager flagged for review.
                </p>

                <label className="block space-y-1">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Why do you need more time today?
                    </span>
                    <textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={3}
                        placeholder="e.g. Production incident on the bastion deployment, agreed with my lead."
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <span className={`text-xs ${reasonTooShort ? 'text-rose-600' : 'text-slate-500'}`}>
                        {trimmed.length}/{MIN_OVERTIME_REASON_LENGTH} characters minimum
                    </span>
                </label>

                <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(event) => setAcknowledged(event.target.checked)}
                        className="mt-0.5"
                    />
                    <span>
                        I understand this time is over my daily limit and will be flagged for manager review.
                    </span>
                </label>

                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        disabled={!canContinue}
                        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-left text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => onContinue(trimmed)}
                    >
                        {submitting ? 'Submitting…' : 'Submit and continue working'}
                    </button>
                    <button
                        type="button"
                        className="w-full rounded-md border border-slate-200 px-4 py-2.5 text-left text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300"
                        onClick={onStop}
                    >
                        Stop for today
                    </button>
                </div>
            </div>
        </AccessibleDialog>
    );
};

export default DailyCapDialog;
