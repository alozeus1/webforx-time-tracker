const readStorageValue = (key: string) => {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.localStorage.getItem(key);
};

export const getStoredToken = () => readStorageValue('token');

export const getStoredRole = () => readStorageValue('user_role');

export const hasAnyRole = (roles: string[]) => {
    const role = getStoredRole();
    return role !== null && roles.includes(role);
};
