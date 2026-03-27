import React, { useEffect, useState } from 'react';
import { getStoredAvatar } from '../utils/avatar';

interface UserAvatarProps {
    initials: string;
    size?: number;
    className?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ initials, size = 40, className = '' }) => {
    const [avatar, setAvatar] = useState(() => getStoredAvatar());

    useEffect(() => {
        const syncAvatar = () => setAvatar(getStoredAvatar());
        window.addEventListener('avatar-changed', syncAvatar);
        window.addEventListener('storage', syncAvatar);
        return () => {
            window.removeEventListener('avatar-changed', syncAvatar);
            window.removeEventListener('storage', syncAvatar);
        };
    }, []);

    const base: React.CSSProperties = {
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
    };

    if (avatar?.type === 'image') {
        return (
            <div
                className={className}
                style={{
                    ...base,
                    backgroundImage: `url(${avatar.value})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }}
                role="img"
                aria-label="Profile picture"
            />
        );
    }

    if (avatar?.type === 'emoji') {
        return (
            <div
                className={className}
                style={{
                    ...base,
                    background: '#eef2ff',
                    border: '1px solid #dbe3ff',
                    fontSize: size * 0.55,
                    lineHeight: 1,
                }}
                role="img"
                aria-label="Profile emoji"
            >
                {avatar.value}
            </div>
        );
    }

    return (
        <div
            className={`avatar ${className}`}
            style={{ ...base, fontSize: size * 0.35, fontWeight: 700 }}
        >
            {initials}
        </div>
    );
};

export default UserAvatar;
