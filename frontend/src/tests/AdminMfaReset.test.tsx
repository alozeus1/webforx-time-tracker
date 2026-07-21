import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Admin from '../pages/Admin';
import api from '../services/api';

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
    post: ReturnType<typeof vi.fn>;
};

const mockedApi = api as unknown as MockedApi;

describe('Admin users tab — MFA reset', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('confirm', vi.fn(() => true));

        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/users') {
                return Promise.resolve({
                    data: [
                        {
                            id: 'user-1',
                            email: 'alice@test.com',
                            first_name: 'Alice',
                            last_name: 'Smith',
                            is_active: true,
                            mfa_enabled: true,
                            role: { name: 'Employee' },
                        },
                        {
                            id: 'user-2',
                            email: 'bob@test.com',
                            first_name: 'Bob',
                            last_name: 'Jones',
                            is_active: true,
                            mfa_enabled: false,
                            role: { name: 'Employee' },
                        },
                    ],
                });
            }

            if (url === '/projects') return Promise.resolve({ data: [] });
            if (url === '/integrations') return Promise.resolve({ data: { integrations: [] } });

            return Promise.resolve({ data: {} });
        });

        mockedApi.post.mockResolvedValue({ data: { message: 'MFA has been reset.', mfa_enabled: false } });
    });

    it('shows a Reset action only for users with MFA enabled, and calls the reset endpoint', async () => {
        render(
            <MemoryRouter initialEntries={['/admin?tab=users']}>
                <Admin />
            </MemoryRouter>
        );

        await screen.findByText('Alice Smith');

        const resetButtons = await screen.findAllByRole('button', { name: /reset mfa/i });
        expect(resetButtons).toHaveLength(1); // only Alice (mfa_enabled: true), not Bob

        await userEvent.click(resetButtons[0]);

        await waitFor(() => {
            expect(mockedApi.post).toHaveBeenCalledWith('/users/user-1/mfa/reset');
        });
    });
});
