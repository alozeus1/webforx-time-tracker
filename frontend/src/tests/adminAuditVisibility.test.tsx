import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Admin from '../pages/Admin';
import api from '../services/api';

vi.mock('../services/api', async () => {
    const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
    return {
        ...actual,
        default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
    };
});

const mockedApi = api as unknown as { get: ReturnType<typeof vi.fn> };

/**
 * The audit feed is the record of every action taken across the whole app, so it is a
 * privileged view: its endpoint is `requireRole(['Admin'])`. But /admin is reachable by
 * Managers too, and the tab strip used to render every tab unconditionally — which gave
 * Managers a privileged-looking tab whose fetch could only ever 403.
 */
describe('Admin audit log visibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // List endpoints must return arrays — the page maps over them during render.
        mockedApi.get.mockImplementation((url: string) => {
            if (['/projects', '/users', '/integrations'].includes(url)) {
                return Promise.resolve({ data: [] });
            }
            if (url === '/admin/teams') return Promise.resolve({ data: { teams: [] } });
            if (url === '/admin/notifications') return Promise.resolve({ data: { notifications: [] } });
            if (url === '/timers/corrections/review') return Promise.resolve({ data: { corrections: [] } });
            if (url === '/admin/audit-logs') return Promise.resolve({ data: { logs: [] } });
            return Promise.resolve({ data: {} });
        });
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    const renderAdmin = (initialEntry: string) => render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Admin />
        </MemoryRouter>,
    );

    it('shows the Audit Logs tab to an admin', async () => {
        window.localStorage.setItem('user_role', 'Admin');
        renderAdmin('/admin');

        await waitFor(() => {
            expect(screen.getByText('Audit Logs')).toBeInTheDocument();
        });
    });

    it('hides the Audit Logs tab from a manager', async () => {
        window.localStorage.setItem('user_role', 'Manager');
        renderAdmin('/admin');

        await waitFor(() => {
            expect(screen.getByText(/teams/i)).toBeInTheDocument();
        });
        expect(screen.queryByText('Audit Logs')).not.toBeInTheDocument();
    });

    // A hand-typed URL must not park a manager on a permanently empty tab.
    it('falls back to projects when a manager deep-links to ?tab=audit', async () => {
        window.localStorage.setItem('user_role', 'Manager');
        renderAdmin('/admin?tab=audit');

        await waitFor(() => {
            expect(screen.queryByText('Audit Logs')).not.toBeInTheDocument();
        });
        expect(mockedApi.get).not.toHaveBeenCalledWith('/admin/audit-logs');
    });

    it('still fetches the feed for an admin who deep-links to ?tab=audit', async () => {
        window.localStorage.setItem('user_role', 'Admin');
        renderAdmin('/admin?tab=audit');

        await waitFor(() => {
            expect(mockedApi.get).toHaveBeenCalledWith('/admin/audit-logs');
        });
    });
});
