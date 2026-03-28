export type PrivacyMode = 'personal' | 'team_ops' | 'compliance';

const PRIVACY_MODE_KEY = 'wfx-privacy-mode';

export const getStoredPrivacyMode = (): PrivacyMode => {
    if (typeof window === 'undefined') {
        return 'team_ops';
    }

    const stored = window.localStorage.getItem(PRIVACY_MODE_KEY);
    if (stored === 'personal' || stored === 'team_ops' || stored === 'compliance') {
        return stored;
    }

    return 'team_ops';
};

export const setStoredPrivacyMode = (mode: PrivacyMode) => {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.setItem(PRIVACY_MODE_KEY, mode);
};
