import { clearStoredSession } from './session';

export const AUTH_FAILURE_EVENT = 'wfx:auth-failure';
export const AUTH_FAILURE_MESSAGE_KEY = 'wfx-auth-message';

const DEFAULT_AUTH_MESSAGE = 'Your session has expired. Please sign in again.';

let authFailureInProgress = false;

export interface AuthFailureDetail {
    message: string;
}

export const isAuthFailureInProgress = () => authFailureInProgress;

export const resetAuthFailureState = () => {
    authFailureInProgress = false;
};

export const consumeAuthFailureMessage = () => {
    if (typeof window === 'undefined') {
        return null;
    }

    const message = window.sessionStorage.getItem(AUTH_FAILURE_MESSAGE_KEY);
    if (message) {
        window.sessionStorage.removeItem(AUTH_FAILURE_MESSAGE_KEY);
    }

    return message;
};

export const handleAuthFailure = (message = DEFAULT_AUTH_MESSAGE) => {
    if (typeof window === 'undefined') {
        return;
    }

    if (authFailureInProgress) {
        return;
    }

    authFailureInProgress = true;
    clearStoredSession();
    window.sessionStorage.setItem(AUTH_FAILURE_MESSAGE_KEY, message);
    window.dispatchEvent(new CustomEvent<AuthFailureDetail>(AUTH_FAILURE_EVENT, { detail: { message } }));

    const allowedPublicPaths = ['/login', '/forgot-password', '/request-access', '/', '/privacy', '/terms'];
    if (!allowedPublicPaths.includes(window.location.pathname)) {
        const loginUrl = new URL('/login', window.location.origin);
        loginUrl.searchParams.set('authMessage', message);
        window.location.assign(loginUrl.toString());
    }
};

