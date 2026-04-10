import axios from 'axios';
import { resolveApiBaseUrl } from '../utils/apiConfig';
import { handleAuthFailure, isAuthFailureInProgress, resetAuthFailureState } from '../utils/authFailure';

const configuredBaseUrl = resolveApiBaseUrl(
    import.meta.env.VITE_API_URL,
    typeof window !== 'undefined' ? window.location : undefined,
);

const api = axios.create({
    baseURL: configuredBaseUrl.replace(/\/+$/, ''),
});

const STATUS_MESSAGES: Record<number, string> = {
    400: 'Invalid request. Please review the form and try again.',
    401: 'Your session has expired. Please sign in again.',
    403: 'You do not have permission to perform this action.',
    404: 'The requested resource was not found.',
    409: 'A conflicting record already exists.',
    500: 'Server error. Please try again in a moment.',
};

export interface ApiErrorInfo {
    status: number | null;
    message: string;
    code?: string;
    details?: unknown;
    isNetworkError: boolean;
}

export const parseApiError = (error: unknown, fallback = 'Request failed. Please try again.'): ApiErrorInfo => {
    const response = (error as {
        response?: {
            status?: number;
            data?: { message?: string; error?: { code?: string; details?: unknown; message?: string } };
        };
        message?: string;
    })?.response;

    const status = typeof response?.status === 'number' ? response.status : null;
    const serverMessage = response?.data?.message || response?.data?.error?.message;
    const isNetworkError = status === null;

    const statusMessage = status !== null ? STATUS_MESSAGES[status] : null;
    const message = serverMessage || statusMessage || (isNetworkError ? 'Network error. Check your connection and retry.' : fallback);

    return {
        status,
        message,
        code: response?.data?.error?.code,
        details: response?.data?.error?.details,
        isNetworkError,
    };
};

export const getApiErrorMessage = (error: unknown, fallback?: string) =>
    parseApiError(error, fallback).message;

const PUBLIC_API_PATHS = [
    '/auth/login',
    '/auth/refresh',
    '/auth/providers',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/public',
];

const isPublicApiRequest = (url?: string) => {
    if (!url) {
        return false;
    }

    const normalizedUrl = url.startsWith('http')
        ? new URL(url).pathname.replace(/^\/api\/v1/, '')
        : url;

    return PUBLIC_API_PATHS.some((path) => normalizedUrl.startsWith(path));
};

const buildCancelledAuthError = () => ({
    response: {
        status: 401,
        data: {
            message: 'Your session has expired. Please sign in again.',
            error: { code: 'AUTH_SESSION_EXPIRED' },
        },
    },
    message: 'Your session has expired. Please sign in again.',
});

const isAuthFailureResponse = (error: unknown) => {
    const response = (error as { response?: { status?: number; data?: { message?: string; error?: { code?: string } } } })?.response;
    const status = response?.status;
    const code = response?.data?.error?.code;
    const message = response?.data?.message?.toLowerCase() || '';

    return status === 401
        || code === 'TOKEN_INVALID'
        || code === 'TOKEN_EXPIRED'
        || code === 'AUTH_SESSION_EXPIRED'
        || (status === 403 && message.includes('invalid or expired token'));
};

// Request interceptor to attach JWT token
api.interceptors.request.use(
    (config) => {
        if (isAuthFailureInProgress() && !isPublicApiRequest(config.url)) {
            return Promise.reject(buildCancelledAuthError());
        }

        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

let isRefreshing = false;
let failedQueue: { resolve: (token: string) => void; reject: (err: unknown) => void }[] = [];

const processQueue = (error: unknown, token: string | null) => {
    failedQueue.forEach(p => (token ? p.resolve(token) : p.reject(error)));
    failedQueue = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (originalRequest && isPublicApiRequest(originalRequest.url)) {
            return Promise.reject(error);
        }

        if (isAuthFailureResponse(error) && originalRequest && !originalRequest._retry) {
            const refreshToken = localStorage.getItem('refreshToken');

            if (refreshToken && window.location.pathname !== '/login' && window.location.pathname !== '/forgot-password') {
                if (isRefreshing) {
                    return new Promise((resolve, reject) => {
                        failedQueue.push({
                            resolve: (token: string) => {
                                originalRequest.headers.Authorization = `Bearer ${token}`;
                                resolve(api(originalRequest));
                            },
                            reject,
                        });
                    });
                }

                originalRequest._retry = true;
                isRefreshing = true;

                try {
                    const res = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken });
                    const newToken = typeof res.data?.token === 'string' ? res.data.token.trim() : '';
                    const newRefresh = typeof res.data?.refreshToken === 'string' ? res.data.refreshToken.trim() : '';

                    if (!newToken) {
                        throw new Error('Refresh response did not include a valid token');
                    }

                    localStorage.setItem('token', newToken);
                    if (newRefresh) localStorage.setItem('refreshToken', newRefresh);

                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    resetAuthFailureState();
                    processQueue(null, newToken);
                    return api(originalRequest);
                } catch (refreshError) {
                    processQueue(refreshError, null);
                    handleAuthFailure('Your session has expired. Please sign in again.');
                    return Promise.reject(refreshError);
                } finally {
                    isRefreshing = false;
                }
            }

            handleAuthFailure(getApiErrorMessage(error, 'Your session has expired. Please sign in again.'));
        }

        return Promise.reject(error);
    }
);

export default api;
