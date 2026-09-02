/**
 * The single source of truth for why a timesheet entry was rejected.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Before 2026-09, rejecting an entry wrote `status: 'rejected'` and nothing else. The
 * owner got a notification saying their time "was rejected by your manager" and had no
 * way to learn why, no way to fix it, and — because /timesheet showed only total logged
 * hours — no way to even notice how much of their week had been thrown away. An intern
 * lost 7.58h of a 10.22h week that way and disputed the resulting compliance flag in
 * good faith, reading her own screen correctly.
 *
 * ONE MODULE, NOT TWO
 * -------------------
 * The brief for this work asked for a module shared by backend validation and the
 * frontend picker. `backend/` and `frontend/` are independent npm packages and
 * `backend/tsconfig.json` pins `rootDir: ./src`, so a file imported by both would break
 * `npm run build`. Rather than keep two copies that drift, this file is canonical and
 * the frontend never holds a second list:
 *
 *   - Entry payloads carry `rejection_reason_label` resolved here, so rendering an
 *     existing rejection needs no client-side table at all.
 *   - The manager's reason picker reads `GET /api/v1/timers/rejection-reasons`.
 *
 * Codes are stored, labels are not. Wording can be rewritten here without a migration.
 */

export const REJECTION_REASONS = [
    { code: 'EXCEEDS_DAILY_CAP', label: 'Exceeds the 8-hour daily cap' },
    { code: 'IDLE_TIMER_OVERRUN', label: 'Timer left running / idle — duration overstated' },
    { code: 'OVERLAPPING_ENTRY', label: 'Overlaps hours already submitted' },
    { code: 'WRONG_PROJECT', label: 'Wrong or missing project assignment' },
    { code: 'INSUFFICIENT_DESCRIPTION', label: 'Task description too vague or incomplete' },
    { code: 'NOT_COMPANY_WORK', label: 'Not company work' },
    { code: 'DUPLICATE_ENTRY', label: 'Duplicate of another entry' },
    { code: 'OTHER', label: 'Other — reason required' },
] as const;

export type RejectionReasonCode = (typeof REJECTION_REASONS)[number]['code'];

/** The only code that additionally demands a free-text note. */
export const REASON_CODE_REQUIRING_NOTE: RejectionReasonCode = 'OTHER';

/**
 * Free text reaches both HTML email and the DOM, so it is capped at the boundary
 * rather than trusted to be short. 500 characters is roughly a full paragraph —
 * enough to explain a rejection, small enough that it cannot be used to inflate a
 * notification email or a table cell.
 */
export const REJECTION_NOTE_MAX_LENGTH = 500;

const REASON_LABELS = new Map<string, string>(REJECTION_REASONS.map((r) => [r.code, r.label]));

export const isRejectionReasonCode = (value: unknown): value is RejectionReasonCode =>
    typeof value === 'string' && REASON_LABELS.has(value);

export const reasonRequiresNote = (code: string): boolean => code === REASON_CODE_REQUIRING_NOTE;

/**
 * Human label for a stored code.
 *
 * Returns null for null — every entry rejected before this feature shipped has no code,
 * and those rows must never be given a fabricated reason. Callers render the null case
 * as "No reason recorded".
 *
 * An unrecognised non-null code (a row written by an older or newer deploy) degrades to
 * the code itself rather than throwing: a timesheet must always render.
 */
export const rejectionReasonLabel = (code: string | null | undefined): string | null => {
    if (!code) return null;
    return REASON_LABELS.get(code) ?? code;
};

export interface RejectionReasonValidationError {
    status: 400;
    message: string;
}

export interface ValidatedRejectionReason {
    rejection_reason_code: RejectionReasonCode;
    rejection_reason_note: string | null;
}

/**
 * Validates the reason supplied with a rejection.
 *
 * Returns either the normalised pair to persist or the 400 body to send. Every write
 * path that can set `status: 'rejected'` runs this, so the rule cannot be true on one
 * endpoint and false on the bulk one.
 */
export const validateRejectionReason = (
    rawCode: unknown,
    rawNote: unknown,
): { ok: true; value: ValidatedRejectionReason } | { ok: false; error: RejectionReasonValidationError } => {
    if (!isRejectionReasonCode(rawCode)) {
        return {
            ok: false,
            error: {
                status: 400,
                message: `A rejection reason is required. rejection_reason_code must be one of: ${REJECTION_REASONS.map((r) => r.code).join(', ')}.`,
            },
        };
    }

    const note = typeof rawNote === 'string' ? rawNote.trim() : '';

    if (reasonRequiresNote(rawCode) && note.length === 0) {
        return {
            ok: false,
            error: { status: 400, message: 'rejection_reason_note is required when the reason is OTHER.' },
        };
    }

    if (note.length > REJECTION_NOTE_MAX_LENGTH) {
        return {
            ok: false,
            error: {
                status: 400,
                message: `rejection_reason_note must be ${REJECTION_NOTE_MAX_LENGTH} characters or fewer.`,
            },
        };
    }

    return { ok: true, value: { rejection_reason_code: rawCode, rejection_reason_note: note.length > 0 ? note : null } };
};
