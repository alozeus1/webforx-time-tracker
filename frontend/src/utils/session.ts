const readStorageValue = (key: string) => {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.localStorage.getItem(key);
};

export const getStoredToken = () => readStorageValue('token');

export const getStoredRole = () => readStorageValue('user_role');

export interface StoredUserProfile {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    organization_id?: string;
}

export const getStoredUserProfile = (): StoredUserProfile | null => {
    const raw = readStorageValue('user_profile');
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw) as StoredUserProfile;
    } catch {
        return null;
    }
};

export const setStoredSession = (token: string, role: string, user?: StoredUserProfile) => {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.setItem('token', token);
    window.localStorage.setItem('user_role', role);

    if (user) {
        window.localStorage.setItem('user_profile', JSON.stringify(user));
        if (user.organization_id) {
            window.localStorage.setItem('organization_id', user.organization_id);
        }
    }
};

export const clearStoredSession = () => {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.removeItem('token');
    window.localStorage.removeItem('refreshToken');
    window.localStorage.removeItem('user_role');
    window.localStorage.removeItem('user_profile');
    window.localStorage.removeItem('organization_id');
};

export const hasAnyRole = (roles: string[]) => {
    const role = getStoredRole();
    return role !== null && roles.includes(role);
};
