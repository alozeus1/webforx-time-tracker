import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getStoredToken,
    getStoredRole,
    getStoredUserProfile,
    setStoredSession,
    clearStoredSession,
    hasAnyRole,
    StoredUserProfile,
} from '../utils/session';

// happy-dom provides localStorage; clear before each test
beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

const mockProfile: StoredUserProfile = {
    id: 'user-1',
    email: 'alice@test.com',
    first_name: 'Alice',
    last_name: 'Smith',
    role: 'Employee',
};

// ─── getStoredToken ─────────────────────────────────────────────────────────

describe('getStoredToken', () => {
    it('returns null when token is not set', () => {
        expect(getStoredToken()).toBeNull();
    });

    it('returns the stored token string', () => {
        localStorage.setItem('token', 'my-jwt-abc123');
        expect(getStoredToken()).toBe('my-jwt-abc123');
    });
});

// ─── getStoredRole ──────────────────────────────────────────────────────────

describe('getStoredRole', () => {
    it('returns null when role is not set', () => {
        expect(getStoredRole()).toBeNull();
    });

    it('returns the stored role string', () => {
        localStorage.setItem('user_role', 'Manager');
        expect(getStoredRole()).toBe('Manager');
    });
});

// ─── getStoredUserProfile ───────────────────────────────────────────────────

describe('getStoredUserProfile', () => {
    it('returns null when user_profile is not set', () => {
        expect(getStoredUserProfile()).toBeNull();
    });

    it('parses and returns the stored user profile object', () => {
        localStorage.setItem('user_profile', JSON.stringify(mockProfile));
        const result = getStoredUserProfile();
        expect(result).not.toBeNull();
        expect(result?.email).toBe('alice@test.com');
        expect(result?.role).toBe('Employee');
        expect(result?.first_name).toBe('Alice');
    });

    it('returns null when stored JSON is malformed', () => {
        localStorage.setItem('user_profile', '{not valid json}');
        expect(getStoredUserProfile()).toBeNull();
    });
});

// ─── setStoredSession ────────────────────────────────────────────────────────

describe('setStoredSession', () => {
    it('sets token and user_role in localStorage', () => {
        setStoredSession('tok-xyz', 'Admin');
        expect(localStorage.getItem('token')).toBe('tok-xyz');
        expect(localStorage.getItem('user_role')).toBe('Admin');
    });

    it('also stores user_profile when user object is provided', () => {
        setStoredSession('tok-xyz', 'Employee', mockProfile);
        const stored = localStorage.getItem('user_profile');
        expect(stored).not.toBeNull();
        const parsed = JSON.parse(stored!);
        expect(parsed.email).toBe('alice@test.com');
        expect(parsed.id).toBe('user-1');
    });

    it('does not store user_profile when user object is omitted', () => {
        setStoredSession('tok-only', 'Employee');
        expect(localStorage.getItem('user_profile')).toBeNull();
    });
});

// ─── clearStoredSession ──────────────────────────────────────────────────────

describe('clearStoredSession', () => {
    it('removes token, user_role, and user_profile from localStorage', () => {
        localStorage.setItem('token', 'abc');
        localStorage.setItem('user_role', 'Admin');
        localStorage.setItem('user_profile', JSON.stringify(mockProfile));

        clearStoredSession();

        expect(localStorage.getItem('token')).toBeNull();
        expect(localStorage.getItem('user_role')).toBeNull();
        expect(localStorage.getItem('user_profile')).toBeNull();
    });

    it('does not throw when storage is already empty', () => {
        expect(() => clearStoredSession()).not.toThrow();
    });
});

// ─── hasAnyRole ──────────────────────────────────────────────────────────────

describe('hasAnyRole', () => {
    it('returns true when stored role matches one of the allowed roles', () => {
        localStorage.setItem('user_role', 'Manager');
        expect(hasAnyRole(['Manager', 'Admin'])).toBe(true);
    });

    it('returns true for exact single role match', () => {
        localStorage.setItem('user_role', 'Admin');
        expect(hasAnyRole(['Admin'])).toBe(true);
    });

    it('returns false when stored role is not in the allowed roles list', () => {
        localStorage.setItem('user_role', 'Employee');
        expect(hasAnyRole(['Manager', 'Admin'])).toBe(false);
    });

    it('returns false when no role is stored (null)', () => {
        // localStorage is clear from beforeEach
        expect(hasAnyRole(['Employee', 'Manager'])).toBe(false);
    });

    it('returns false when roles array is empty', () => {
        localStorage.setItem('user_role', 'Employee');
        expect(hasAnyRole([])).toBe(false);
    });

    it('handles Intern role correctly', () => {
        localStorage.setItem('user_role', 'Intern');
        expect(hasAnyRole(['Employee', 'Manager', 'Admin'])).toBe(false);
        expect(hasAnyRole(['Intern'])).toBe(true);
    });
});
