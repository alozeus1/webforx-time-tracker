import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HelpChatbot from '../components/HelpChatbot';

const openBot = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /help chatbot/i }));
    await waitFor(() => {
        expect(screen.getByText(/how can i help you today/i)).toBeInTheDocument();
    });
    return user;
};

const ask = async (user: ReturnType<typeof userEvent.setup>, question: string) => {
    await user.type(screen.getByPlaceholderText(/type your question/i), question);
    await user.click(screen.getByRole('button', { name: /send/i }));
};

describe('HelpChatbot', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('answers access diagnostics questions with the current Team page location (manager)', async () => {
        localStorage.setItem('user_role', 'Manager');
        render(<HelpChatbot />);
        const user = await openBot();

        await ask(user, 'Where is the access diagnostics panel?');

        await waitFor(() => {
            expect(screen.getByText(/Access Diagnostics is on the Team Management page/i)).toBeInTheDocument();
            expect(screen.getByText(/Look at the right-hand panel beside the Team Directory/i)).toBeInTheDocument();
        });
    });

    it('answers leave / PTO questions for an employee', async () => {
        localStorage.setItem('user_role', 'Employee');
        render(<HelpChatbot />);
        const user = await openBot();

        await ask(user, 'How do I request time off');

        await waitFor(() => {
            expect(screen.getByText(/Leave & PTO page/i)).toBeInTheDocument();
        });
    });

    it('explains how to enable two-factor authentication', async () => {
        localStorage.setItem('user_role', 'Employee');
        render(<HelpChatbot />);
        const user = await openBot();

        await ask(user, 'How do I enable two factor authentication');

        await waitFor(() => {
            expect(screen.getByText(/Two-Factor Authentication/i)).toBeInTheDocument();
        });
    });

    it('explains the user-facing security and data-protection guidance', async () => {
        localStorage.setItem('user_role', 'Employee');
        render(<HelpChatbot />);
        const user = await openBot();

        await ask(user, 'How is my data protected?');

        await waitFor(() => {
            expect(screen.getByText(/organization data are protected by sign-in controls and role-based access/i)).toBeInTheDocument();
            expect(screen.getByText(/Never share your password, one-time code, or integration credentials/i)).toBeInTheDocument();
        });
    });

    it('gives the CORRECT manual-entry steps (Timeline -> Add Entry, not a Timer mode)', async () => {
        localStorage.setItem('user_role', 'Employee');
        render(<HelpChatbot />);
        const user = await openBot();

        await ask(user, 'How do I add time manually');

        await waitFor(() => {
            expect(screen.getByText(/Go to the Timeline page/i)).toBeInTheDocument();
            expect(screen.getByText(/Click "Add Entry"/i)).toBeInTheDocument();
        });
    });

    it('explains employment type / intern hours for a manager', async () => {
        localStorage.setItem('user_role', 'Manager');
        render(<HelpChatbot />);
        const user = await openBot();

        await ask(user, 'How do I mark someone as an intern');

        await waitFor(() => {
            expect(screen.getByText(/Every member has an EMPLOYMENT TYPE/i)).toBeInTheDocument();
            expect(screen.getByText(/minimum weekly-hours/i)).toBeInTheDocument();
        });
    });

    it('does not expose admin-only topics (payroll) to an employee', async () => {
        localStorage.setItem('user_role', 'Employee');
        render(<HelpChatbot />);
        const user = await openBot();

        await ask(user, 'How do I lock a payroll period');

        await waitFor(() => {
            expect(screen.getByText(/could not find an exact match/i)).toBeInTheDocument();
        });
        expect(screen.queryByText(/Payroll periods live in the Admin page/i)).not.toBeInTheDocument();
    });
});
