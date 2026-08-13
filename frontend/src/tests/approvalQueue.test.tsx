import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApprovalQueue from '../components/ApprovalQueue';
import type { TimeEntrySummary } from '../types/api';

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

    // Rejecting notifies everyone affected, so it asks first. Approving does not.
    it('confirms before rejecting in bulk', async () => {
        const user = userEvent.setup();
        const { onReviewBulk } = renderQueue([entry('e1')]);

        await user.click(screen.getByLabelText(/^Select Ada E1/));
        await user.click(screen.getByRole('button', { name: 'Reject all' }));

        expect(onReviewBulk).not.toHaveBeenCalled();
        expect(screen.getByText('Reject 1 entry?')).toBeInTheDocument();

        // Two buttons now carry that name: the bulk bar and the dialog's confirm.
        const rejectButtons = screen.getAllByRole('button', { name: 'Reject all' });
        expect(rejectButtons).toHaveLength(2);

        await user.click(rejectButtons[1]);
        await waitFor(() => expect(onReviewBulk).toHaveBeenCalledWith(['e1'], 'reject'));
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
