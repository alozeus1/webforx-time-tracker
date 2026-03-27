import React, { useRef, useState } from 'react';
import { Camera, Smile, X } from 'lucide-react';
import { EMOJI_OPTIONS, getStoredAvatar, setStoredAvatar, clearStoredAvatar } from '../utils/avatar';
import type { UserAvatar } from '../utils/avatar';
import './AvatarPicker.css';

interface AvatarPickerProps {
    initials: string;
    onSave?: () => void;
}

const MAX_IMAGE_SIZE = 256;

const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = MAX_IMAGE_SIZE;
                canvas.height = MAX_IMAGE_SIZE;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject(new Error('Canvas not supported')); return; }

                const scale = Math.max(MAX_IMAGE_SIZE / img.width, MAX_IMAGE_SIZE / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                ctx.drawImage(img, (MAX_IMAGE_SIZE - w) / 2, (MAX_IMAGE_SIZE - h) / 2, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => reject(new Error('Invalid image'));
            img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error('Read failed'));
        reader.readAsDataURL(file);
    });
};

const AvatarPicker: React.FC<AvatarPickerProps> = ({ initials, onSave }) => {
    const stored = getStoredAvatar();
    const [tab, setTab] = useState<'emoji' | 'upload'>(stored?.type === 'image' ? 'upload' : 'emoji');
    const [selected, setSelected] = useState<UserAvatar | null>(stored);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleEmojiClick = (emoji: string) => {
        setSelected({ type: 'emoji', value: emoji });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return;
        setUploading(true);
        try {
            const dataUrl = await resizeImage(file);
            setSelected({ type: 'image', value: dataUrl });
        } catch {
            // silently ignore bad files
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleSave = () => {
        if (selected) {
            setStoredAvatar(selected);
        }
        onSave?.();
    };

    const handleRemove = () => {
        clearStoredAvatar();
        setSelected(null);
        onSave?.();
    };

    const previewContent = (() => {
        if (selected?.type === 'image') {
            return <img src={selected.value} alt="Avatar preview" />;
        }
        if (selected?.type === 'emoji') {
            return selected.value;
        }
        return initials;
    })();

    return (
        <div className="avatar-picker">
            <div className="avatar-picker-preview">
                <div className="avatar-picker-preview-circle">
                    {previewContent}
                </div>
                <div className="avatar-picker-preview-actions">
                    <span>Profile Avatar</span>
                    <small>Choose an emoji or upload a photo</small>
                </div>
            </div>

            <div className="avatar-picker-tabs">
                <button
                    type="button"
                    className={`avatar-picker-tab ${tab === 'emoji' ? 'active' : ''}`}
                    onClick={() => setTab('emoji')}
                >
                    <Smile size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    Emoji
                </button>
                <button
                    type="button"
                    className={`avatar-picker-tab ${tab === 'upload' ? 'active' : ''}`}
                    onClick={() => setTab('upload')}
                >
                    <Camera size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    Upload Photo
                </button>
            </div>

            {tab === 'emoji' && (
                <div className="avatar-emoji-grid">
                    {EMOJI_OPTIONS.map((emoji) => (
                        <button
                            key={emoji}
                            type="button"
                            className={`avatar-emoji-btn ${selected?.type === 'emoji' && selected.value === emoji ? 'selected' : ''}`}
                            onClick={() => handleEmojiClick(emoji)}
                            aria-label={`Select emoji ${emoji}`}
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            )}

            {tab === 'upload' && (
                <div
                    className="avatar-upload-area"
                    onClick={() => fileRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
                >
                    <Camera size={24} style={{ color: 'var(--text-muted)', margin: '0 auto' }} />
                    <p>
                        {uploading
                            ? 'Processing...'
                            : <>Click to <strong>upload a photo</strong><br />JPG, PNG up to 2 MB</>
                        }
                    </p>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={(e) => void handleFileChange(e)}
                        style={{ display: 'none' }}
                        aria-label="Upload profile photo"
                    />
                </div>
            )}

            <div className="avatar-picker-actions">
                {(stored || selected) && (
                    <button type="button" className="btn btn-outline" onClick={handleRemove} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <X size={14} /> Remove
                    </button>
                )}
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={!selected}
                >
                    Save Avatar
                </button>
            </div>
        </div>
    );
};

export default AvatarPicker;
