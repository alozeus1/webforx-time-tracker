import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApprovalQueue from '../components/ApprovalQueue';
import type { TimeEntrySummary } from '../types/api';

// The reason picker reads the taxonomy from the API rather than keeping a second copy
// of it, so the dialog needs the endpoint stubbed. Codes and labels here mirror
// backend/src/constants/rejectionReasons.ts, which is the single source of truth.
vi.mock('../services/api', () => ({
    __esModule: true,
    default: {
        get: vi.fn().mockResolvedValue({
            data: {
                reasons: [
                    { code: 'WRONG_PROJECT', label: 'Wrong or missing project assignment', requires_note: false },
                    { code: 'INSUFFICIENT_DESCRIPTION', label: 'Task description too vague or incomplete', requires_note: false },
                    { code: 'OTHER', label: 'Other — reason required', requires_note: true },
                ],
                note_max_length: 500,
            },
        }),
    },
    getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

const entry = (id: string, overrides: Partial<TimeEntrySummary> = {}): TimeEntrySummary => ({
    id,
    task_description: `Task ${id}`,
    duration: 3600,
    start_time: '2026-08-12T09:00:00.000Z',
    end_time: '2026-08-12T10:00:00.000Z',
    status: 'pending',
    user: {
        id: `user-${id}`,
        email: `${id}@webforxtech.com`,
        first_name: 'Ada',
        last_name: id.toUpperCase(),
        is_active: true,
    },
    ...overrides,
});

const renderQueue = (entries: TimeEntrySummary[], overrides: Partial<React.ComponentProps<typeof ApprovalQueue>> = {}) => {
    const onReviewOne = vi.fn();
    const onReviewBulk = vi.fn();
    render(
        <ApprovalQueue
            entries={entries}
            loading={false}
            onReviewOne={onReviewOne}
            onReviewBulk={onReviewBulk}
            {...overrides}
        />,
    );
    return { onReviewOne, onReviewBulk };
};

describe('ApprovalQueue', () => {
    it('shows an empty state rather than a bare table', () => {
        renderQueue([]);
        expect(screen.getByText('No pending entries require review.')).toBeInTheDocument();
    });

    it('still supports reviewing a single row', async () => {
        const user = userEvent.setup();
        const { onReviewOne } = renderQueue([entry('e1')]);

        await user.click(screen.getByLabelText(/^Approve Ada E1/));

        expect(onReviewOne).toHaveBeenCalledWith('e1', 'approve');
    });

    it('approves every selected row in one call', async () => {
        const user = userEvent.setup();
        const { onReviewBulk } = renderQueue([entry('e1'), entry('e2'), entry('e3')]);

        await user.click(screen.getByLabelText('Select all pending entries'));
        expect(screen.getByText('3 selected')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Approve all' }));

        expect(onReviewBulk).toHaveBeenCalledWith(['e1', 'e2', 'e3'], 'approve');
    });

    it('lets rows be picked individually', async () => {
        const user = userEvent.setup();
        const { onReviewBulk } = renderQueue([entry('e1'), entry('e2')]);

        await user.click(screen.getByLabelText(/^Select Ada E2/));
        await user.click(screen.getByRole('button', { name: 'Approve all' }));

        expect(onReviewBulk).toHaveBeenCalledWith(['e2'], 'approve');
    });

    it('toggles a row back off', async () => {
        const user = userEvent.setup();
        renderQueue([entry('e1')]);

        await user.click(screen.getByLabelText(/^Select Ada E1/));
        expect(screen.getByText('1 selected')).toBeInTheDocument();

        await user.click(screen.getByLabelText(/^Deselect Ada E1/));
        expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    });

    // Rejecting notifies everyone affected, so it asks first — and since 2026-09 what it
    // asks for is a reason, not just confirmation. The reason picker IS the confirm step.
    it('will not reject in bulk without a reason, then applies one reason to the selection', async () => {
        const user = userEvent.setup();
        const { onReviewBulk } = renderQueue([entry('e1'), entry('e2')]);

        await user.click(screen.getByLabelText('Select all pending entries'));
        await user.click(screen.getByRole('button', { name: 'Reject all' }));

        expect(onReviewBulk).not.toHaveBeenCalled();
        expect(await screen.findByRole('dialog', { name: /Reject 2 entries/ })).toBeInTheDocument();

        const submit = screen.getByRole('button', { name: 'Reject 2 entries' });
        expect(submit).toBeDisabled();

        await waitFor(() => expect(screen.getByRole('option', { name: 'Wrong or missing project assignment' })).toBeInTheDocument());
        await user.selectOptions(screen.getByLabelText(/^Reason/), 'WRONG_PROJECT');

        await user.click(screen.getByRole('button', { name: 'Reject 2 entries' }));
        await waitFor(() => expect(onReviewBulk).toHaveBeenCalledWith(
            ['e1', 'e2'],
            'reject',
            { rejection_reason_code: 'WRONG_PROJECT', rejection_reason_note: null },
        ));
    });

    it('requires a note when the reason is OTHER', async () => {
        const user = userEvent.setup();
        const { onReviewOne } = renderQueue([entry('e1')]);

        await user.click(screen.getByLabelText(/^Reject Ada E1/));
        await waitFor(() => expect(screen.getByRole('option', { name: 'Other — reason required' })).toBeInTheDocument());
        await user.selectOptions(screen.getByLabelText(/^Reason/), 'OTHER');

        // Selecting OTHER alone is not enough.
        expect(screen.getByRole('button', { name: 'Reject this entry' })).toBeDisabled();

        await user.type(screen.getByLabelText(/^Note/), 'Logged against the wrong client.');
        await user.click(screen.getByRole('button', { name: 'Reject this entry' }));

        await waitFor(() => expect(onReviewOne).toHaveBeenCalledWith(
            'e1',
            'reject',
            { rejection_reason_code: 'OTHER', rejection_reason_note: 'Logged against the wrong client.' },
        ));
    });

    it('surfaces an attested over-cap entry and its justification', () => {
        renderQueue([entry('e1', {
            over_daily_cap: true,
            overtime_reason: 'Production incident on the bastion deployment.',
            intelligence: { score: 59, level: 'medium', reasons: ['logged past daily cap'] },
        })]);

        expect(screen.getByText('over daily cap')).toBeInTheDocument();
        expect(screen.getByText(/Production incident on the bastion deployment/)).toBeInTheDocument();
        expect(screen.getByText(/medium risk · 59/)).toBeInTheDocument();
    });

    it('labels a clamped abandoned timer distinctly from an ordinary cap stop', () => {
        renderQueue([entry('e1', {
            auto_stopped: true,
            stop_reason: 'abandoned_timer',
            intelligence: { score: 48, level: 'medium', reasons: ['timer left running, trimmed to last activity'] },
        })]);

        expect(screen.getByText('auto-stopped')).toBeInTheDocument();
        expect(screen.getByText('Abandoned — trimmed')).toBeInTheDocument();
    });

    it('drops selections for rows that leave the queue', async () => {
        const user = userEvent.setup();
        const onReviewOne = vi.fn();
        const onReviewBulk = vi.fn();

        const { rerender } = render(
            <ApprovalQueue entries={[entry('e1'), entry('e2')]} loading={false} onReviewOne={onReviewOne} onReviewBulk={onReviewBulk} />,
        );

        await user.click(screen.getByLabelText('Select all pending entries'));
        expect(screen.getByText('2 selected')).toBeInTheDocument();

        // e2 was approved elsewhere and the queue refetched.
        rerender(
            <ApprovalQueue entries={[entry('e1')]} loading={false} onReviewOne={onReviewOne} onReviewBulk={onReviewBulk} />,
        );

        await waitFor(() => expect(screen.getByText('1 selected')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: 'Approve all' }));
        expect(onReviewBulk).toHaveBeenCalledWith(['e1'], 'approve');
    });
});
