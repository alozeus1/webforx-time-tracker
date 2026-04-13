import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Workday from '../pages/Workday';
import api from '../services/api';

vi.mock('../services/api', async () => {
    const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
    return {
        ...actual,
        default: {
            get: vi.fn(),
            post: vi.fn(),
        },
    };
});

type MockedApi = {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
};

const mockedApi = api as unknown as MockedApi;

describe('Workday page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('user_role', 'Admin');
    });

    it('keeps the core workday view available when operations insights fail', async () => {
        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/timers/me') {
                return Promise.resolve({ data: { entries: [], activeTimer: null } });
            }
            if (url === '/projects') {
                return Promise.resolve({ data: [{ id: 'proj-1', name: 'Platform Engineering' }] });
            }
            if (url === '/users/me/wellbeing') {
                return Promise.resolve({
                    data: {
                        sevenDayHours: 4,
                        averageDailyHours: 0.57,
                        burnoutThresholdHours: 50,
                        cautionThresholdHours: 45,
                        hoursUntilBurnout: 46,
                        weeklyHourLimit: 40,
                        status: 'balanced',
                        workloadAlerts: [],
                    },
                });
            }
            if (url === '/calendar/status') {
                return Promise.resolve({ data: { configured: false, connected: false, provider: 'google' } });
            }
            if (url === '/integrations/task-sources') {
                return Promise.resolve({ data: { sources: [] } });
            }
            if (url === '/integrations/github/commits') {
                return Promise.resolve({ data: { commits: [] } });
            }
            if (url === '/reports/operations') {
                return Promise.reject({
                    response: {
                        status: 500,
                        data: { message: 'Internal server error while loading operations insights' },
                    },
                });
            }

            return Promise.resolve({ data: {} });
        });

        render(<Workday />);

        expect(await screen.findByText('Workday Command Center')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText('Tracked Today')).toBeInTheDocument();
        });

        expect(screen.getByText('Team operations insights are temporarily unavailable.')).toBeInTheDocument();
        expect(screen.queryByText('Internal server error while loading operations insights')).not.toBeInTheDocument();
    });

    it('keeps the core workday view available when project context fails', async () => {
        localStorage.setItem('user_role', 'Employee');

        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/timers/me') {
                return Promise.resolve({ data: { entries: [], activeTimer: null } });
            }
            if (url === '/projects') {
                return Promise.reject({
                    response: {
                        status: 500,
                        data: { message: 'Internal server error' },
                    },
                });
            }
            if (url === '/users/me/wellbeing') {
                return Promise.resolve({
                    data: {
                        sevenDayHours: 4,
                        averageDailyHours: 0.57,
                        burnoutThresholdHours: 50,
                        cautionThresholdHours: 45,
                        hoursUntilBurnout: 46,
                        weeklyHourLimit: 40,
                        status: 'balanced',
                        workloadAlerts: [],
                    },
                });
            }
            if (url === '/calendar/status') {
                return Promise.resolve({ data: { configured: false, connected: false, provider: 'google' } });
            }
            if (url === '/integrations/task-sources') {
                return Promise.resolve({ data: { sources: [] } });
            }
            if (url === '/integrations/github/commits') {
                return Promise.resolve({ data: { commits: [] } });
            }

            return Promise.resolve({ data: {} });
        });

        render(<Workday />);

        expect(await screen.findByText('Workday Command Center')).toBeInTheDocument();
        expect(screen.getByText('Project context is temporarily unavailable.')).toBeInTheDocument();
        expect(screen.queryByText(/^Internal server error$/i)).not.toBeInTheDocument();
    });
});
