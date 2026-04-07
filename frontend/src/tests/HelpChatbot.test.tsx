import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HelpChatbot from '../components/HelpChatbot';

describe('HelpChatbot', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('user_role', 'Manager');
    });

    it('answers access diagnostics questions with the current Team page location', async () => {
        render(<HelpChatbot />);

        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: /help chatbot/i }));

        await waitFor(() => {
            expect(screen.getByText(/how can i help you today/i)).toBeInTheDocument();
        });

        await user.type(screen.getByPlaceholderText(/type your question/i), 'Where is the access diagnostics panel?');
        await user.click(screen.getByRole('button', { name: /send/i }));

        await waitFor(() => {
            expect(screen.getByText(/Access Diagnostics is on the Team Management page/i)).toBeInTheDocument();
            expect(screen.getByText(/Look at the right-hand panel beside the Team Directory/i)).toBeInTheDocument();
        });
    });
});
