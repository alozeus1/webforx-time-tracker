import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FeedbackProvider } from '../components/FeedbackProvider';
import { useFeedback } from '../hooks/useFeedback';

const Harness = () => {
  const { confirm, toast } = useFeedback();
  const [result, setResult] = useState('waiting');
  return (
    <>
      <button type="button" onClick={async () => setResult(await confirm({ message: 'Delete this record?', destructive: true }) ? 'confirmed' : 'cancelled')}>Delete record</button>
      <button type="button" onClick={() => toast('Save failed', { tone: 'error' })}>Show error</button>
      <output>{result}</output>
    </>
  );
};

describe('FeedbackProvider', () => {
  it('traps focus, cancels on Escape, and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<FeedbackProvider><Harness /></FeedbackProvider>);

    const trigger = screen.getByRole('button', { name: 'Delete record' });
    await user.click(trigger);
    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription('Delete this record?');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText('cancelled')).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('announces error toasts and allows dismissal', async () => {
    const user = userEvent.setup();
    render(<FeedbackProvider><Harness /></FeedbackProvider>);
    await user.click(screen.getByRole('button', { name: 'Show error' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Save failed')).not.toBeInTheDocument();
  });
});
