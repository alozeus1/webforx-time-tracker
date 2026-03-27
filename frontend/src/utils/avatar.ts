const AVATAR_KEY = 'user_avatar';

export interface UserAvatar {
    type: 'emoji' | 'image';
    value: string; // emoji character or base64 data URL
}

export const getStoredAvatar = (): UserAvatar | null => {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(AVATAR_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as UserAvatar;
    } catch {
        return null;
    }
};

export const setStoredAvatar = (avatar: UserAvatar): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(AVATAR_KEY, JSON.stringify(avatar));
    window.dispatchEvent(new Event('avatar-changed'));
};

export const clearStoredAvatar = (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(AVATAR_KEY);
    window.dispatchEvent(new Event('avatar-changed'));
};

export const EMOJI_OPTIONS: string[] = [
    '😀', '😎', '🤓', '🧑‍💻', '👩‍💻', '👨‍💻',
    '🦊', '🐱', '🐶', '🐼', '🦁', '🐸',
    '🚀', '⚡', '🔥', '💎', '🎯', '⭐',
    '🌟', '💡', '🎨', '🛠️', '📊', '⏱️',
    '🏆', '🎖️', '👑', '🧠', '💼', '🌍',
    '🌈', '☕', '🍕', '🎸', '🏔️', '🌊',
];
