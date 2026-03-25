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

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user_role');
            localStorage.removeItem('user_profile');
        }

        return Promise.reject(error);
    }
);

export default api;
