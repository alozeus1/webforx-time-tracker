import { beforeEach, describe, expect, it } from 'vitest';
import {
    AUTH_FAILURE_MESSAGE_KEY,
    consumeAuthFailureMessage,
    handleAuthFailure,
    isAuthFailureInProgress,
    resetAuthFailureState,
} from '../utils/authFailure';

describe('auth failure handling', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        resetAuthFailureState();
    });

    it('clears stored auth state and preserves a friendly login message', () => {
        window.history.replaceState({}, '', '/login');
        localStorage.setItem('token', 'expired');
        localStorage.setItem('refreshToken', 'refresh');
        localStorage.setItem('user_role', 'Employee');

        handleAuthFailure('Session expired while loading the page.');

        expect(localStorage.getItem('token')).toBeNull();
        expect(localStorage.getItem('refreshToken')).toBeNull();
        expect(sessionStorage.getItem(AUTH_FAILURE_MESSAGE_KEY)).toBe('Session expired while loading the page.');
    });

    it('consumes the stored auth failure message once', () => {
        sessionStorage.setItem(AUTH_FAILURE_MESSAGE_KEY, 'Please sign in again.');

        expect(consumeAuthFailureMessage()).toBe('Please sign in again.');
        expect(consumeAuthFailureMessage()).toBeNull();
    });

    it('tracks that an auth failure redirect is already in progress', () => {
        window.history.replaceState({}, '', '/login');

        handleAuthFailure();

        expect(isAuthFailureInProgress()).toBe(true);
    });
});
