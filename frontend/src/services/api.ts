import axios from 'axios';

const defaultBaseUrl = 'http://localhost:5005/api/v1';
const configuredBaseUrl = import.meta.env.VITE_API_URL?.trim() || defaultBaseUrl;

const api = axios.create({
    baseURL: configuredBaseUrl.replace(/\/+$/, ''),
});

// Request interceptor to attach JWT token
api.interceptors.request.use(
    (config) => {
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

        if (error.response?.status === 401 && !originalRequest._retry) {
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
                    const newToken = res.data.token;
                    const newRefresh = res.data.refreshToken;

                    localStorage.setItem('token', newToken);
                    if (newRefresh) localStorage.setItem('refreshToken', newRefresh);

                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    processQueue(null, newToken);
                    return api(originalRequest);
                } catch (refreshError) {
                    processQueue(refreshError, null);
                    localStorage.removeItem('token');
                    localStorage.removeItem('refreshToken');
                    localStorage.removeItem('user_role');
                    localStorage.removeItem('user_profile');
                    window.location.href = '/login';
                    return Promise.reject(refreshError);
                } finally {
                    isRefreshing = false;
                }
            }

            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user_role');
            localStorage.removeItem('user_profile');
            if (window.location.pathname !== '/login' && window.location.pathname !== '/forgot-password') {
                window.location.href = '/login';
            }
        }

        return Promise.reject(error);
    }
);

export default api;
