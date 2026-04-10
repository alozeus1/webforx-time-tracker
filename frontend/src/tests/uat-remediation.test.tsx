import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Invoices from '../pages/Invoices';
import Timesheet from '../pages/Timesheet';
import Timeline from '../pages/Timeline';
import Navbar from '../components/Navbar';
import Timer from '../pages/Timer';
import Dashboard from '../pages/Dashboard';
import api from '../services/api';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

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
    put: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
};

const mockedApi = api as unknown as MockedApi;

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('UAT remediation regressions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        mockNavigate.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows visible API error feedback when invoice create fails', async () => {
        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/invoices') return Promise.resolve({ data: { invoices: [] } });
            if (url === '/projects') return Promise.resolve({ data: [] });
            return Promise.resolve({ data: {} });
        });
        mockedApi.post.mockRejectedValue({ response: { status: 404, data: {} } });

        wrap(<Invoices />);
        const user = userEvent.setup();

        await user.click(await screen.findByRole('button', { name: /New Invoice/i }));
        await user.type(screen.getByPlaceholderText('Client Name *'), 'Acme Corp');
        await user.type(screen.getByPlaceholderText('Description'), 'Design work');
        await user.type(screen.getByPlaceholderText('Hours'), '2');
        await user.type(screen.getByPlaceholderText('Rate ($/hr)'), '60');
        await user.click(screen.getByRole('button', { name: /^Create$/i }));

        expect(await screen.findByText('The requested resource was not found.')).toBeInTheDocument();
    });

    it('opens the in-page approval queue from Timesheet instead of redirecting', async () => {
        localStorage.setItem('user_role', 'Manager');
        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/timers/me') return Promise.resolve({ data: { entries: [] } });
            if (url === '/timers/approvals') {
                return Promise.resolve({
                    data: {
                        entries: [
                            {
                                id: 'entry-1',
                                duration: 3600,
                                task_description: 'QA review',
                                start_time: new Date().toISOString(),
                                end_time: new Date(Date.now() + 3600000).toISOString(),
                                user: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@test.dev' },
                                project: { name: 'Time Tracker' },
                            },
                        ],
                    },
                });
            }
            return Promise.resolve({ data: {} });
        });

        wrap(<Timesheet />);
        const user = userEvent.setup();

        await user.click(await screen.findByRole('button', { name: /Approval Queue/i }));
        expect(await screen.findByText('Pending Approvals')).toBeInTheDocument();
        expect(screen.getByText('QA review')).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('opens timeline add/edit entry modal flows in place', async () => {
        const end = new Date();
        const start = new Date(end.getTime() - 30 * 60 * 1000);
        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/projects') {
                return Promise.resolve({ data: [{ id: 'p1', name: 'Web Forx' }] });
            }
            if (url === '/timers/me') {
                return Promise.resolve({
                    data: {
                        activeTimer: null,
                        entries: [
                            {
                                id: 'e1',
                                duration: 1800,
                                task_description: 'Refactor timers',
                                start_time: start.toISOString(),
                                end_time: end.toISOString(),
                                project: { id: 'p1', name: 'Web Forx' },
                                user: { first_name: 'Test', last_name: 'User', email: 't@u.dev' },
                            },
                        ],
                    },
                });
            }
            return Promise.resolve({ data: {} });
        });

        wrap(<Timeline />);
        const user = userEvent.setup();

        await user.click(await screen.findByRole('button', { name: /New Task/i }));
        expect(await screen.findByRole('heading', { name: 'Add Entry' })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /Cancel/i }));

        await user.click(await screen.findByTitle('Edit entry'));
        expect(await screen.findByText('Edit Entry')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Refactor timers')).toBeInTheDocument();
    });

    it('runs global search and keeps bell behavior as dropdown toggle', async () => {
        localStorage.setItem('user_role', 'Employee');
        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/users/me/notifications') return Promise.resolve({ data: { notifications: [] } });
            if (url === '/projects/search') {
                return Promise.resolve({
                    data: {
                        query: 'web',
                        projects: [{ id: 'p1', name: 'Web Forx Platform' }],
                        tasks: [{ name: 'Webhook rollout', project: { id: 'p1', name: 'Web Forx Platform' } }],
                    },
                });
            }
            return Promise.resolve({ data: {} });
        });

        wrap(<Navbar onMenuClick={vi.fn()} />);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText(/Search projects or tasks/i), 'web');
        await new Promise((resolve) => window.setTimeout(resolve, 300));

        expect(await screen.findByText('Web Forx Platform')).toBeInTheDocument();
        await user.click(screen.getByText('Web Forx Platform'));
        expect(mockNavigate).toHaveBeenCalledWith('/timer?projectId=p1');

        const bell = screen.getByRole('button', { name: /View notifications/i });
        await user.click(bell);
        expect(await screen.findByText('Notifications')).toBeInTheDocument();
    });

    it('exports timesheet CSV through reports export endpoint', async () => {
        localStorage.setItem('user_role', 'Employee');
        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/timers/me') return Promise.resolve({ data: { entries: [] } });
            if (url === '/reports/export') return Promise.resolve({ data: 'date,hours\n2026-03-27,1.0' });
            return Promise.resolve({ data: {} });
        });

        const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
        const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        wrap(<Timesheet />);
        const user = userEvent.setup();

        await user.click(await screen.findByRole('button', { name: /Export CSV/i }));

        await waitFor(() => {
            expect(mockedApi.get).toHaveBeenCalledWith('/reports/export', { responseType: 'blob' });
            expect(screen.getByText('Timesheet CSV exported')).toBeInTheDocument();
        });

        clickSpy.mockRestore();
        createObjectURL.mockRestore();
        revokeObjectURL.mockRestore();
    });

    it('resets timer state after stop and emits cross-page refresh event', async () => {
        let timersMeCalls = 0;
        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/projects') return Promise.resolve({ data: [] });
            if (url === '/timers/me') {
                timersMeCalls += 1;
                if (timersMeCalls === 1) {
                    return Promise.resolve({
                        data: {
                            entries: [{ duration: 600, start_time: new Date().toISOString() }],
                            activeTimer: {
                                id: 'active-1',
                                start_time: new Date(Date.now() - 5000).toISOString(),
                                task_description: 'Fix UAT defects',
                                project_id: null,
                                project: null,
                            },
                        },
                    });
                }

                return Promise.resolve({ data: { entries: [{ duration: 900, start_time: new Date().toISOString() }], activeTimer: null } });
            }
            if (url === '/tags') return Promise.resolve({ data: { tags: [] } });
            if (url === '/calendar/status') return Promise.resolve({ data: { configured: false, connected: false } });
            return Promise.resolve({ data: {} });
        });
        mockedApi.post.mockImplementation((url: string) => {
            if (url === '/ml/categorize') return Promise.resolve({ data: { suggestions: [] } });
            if (url === '/timers/stop') return Promise.resolve({ data: {} });
            if (url === '/timers/ping') return Promise.resolve({ data: {} });
            return Promise.resolve({ data: {} });
        });

        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

        wrap(<Timer />);
        const user = userEvent.setup();

        await user.click(await screen.findByRole('button', { name: /Stop Timer/i }));
        expect(await screen.findByRole('button', { name: /Start Timer/i })).toBeInTheDocument();
        expect(dispatchSpy).toHaveBeenCalled();
    });

    it('keeps project options available when timer session fetch fails', async () => {
        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/projects') {
                return Promise.resolve({ data: [{ id: 'p1', name: 'Web Forx Platform' }] });
            }
            if (url === '/timers/me') {
                return Promise.reject(new Error('timers unavailable'));
            }
            if (url === '/tags') return Promise.resolve({ data: { tags: [] } });
            if (url === '/calendar/status') return Promise.resolve({ data: { configured: false, connected: false } });
            if (url === '/users/me/notifications') return Promise.resolve({ data: { notifications: [] } });
            return Promise.resolve({ data: {} });
        });

        wrap(<Timer />);

        const projectSelect = await screen.findByRole('combobox');
        expect(projectSelect).toBeInTheDocument();
        expect(await screen.findByRole('option', { name: 'Web Forx Platform' })).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: /Start Timer/i })).toBeInTheDocument();
    });

    it('refreshes tracked-today dashboard totals when time entry events fire', async () => {
        localStorage.setItem('user_role', 'Employee');
        let timersMeCalls = 0;

        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/timers/me') {
                timersMeCalls += 1;
                if (timersMeCalls === 1) {
                    return Promise.resolve({ data: { entries: [], activeTimer: null } });
                }
                return Promise.resolve({
                    data: {
                        entries: [{ duration: 3600, start_time: new Date().toISOString() }],
                        activeTimer: null,
                    },
                });
            }

            if (url === '/projects') return Promise.resolve({ data: [] });
            if (url === '/reports/dashboard?range=7d') {
                return Promise.resolve({
                    data: {
                        metrics: {
                            totalHours: '1.0',
                            activeProjects: 0,
                            avgProductivity: 100,
                            billableAmount: '0.00',
                            trends: { hours: '+10%', projects: '0%', productivity: '+0%', billable: '0%' },
                        },
                        hoursTrend: [],
                        projectDistribution: [],
                        userBreakdown: [],
                    },
                });
            }
            if (url === '/users/me/wellbeing') {
                return Promise.resolve({
                    data: {
                        sevenDayHours: 8,
                        averageDailyHours: 1.14,
                        burnoutThresholdHours: 50,
                        cautionThresholdHours: 45,
                        hoursUntilBurnout: 42,
                        weeklyHourLimit: 40,
                        status: 'balanced',
                        workloadAlerts: [],
                    },
                });
            }
            if (url === '/users/me/notifications') return Promise.resolve({ data: { notifications: [] } });
            return Promise.resolve({ data: {} });
        });

        wrap(<Dashboard />);
        expect(await screen.findByText('0h 0m / 8h')).toBeInTheDocument();

        window.dispatchEvent(new CustomEvent('wfx:time-entry-changed'));

        expect(await screen.findByText('1h 0m / 8h')).toBeInTheDocument();
    });
});
