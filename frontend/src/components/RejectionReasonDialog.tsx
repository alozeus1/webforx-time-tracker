import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import AccessibleDialog from './AccessibleDialog';
import api, { getApiErrorMessage } from '../services/api';
import type { RejectionReasonInput, RejectionReasonOption, RejectionReasonsResponse } from '../types/api';

/**
 * The reason a manager must give before a rejection can be submitted.
 *
 * Shared by the single-entry reject button and the bulk bar, because the two paths
 * having different rules is exactly how one of them ends up exempt. Bulk applies one
 * reason to the whole selection rather than blocking bulk review.
 *
 * The option list is fetched from GET /timers/rejection-reasons rather than hardcoded
 * here: the taxonomy lives once, in backend/src/constants/rejectionReasons.ts. A fetch
 * failure disables submission and says so, rather than silently offering a shorter list.
 *
 * Uses a native <select> and <textarea> — keyboard navigable and screen-reader labelled
 * for free, no combobox to get wrong, and no runtime style injection (the production CSP
 * blocks that; it has blanked a page here before).
 *
 * The form is a separate component mounted only while the dialog is open, so each
 * opening starts from a genuinely fresh state rather than an effect resetting fields
 * after a render — which is both a cascading render and a frame of stale values.
 */

interface RejectionReasonDialogProps {
    isOpen: boolean;
    onClose: () => void;
    /** How many entries this rejection will apply to. */
    entryCount: number;
    /** Short description of the target, e.g. the task name for a single entry. */
    targetLabel?: string;
    submitting?: boolean;
    onSubmit: (reason: RejectionReasonInput) => Promise<void> | void;
}

const RejectionReasonForm: React.FC<Omit<RejectionReasonDialogProps, 'isOpen'>> = ({
    onClose,
    entryCount,
    targetLabel,
    submitting = false,
    onSubmit,
}) => {
    const [options, setOptions] = useState<RejectionReasonOption[]>([]);
    const [noteMaxLength, setNoteMaxLength] = useState(500);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [note, setNote] = useState('');
    const [touched, setTouched] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const response = await api.get<RejectionReasonsResponse>('/timers/rejection-reasons');
                if (cancelled) return;
                setOptions(response.data.reasons || []);
                setNoteMaxLength(response.data.note_max_length || 500);
                setLoadError(null);
            } catch (error) {
                if (cancelled) return;
                setLoadError(getApiErrorMessage(error, 'Could not load rejection reasons. Try again.'));
            }
        })();

        return () => { cancelled = true; };
    }, []);

    const selected = useMemo(() => options.find((option) => option.code === code) ?? null, [options, code]);
    const noteRequired = selected?.requires_note ?? false;
    const noteMissing = noteRequired && note.trim().length === 0;
    const noteTooLong = note.trim().length > noteMaxLength;
    const canSubmit = Boolean(code) && !noteMissing && !noteTooLong && !submitting && !loadError;

    const handleSubmit = async () => {
        setTouched(true);
        if (!canSubmit) return;
        await onSubmit({ rejection_reason_code: code, rejection_reason_note: note.trim() || null });
    };

    const heading = entryCount === 1
        ? 'Reject this entry'
        : `Reject ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`;

    return (
        <AccessibleDialog
            isOpen
            onClose={onClose}
            ariaLabelledBy="rejection-reason-heading"
            panelClassName="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900"
        >
            <div className="space-y-4">
                <div>
                    <h2 id="rejection-reason-heading" className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        {heading}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        {targetLabel ? `“${targetLabel}” — ` : ''}
                        The reason is sent to {entryCount === 1 ? 'the person who logged it' : 'everyone affected'} and
                        shown on their timesheet. Rejected hours do not count toward a weekly minimum.
                    </p>
                </div>

                {loadError && (
                    <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        {loadError}
                    </p>
                )}

                <div>
                    <label htmlFor="rejection-reason-code" className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Reason <span aria-hidden="true" className="text-rose-600">*</span>
                    </label>
                    <select
                        id="rejection-reason-code"
                        value={code}
                        required
                        aria-required="true"
                        aria-invalid={touched && !code}
                        aria-describedby={touched && !code ? 'rejection-reason-code-error' : undefined}
                        onChange={(event) => setCode(event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    >
                        <option value="">Select a reason…</option>
                        {options.map((option) => (
                            <option key={option.code} value={option.code}>{option.label}</option>
                        ))}
                    </select>
                    {touched && !code && (
                        <p id="rejection-reason-code-error" role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                            Choose a reason before rejecting.
                        </p>
                    )}
                </div>

                <div>
                    <label htmlFor="rejection-reason-note" className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Note {noteRequired ? <span aria-hidden="true" className="text-rose-600">*</span> : <span className="font-normal text-slate-400">(optional)</span>}
                    </label>
                    <textarea
                        id="rejection-reason-note"
                        rows={3}
                        value={note}
                        maxLength={noteMaxLength}
                        aria-required={noteRequired}
                        aria-invalid={touched && (noteMissing || noteTooLong)}
                        aria-describedby="rejection-reason-note-help"
                        onChange={(event) => setNote(event.target.value)}
                        placeholder={noteRequired ? 'Required — explain what was wrong.' : 'Add anything that helps them fix it.'}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <p id="rejection-reason-note-help" className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {touched && noteMissing
                            ? 'A note is required when the reason is “Other”.'
                            : `${note.trim().length}/${noteMaxLength} characters.`}
                    </p>
                </div>

                <div className="flex justify-end gap-2">
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary !bg-rose-600"
                        disabled={!canSubmit}
                        onClick={() => void handleSubmit()}
                    >
                        {submitting ? 'Rejecting…' : heading}
                    </button>
                </div>
            </div>
        </AccessibleDialog>
    );
};

/** Mounts the form only while open, so every opening starts from clean fields. */
const RejectionReasonDialog: React.FC<RejectionReasonDialogProps> = ({ isOpen, ...rest }) =>
    (isOpen ? <RejectionReasonForm {...rest} /> : null);

export default RejectionReasonDialog;
