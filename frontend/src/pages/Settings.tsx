import React, { useEffect, useState } from 'react';
import { getStoredPrivacyMode, setStoredPrivacyMode, type PrivacyMode } from '../utils/privacyMode';
import api from '../services/api';

const devSettings = [
    {
        title: 'API Endpoint',
        description: 'Defines which backend environment this workspace connects to (local, staging, or production).',
    },
    {
        title: 'Background Workers',
        description: 'Controls automated reminders, idle checks, and workload monitoring jobs.',
    },
    {
        title: 'Session Security',
        description: 'Authentication now requires explicit JWT secrets and clears invalid sessions automatically.',
    },
    {
        title: 'Google Calendar OAuth',
        description: 'Requires a configured OAuth client and approved redirect URL in the Google Cloud project.',
    },
];

const Settings: React.FC = () => {
    const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
    const [privacyMode, setPrivacyMode] = useState<PrivacyMode>(() => getStoredPrivacyMode());

    // ── MFA state ────────────────────────────────────────────────────────────
    const [mfaEnabled, setMfaEnabled] = useState(false);
    const [mfaLoading, setMfaLoading] = useState(true);
    const [mfaStep, setMfaStep] = useState<'idle' | 'setup' | 'disable'>('idle');
    const [mfaQr, setMfaQr] = useState('');
    const [mfaSecret, setMfaSecret] = useState('');
    const [mfaTotpCode, setMfaTotpCode] = useState('');
    const [mfaPassword, setMfaPassword] = useState('');
    const [mfaFeedback, setMfaFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

    const [notifPrefs, setNotifPrefs] = useState(() => {
        const defaults = {
            overtime_alerts: true,
            budget_warnings: true,
            approval_requests: true,
            weekly_summary: false,
        };
        const stored = localStorage.getItem('wfx-notification-prefs');
        if (!stored) {
            return defaults;
        }
        try {
            return { ...defaults, ...(JSON.parse(stored) as Partial<typeof defaults>) };
        } catch {
            return defaults;
        }
    });

    const toggleNotifPref = (key: keyof typeof notifPrefs) => {
        setNotifPrefs(prev => {
            const next = { ...prev, [key]: !prev[key] };
            localStorage.setItem('wfx-notification-prefs', JSON.stringify(next));
            return next;
        });
    };

    const toggleTheme = () => {
        const next = !isDark;
        setIsDark(next);
        if (next) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('wfx-theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('wfx-theme', 'light');
        }
    };

    const updatePrivacyMode = (mode: PrivacyMode) => {
        setPrivacyMode(mode);
        setStoredPrivacyMode(mode);
    };

    // Load MFA status on mount
    useEffect(() => {
        api.get<{ mfa_enabled: boolean }>('/auth/mfa/status')
            .then(r => setMfaEnabled(r.data.mfa_enabled))
            .catch(() => { /* not fatal */ })
            .finally(() => setMfaLoading(false));
    }, []);

    const handleMfaSetup = async () => {
        setMfaFeedback(null);
        try {
            const r = await api.post<{ qr_code: string; secret: string }>('/auth/mfa/setup');
            setMfaQr(r.data.qr_code);
            setMfaSecret(r.data.secret);
            setMfaStep('setup');
        } catch {
            setMfaFeedback({ type: 'err', msg: 'Failed to start MFA setup.' });
        }
    };

    const handleMfaVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setMfaFeedback(null);
        try {
            await api.post('/auth/mfa/verify', { totp_code: mfaTotpCode });
            setMfaEnabled(true);
            setMfaStep('idle');
            setMfaTotpCode('');
            setMfaQr('');
            setMfaSecret('');
            setMfaFeedback({ type: 'ok', msg: 'MFA enabled successfully! Your account is now protected.' });
        } catch {
            setMfaFeedback({ type: 'err', msg: 'Invalid code. Make sure your device clock is synced.' });
        }
    };

    const handleMfaDisable = async (e: React.FormEvent) => {
        e.preventDefault();
        setMfaFeedback(null);
        try {
            await api.post('/auth/mfa/disable', { password: mfaPassword, totp_code: mfaTotpCode });
            setMfaEnabled(false);
            setMfaStep('idle');
            setMfaTotpCode('');
            setMfaPassword('');
            setMfaFeedback({ type: 'ok', msg: 'MFA disabled.' });
        } catch {
            setMfaFeedback({ type: 'err', msg: 'Incorrect password or code.' });
        }
    };

    return (
        <div className="flex-1 w-full overflow-y-auto bg-slate-50 dark:bg-slate-900 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-5xl space-y-6">

                {/* Page header */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                        Workspace Configuration
                    </p>
                    <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 dark:text-white" style={{ fontFamily: 'var(--font-family-display)' }}>
                        Settings
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                        Manage your preferences and workspace configuration.
                    </p>
                </div>

                {/* Preferences card */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4" style={{ fontFamily: 'var(--font-family-display)' }}>
                        Preferences
                    </h2>
                    <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700 last:border-0">
                        <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Appearance</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {isDark ? 'Dark mode is active' : 'Light mode is active'}
                            </p>
                        </div>
                        <button
                            role="switch"
                            aria-checked={isDark}
                            aria-label="Toggle dark mode"
                            onClick={toggleTheme}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isDark ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-600'}`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-6' : 'translate-x-1'}`}
                            />
                        </button>
                    </div>
                    <div className="pt-4">
                        <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Privacy Mode</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Make monitoring intent explicit across workday reconstruction and team reporting.
                            </p>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                            {([
                                {
                                    key: 'personal' as const,
                                    label: 'Personal',
                                    description: 'Redacts browser activity titles and favors private self-review.',
                                },
                                {
                                    key: 'team_ops' as const,
                                    label: 'Team Ops',
                                    description: 'Shares operational activity categories without exposing sensitive detail.',
                                },
                                {
                                    key: 'compliance' as const,
                                    label: 'Compliance',
                                    description: 'Keeps detailed activity labels visible for auditable work evidence.',
                                },
                            ]).map((mode) => (
                                <button
                                    key={mode.key}
                                    type="button"
                                    onClick={() => updatePrivacyMode(mode.key)}
                                    className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                                        privacyMode === mode.key
                                            ? 'border-primary bg-primary/5 shadow-sm'
                                            : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900'
                                    }`}
                                >
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">{mode.label}</p>
                                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{mode.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Notification Preferences */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4" style={{ fontFamily: 'var(--font-family-display)' }}>
                        Notifications
                    </h2>
                    <div className="space-y-1">
                        {([
                            { key: 'overtime_alerts' as const, label: 'Overtime Alerts', desc: 'Get notified when you exceed your weekly hour limit' },
                            { key: 'budget_warnings' as const, label: 'Budget Warnings', desc: 'Alert when projects approach their budget limit' },
                            { key: 'approval_requests' as const, label: 'Approval Requests', desc: 'Notifications for pending timesheet approvals' },
                            { key: 'weekly_summary' as const, label: 'Weekly Summary Email', desc: 'Receive a weekly hours summary via email' },
                        ]).map(item => (
                            <div key={item.key} className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700 last:border-0">
                                <div>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.label}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</p>
                                </div>
                                <button
                                    role="switch"
                                    aria-checked={notifPrefs[item.key]}
                                    aria-label={`Toggle ${item.label}`}
                                    onClick={() => toggleNotifPref(item.key)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${notifPrefs[item.key] ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-600'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${notifPrefs[item.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* MFA / Two-Factor Authentication */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1" style={{ fontFamily: 'var(--font-family-display)' }}>
                        Two-Factor Authentication
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                        Add a second layer of security using an authenticator app (Google Authenticator, Authy, etc.).
                    </p>

                    {mfaFeedback && (
                        <div className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${mfaFeedback.type === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'}`}>
                            {mfaFeedback.msg}
                        </div>
                    )}

                    {mfaLoading ? (
                        <p className="text-sm text-slate-500">Loading…</p>
                    ) : mfaStep === 'idle' ? (
                        <div className="flex items-center gap-4">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${mfaEnabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                                {mfaEnabled ? '✓ Enabled' : '✗ Disabled'}
                            </span>
                            {mfaEnabled ? (
                                <button type="button" onClick={() => { setMfaStep('disable'); setMfaFeedback(null); }}
                                    className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/10">
                                    Disable MFA
                                </button>
                            ) : (
                                <button type="button" onClick={() => void handleMfaSetup()}
                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90">
                                    Enable MFA
                                </button>
                            )}
                        </div>
                    ) : mfaStep === 'setup' ? (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-700 dark:text-slate-300">
                                1. Scan this QR code with your authenticator app:
                            </p>
                            {mfaQr && <img src={mfaQr} alt="MFA QR Code" className="w-48 h-48 rounded-xl border border-slate-200" />}
                            <p className="text-xs text-slate-500">
                                Or enter manually: <code className="rounded bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-xs font-mono">{mfaSecret}</code>
                            </p>
                            <form onSubmit={(e) => void handleMfaVerify(e)} className="flex items-end gap-3">
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    2. Enter the 6-digit code to confirm
                                    <input type="text" inputMode="numeric" pattern="[0-9 ]*" maxLength={7}
                                        value={mfaTotpCode} onChange={e => setMfaTotpCode(e.target.value)}
                                        placeholder="000 000" autoFocus required
                                        className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 w-36" />
                                </label>
                                <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90">Activate</button>
                                <button type="button" onClick={() => { setMfaStep('idle'); setMfaTotpCode(''); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                            </form>
                        </div>
                    ) : (
                        <form onSubmit={(e) => void handleMfaDisable(e)} className="space-y-3">
                            <p className="text-sm text-slate-700 dark:text-slate-300">Confirm your password and current authenticator code to disable MFA.</p>
                            <div className="flex flex-wrap gap-3 items-end">
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Password
                                    <input type="password" value={mfaPassword} onChange={e => setMfaPassword(e.target.value)} required autoFocus
                                        className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 w-48" />
                                </label>
                                <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Authenticator Code
                                    <input type="text" inputMode="numeric" pattern="[0-9 ]*" maxLength={7}
                                        value={mfaTotpCode} onChange={e => setMfaTotpCode(e.target.value)} required placeholder="000 000"
                                        className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 w-36" />
                                </label>
                                <button type="submit" className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">Disable MFA</button>
                                <button type="button" onClick={() => { setMfaStep('idle'); setMfaTotpCode(''); setMfaPassword(''); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                            </div>
                        </form>
                    )}
                </div>

                {/* Developer / Advanced Configuration — collapsed by default */}
                <details className="group">
                    <summary className="cursor-pointer list-none flex items-center gap-3 py-3 px-4 rounded-xl border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors">
                        <span className="text-base">⚙</span>
                        <span className="text-sm font-bold text-amber-900 dark:text-amber-400 flex-1">
                            Advanced Configuration (Developers Only)
                        </span>
                        <span className="text-amber-600 dark:text-amber-500 transition-transform group-open:rotate-180 text-xs select-none">▼</span>
                    </summary>

                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        {devSettings.map((setting, index) => (
                            <div key={setting.title} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                                <div className="mb-3 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                                    Section {index + 1}
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{setting.title}</h3>
                                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{setting.description}</p>
                            </div>
                        ))}
                    </div>
                </details>

            </div>
        </div>
    );
};

export default Settings;
