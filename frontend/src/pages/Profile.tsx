import React, { useEffect, useState } from 'react';
import api from '../services/api';
import AvatarPicker from '../components/AvatarPicker';

interface CurrentUser {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    is_active: boolean;
}

const Profile: React.FC = () => {
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [password, setPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [avatarKey, setAvatarKey] = useState(0);

    const loadProfile = async () => {
        try {
            const response = await api.get<CurrentUser>('/users/me');
            setUser(response.data);
            setFirstName(response.data.first_name);
            setLastName(response.data.last_name);
        } catch (error) {
            console.error('Failed to load profile:', error);
        }
    };

    useEffect(() => {
        void loadProfile();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setFeedback(null);

        try {
            const payload: { first_name?: string; last_name?: string; password?: string } = {};

            if (firstName.trim()) {
                payload.first_name = firstName.trim();
            }

            if (lastName.trim()) {
                payload.last_name = lastName.trim();
            }

            if (password.trim()) {
                payload.password = password.trim();
            }

            const response = await api.put<CurrentUser>('/users/me', payload);
            setUser(response.data);
            setFirstName(response.data.first_name);
            setLastName(response.data.last_name);
            setPassword('');
            setFeedback('Profile updated successfully');

            const token = localStorage.getItem('token');
            if (token) {
                localStorage.setItem('user_profile', JSON.stringify({
                    id: response.data.id,
                    email: response.data.email,
                    first_name: response.data.first_name,
                    last_name: response.data.last_name,
                    role: response.data.role,
                }));
            }
        } catch (error) {
            console.error('Failed to update profile:', error);
            setFeedback('Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex-1 w-full overflow-y-auto bg-slate-50 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-5xl space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Account Settings</p>
                    <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">Profile</h1>
                    <p className="mt-2 text-sm text-slate-500">Update your account details and credentials.</p>
                </div>

                {feedback && (
                    <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${feedback.toLowerCase().includes('failed') ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                        {feedback}
                    </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Profile Avatar</p>
                    <AvatarPicker
                        key={avatarKey}
                        initials={`${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'U'}
                        onSave={() => setAvatarKey((k) => k + 1)}
                    />
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_0.7fr]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">First Name</p>
                                <input
                                    className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    value={firstName}
                                    onChange={(event) => setFirstName(event.target.value)}
                                />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Last Name</p>
                                <input
                                    className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    value={lastName}
                                    onChange={(event) => setLastName(event.target.value)}
                                />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Email</p>
                                <p className="mt-2 text-lg font-semibold text-slate-900">{user?.email || 'Loading...'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Role</p>
                                <p className="mt-2 text-lg font-semibold text-slate-900">{user?.role || 'Loading...'}</p>
                            </div>
                            <div className="md:col-span-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">New Password</p>
                                <input
                                    type="password"
                                    placeholder="Leave blank to keep current password"
                                    className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                                onClick={() => void handleSave()}
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>

                    <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Account Summary</p>
                        <div className="mt-4 space-y-4">
                            <div>
                                <p className="text-xs font-semibold text-slate-500">Account Status</p>
                                <p className="mt-1 text-sm font-bold text-emerald-600">{user?.is_active ? 'Active' : 'Inactive'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-slate-500">Security</p>
                                <p className="mt-1 text-sm text-slate-700">Password changes are applied instantly to your account.</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-slate-500">Session Sync</p>
                                <p className="mt-1 text-sm text-slate-700">Updated profile metadata is synced to local session storage after save.</p>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default Profile;
