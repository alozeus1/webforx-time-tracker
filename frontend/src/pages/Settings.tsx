import React, { useEffect, useState } from 'react';

const devSettings = [
    {
        title: 'API Endpoint',
        description: 'Configured through `VITE_API_URL` for local, staging, or live-test environments.',
    },
    {
        title: 'Background Workers',
        description: 'Controlled by backend `ENABLE_BACKGROUND_WORKERS` for reminders, idle checks, and burnout alerts.',
    },
    {
        title: 'Session Security',
        description: 'Authentication now requires explicit JWT secrets and clears invalid sessions automatically.',
    },
    {
        title: 'Google Calendar OAuth',
        description: 'Requires backend `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`, plus a matching redirect URI in Google Cloud Console.',
    },
];

const Settings: React.FC = () => {
    const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

    const [notifPrefs, setNotifPrefs] = useState({
        overtime_alerts: true,
        budget_warnings: true,
        approval_requests: true,
        weekly_summary: false,
    });

    useEffect(() => {
        const stored = localStorage.getItem('wfx-notification-prefs');
        if (stored) {
            try { setNotifPrefs(JSON.parse(stored)); } catch { /* ignore */ }
        }
    }, []);

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
