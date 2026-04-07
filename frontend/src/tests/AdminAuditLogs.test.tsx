import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
};

const mockedApi = api as unknown as MockedApi;

describe('Admin audit logs', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockedApi.get.mockImplementation((url: string) => {
            if (url === '/projects') {
                return Promise.resolve({ data: [] });
            }

            if (url === '/users') {
                return Promise.resolve({ data: [] });
            }

            if (url === '/integrations') {
                return Promise.resolve({ data: { integrations: [] } });
            }

            if (url === '/admin/audit-logs') {
                return Promise.resolve({
                    data: {
                        logs: [
                            {
                                id: 'auth-1',
                                source: 'auth',
                                action: 'login_attempt',
                                resource: 'authentication',
                                created_at: '2026-04-07T09:00:00.000Z',
                                user: {
                                    email: 'alice@webforxtech.com',
                                    first_name: 'Alice',
                                    last_name: 'Johnson',
                                },
                                email: 'alice@webforxtech.com',
                                outcome: 'failure',
                                reason: 'invalid_password',
                            },
                            {
                                id: 'audit-1',
                                source: 'audit',
                                action: 'project_archive',
                                resource: 'project',
                                created_at: '2026-04-07T08:00:00.000Z',
                                user: {
                                    email: 'admin@webforxtech.com',
                                    first_name: 'Admin',
                                    last_name: 'User',
                                },
                                email: 'admin@webforxtech.com',
                            },
                        ],
                    },
                });
            }

            if (url === '/admin/notifications') {
                return Promise.resolve({ data: { notifications: [] } });
            }

            return Promise.resolve({ data: {} });
        });
    });

    it('renders auth events inside the system audit log feed', async () => {
        render(
            <MemoryRouter initialEntries={['/admin?tab=audit']}>
                <Admin />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Auth Event')).toBeInTheDocument();
            expect(screen.getByText('Login attempt')).toBeInTheDocument();
            expect(screen.getByText('Entered the wrong password for this account.')).toBeInTheDocument();
            expect(screen.getByText('Audit Log')).toBeInTheDocument();
            expect(screen.getByText('Project Archive')).toBeInTheDocument();
        });
    });
});
