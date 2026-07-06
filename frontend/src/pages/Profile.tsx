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
    weekly_hour_limit?: number | null;
}

const MattermostLinkCard: React.FC = () => {
    const [linked, setLinked] = useState<boolean | null>(null);
    const [mmUserId, setMmUserId] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

    useEffect(() => {
        api.get<{ linked: boolean; mm_user_id?: string }>('/bots/mattermost/link')
            .then((response) => {
                setLinked(response.data.linked);
                setMmUserId(response.data.mm_user_id ?? null);
            })
            .catch(() => setLinked(false));
    }, []);

    const handleLink = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmed = code.trim().toUpperCase();
        if (!trimmed) return;

        setBusy(true);
        setMessage(null);
        try {
            const response = await api.post<{ linked: boolean; mm_username?: string }>('/bots/mattermost/link', { code: trimmed });
            setLinked(true);
            setCode('');
            setMessage({
                text: response.data.mm_username
                    ? `Linked to Mattermost account @${response.data.mm_username}.`
                    : 'Mattermost account linked successfully.',
                ok: true,
            });
        } catch (error) {
            const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setMessage({ text: apiMessage ?? 'Failed to link account. Check the code and try again.', ok: false });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Linked Accounts — Mattermost</p>
            <div className="mt-3 flex items-center gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${linked ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {linked === null ? 'Checking…' : linked ? 'Linked' : 'Not linked'}
                </span>
                {linked && mmUserId && (
                    <span className="text-xs text-slate-500">Mattermost user ID: <code className="rounded bg-slate-100 px-1 py-0.5">{mmUserId}</code></span>
                )}
            </div>
            <p className="mt-3 text-sm text-slate-500">
                Run <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-semibold text-slate-700">/timer link</code> in Mattermost to get an 8-character code, then enter it below within 15 minutes.
            </p>
            <form onSubmit={handleLink} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                    id="mattermost-link-code"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm uppercase tracking-widest text-slate-900 sm:max-w-xs"
                    placeholder="e.g. A1B2C3D4"
                    maxLength={8}
                    value={code}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    autoComplete="off"
                />
                <button
                    type="submit"
                    className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={busy || code.trim().length !== 8}
                >
                    {busy ? 'Linking…' : 'Link'}
                </button>
            </form>
            {message && (
                <p className={`mt-3 text-sm font-semibold ${message.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {message.text}
                </p>
            )}
        </div>
    );
};

const Profile: React.FC = () => {
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [password, setPassword] = useState('');
    const [weeklyHourLimit, setWeeklyHourLimit] = useState('');
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [avatarKey, setAvatarKey] = useState(0);

    const loadProfile = async () => {
        try {
            const response = await api.get<CurrentUser>('/users/me');
            setUser(response.data);
            setFirstName(response.data.first_name);
            setLastName(response.data.last_name);
            setWeeklyHourLimit(response.data.weekly_hour_limit != null ? String(response.data.weekly_hour_limit) : '');
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
            const payload: { first_name?: string; last_name?: string; password?: string; weekly_hour_limit?: number | null } = {};

            if (firstName.trim()) {
                payload.first_name = firstName.trim();
            }

            if (lastName.trim()) {
                payload.last_name = lastName.trim();
            }

            if (password.trim()) {
                payload.password = password.trim();
            }

            const parsedLimit = weeklyHourLimit.trim() ? parseInt(weeklyHourLimit, 10) : null;
            payload.weekly_hour_limit = !isNaN(parsedLimit as number) ? parsedLimit : null;

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

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        void handleSave();
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
                        <form onSubmit={handleSubmit}>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                <div>
                                    <label htmlFor="profile-first-name" className="text-xs font-bold uppercase tracking-wider text-slate-400">First Name</label>
                                    <input
                                        id="profile-first-name"
                                        className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                        value={firstName}
                                        onChange={(event) => setFirstName(event.target.value)}
                                        autoComplete="given-name"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="profile-last-name" className="text-xs font-bold uppercase tracking-wider text-slate-400">Last Name</label>
                                    <input
                                        id="profile-last-name"
                                        className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                        value={lastName}
                                        onChange={(event) => setLastName(event.target.value)}
                                        autoComplete="family-name"
                                    />
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Email</p>
                                    <p className="mt-2 break-all text-sm font-semibold leading-relaxed text-slate-900">{user?.email || 'Loading...'}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Role</p>
                                    <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">
                                        {user?.role || 'Loading...'}
                                    </p>
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="profile-password" className="text-xs font-bold uppercase tracking-wider text-slate-400">New Password</label>
                                    <input
                                        id="profile-password"
                                        type="password"
                                        placeholder="Leave blank to keep current password"
                                        className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label htmlFor="profile-weekly-hour-limit" className="text-xs font-bold uppercase tracking-wider text-slate-400">Weekly Hour Limit</label>
                                    <p className="text-xs text-slate-500 mt-0.5 mb-1">Get overtime alerts when you exceed this limit. Leave blank for no limit.</p>
                                    <input
                                        id="profile-weekly-hour-limit"
                                        type="number"
                                        min="0"
                                        max="168"
                                        placeholder="e.g. 40"
                                        className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                                        value={weeklyHourLimit}
                                        onChange={(event) => setWeeklyHourLimit(event.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="mt-6 flex justify-end">
                                <button
                                    type="submit"
                                    className="rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                                    disabled={saving}
                                >
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
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

                <MattermostLinkCard />
            </div>
        </div>
    );
};

export default Profile;
