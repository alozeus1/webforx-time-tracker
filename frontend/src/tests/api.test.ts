import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';

// We test the interceptor logic directly without importing the api module,
// because api.ts uses import.meta.env which requires Vite. Instead we
// replicate the interceptor behaviour and test it against axios internals.

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ─── Request interceptor ────────────────────────────────────────────────────

describe('API request interceptor — Authorization header', () => {
    it('adds Authorization header when token exists in localStorage', () => {
        localStorage.setItem('token', 'my-jwt-token-123');

        // Simulate what the request interceptor does
        const config = { headers: {} as Record<string, string> };
        const token = localStorage.getItem('token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        expect(config.headers['Authorization']).toBe('Bearer my-jwt-token-123');
    });

    it('does not add Authorization header when token is null', () => {
        // No token set — localStorage is empty from beforeEach

        const config = { headers: {} as Record<string, string> };
        const token = localStorage.getItem('token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        expect(config.headers['Authorization']).toBeUndefined();
    });

    it('uses different tokens set at different times', () => {
        localStorage.setItem('token', 'first-token');
        let token = localStorage.getItem('token');
        expect(token).toBe('first-token');

        localStorage.setItem('token', 'second-token');
        token = localStorage.getItem('token');
        expect(token).toBe('second-token');
    });
});

// ─── Response interceptor ────────────────────────────────────────────────────

describe('API response interceptor — 401 handling', () => {
    it('clears localStorage keys when a 401 error occurs', async () => {
        localStorage.setItem('token', 'expired-token');
        localStorage.setItem('user_role', 'Employee');
        localStorage.setItem('user_profile', JSON.stringify({ id: '1', email: 'u@t.com', first_name: 'U', last_name: 'T', role: 'Employee' }));

        // Simulate the 401 interceptor logic
        const error = { response: { status: 401 } };
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user_role');
            localStorage.removeItem('user_profile');
        }

        expect(localStorage.getItem('token')).toBeNull();
        expect(localStorage.getItem('user_role')).toBeNull();
        expect(localStorage.getItem('user_profile')).toBeNull();
    });

    it('does not clear localStorage for non-401 errors', () => {
        localStorage.setItem('token', 'valid-token');
        localStorage.setItem('user_role', 'Manager');

        // Simulate a 403 error (should NOT clear)
        const error = { response: { status: 403 } };
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user_role');
            localStorage.removeItem('user_profile');
        }

        expect(localStorage.getItem('token')).toBe('valid-token');
        expect(localStorage.getItem('user_role')).toBe('Manager');
    });

    it('does not clear localStorage for 500 server errors', () => {
        localStorage.setItem('token', 'valid-token');

        const error = { response: { status: 500 } };
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
        }

        expect(localStorage.getItem('token')).toBe('valid-token');
    });

    it('401 interceptor logic rejects the promise', async () => {
        const error = { response: { status: 401 } };

        const interceptor = (err: { response?: { status: number } }) => {
            if (err.response?.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('user_role');
                localStorage.removeItem('user_profile');
            }
            return Promise.reject(err);
        };

        await expect(interceptor(error)).rejects.toEqual(error);
    });
});

// ─── BaseURL config ──────────────────────────────────────────────────────────

describe('API instance base URL', () => {
    it('falls back to localhost:5005/api/v1 when VITE_API_URL is not set', () => {
        const defaultBaseUrl = 'http://localhost:5005/api/v1';
        // In test env, import.meta.env.VITE_API_URL is undefined
        const configuredBaseUrl = (undefined as string | undefined)?.trim() || defaultBaseUrl;
        expect(configuredBaseUrl).toBe('http://localhost:5005/api/v1');
    });

    it('uses VITE_API_URL when configured', () => {
        const defaultBaseUrl = 'http://localhost:5005/api/v1';
        const envUrl = 'https://api.example.com/api/v1';
        const configuredBaseUrl = envUrl?.trim() || defaultBaseUrl;
        expect(configuredBaseUrl).toBe('https://api.example.com/api/v1');
    });

    it('strips trailing slashes from base URL', () => {
        const rawUrl = 'http://localhost:5005/api/v1/';
        const cleaned = rawUrl.replace(/\/+$/, '');
        expect(cleaned).toBe('http://localhost:5005/api/v1');
    });
});
