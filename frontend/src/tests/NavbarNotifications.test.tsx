import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navbar from '../components/Navbar';
import api from '../services/api';

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
    useNavigate: () => navigateMock,
    useLocation: () => ({ pathname: '/dashboard' }),
}));

vi.mock('../services/api', async () => {
    const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
    return {
        ...actual,
        default: {
            get: vi.fn(),
            delete: vi.fn(),
        },
    };
});

type MockedApi = {
    get: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
};

const mockedApi = api as unknown as MockedApi;

describe('Navbar notifications', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('user_role', 'Employee');
    });

    it('groups unread and read notifications and marks an opened item as read', async () => {
        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/users/me/notifications') {
                return Promise.resolve({
                    data: {
                        unread_count: 50,
                        total_count: 51,
                        notifications: [
                            {
                                id: 'notif-1',
                                type: 'idle_warning',
                                message: 'You appear inactive.',
                                is_read: false,
                                created_at: '2026-04-09T10:00:00.000Z',
                            },
                            {
                                id: 'notif-2',
                                type: 'report',
                                message: 'Weekly summary ready.',
                                is_read: true,
                                created_at: '2026-04-09T09:00:00.000Z',
                            },
                        ],
                    },
                });
            }

            if (url === '/users/me/notifications/notif-1') {
                return Promise.resolve({
                    data: {
                        notification: {
                            id: 'notif-1',
                            type: 'idle_warning',
                            message: 'You appear inactive.',
                            is_read: true,
                            created_at: '2026-04-09T10:00:00.000Z',
                        },
                    },
                });
            }

            return Promise.resolve({ data: {} });
        });

        render(<Navbar onMenuClick={() => undefined} />);

        const bell = await screen.findByRole('button', { name: /view notifications/i });
        expect(screen.getByText('50')).toBeInTheDocument();
        await userEvent.click(bell);

        expect(await screen.findByText('Unread')).toBeInTheDocument();
        expect(screen.getByText('Read')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: /you appear inactive/i }));

        await waitFor(() => {
            expect(mockedApi.get).toHaveBeenCalledWith('/users/me/notifications/notif-1');
        });
        await waitFor(() => {
            expect(screen.getByText('49')).toBeInTheDocument();
        });
        expect(screen.getByText('Back')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('deletes a notification from the active list', async () => {
        mockedApi.get.mockResolvedValue({
            data: {
                unread_count: 1,
                total_count: 1,
                notifications: [
                    {
                        id: 'notif-1',
                        type: 'idle_warning',
                        message: 'You appear inactive.',
                        is_read: false,
                        created_at: '2026-04-09T10:00:00.000Z',
                    },
                ],
            },
        });
        mockedApi.delete.mockResolvedValue({ data: { message: 'Notification deleted' } });

        render(<Navbar onMenuClick={() => undefined} />);

        const bell = await screen.findByRole('button', { name: /view notifications/i });
        await userEvent.click(bell);
        await userEvent.click(screen.getByRole('button', { name: /delete/i }));

        await waitFor(() => {
            expect(mockedApi.delete).toHaveBeenCalledWith('/users/me/notifications/notif-1');
        });
        expect(screen.queryByText('1')).not.toBeInTheDocument();
        expect(screen.getByText('No recent notifications.')).toBeInTheDocument();
    });
});
