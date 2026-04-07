import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Team from '../pages/Team';
import api from '../services/api';

vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Bar: () => null,
}));

vi.mock('../services/api', async () => {
    const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
    return {
        ...actual,
        default: {
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
        },
    };
});

type MockedApi = {
    get: ReturnType<typeof vi.fn>;
};

const mockedApi = api as unknown as MockedApi;

describe('Team access diagnostics search', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem('user_role', 'Manager');
        localStorage.setItem('user_profile', JSON.stringify({
            id: 'manager-1',
            email: 'manager@webforxtech.com',
            first_name: 'Manager',
            last_name: 'User',
            role: 'Manager',
        }));

        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/users') {
                return Promise.resolve({
                    data: [
                        { id: 'u1', first_name: 'Alice', last_name: 'Johnson', email: 'alice@webforxtech.com', is_active: true, role: { name: 'Employee' } },
                        { id: 'u2', first_name: 'Bob', last_name: 'Williams', email: 'bob@webforxtech.com', is_active: true, role: { name: 'Employee' } },
                        { id: 'u3', first_name: 'Carla', last_name: 'Owens', email: 'carla@webforxtech.com', is_active: false, role: { name: 'Manager' } },
                    ],
                });
            }

            if (url === '/users/roles') {
                return Promise.resolve({ data: { roles: [{ id: 'r1', name: 'Employee' }, { id: 'r2', name: 'Manager' }] } });
            }

            if (url === '/reports/dashboard?range=7d') {
                return Promise.resolve({ data: { userBreakdown: [] } });
            }

            if (url.startsWith('/users/') && url.endsWith('/auth-events?limit=20')) {
                return Promise.resolve({ data: { events: [] } });
            }

            return Promise.resolve({ data: {} });
        });
    });

    it('filters diagnostics user options by search text', async () => {
        render(<Team />);

        const user = userEvent.setup();
        const diagnosticsSearch = await screen.findByLabelText(/search access diagnostics users/i);

        await user.type(diagnosticsSearch, 'carla');

        await waitFor(() => {
            expect(screen.getByText('Showing 1 of 3 team members. Current selection is still shown until you choose a filtered match.')).toBeInTheDocument();
        });

        const select = screen.getByLabelText(/inspect team member/i);
        const options = within(select).getAllByRole('option');

        expect(options).toHaveLength(2);
        expect(within(select).getByRole('option', { name: /Carla Owens/i })).toBeInTheDocument();
        expect(within(select).queryByRole('option', { name: /Bob Williams/i })).not.toBeInTheDocument();
    });
});
