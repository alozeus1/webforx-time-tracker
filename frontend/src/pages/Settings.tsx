import React from 'react';

const settings = [
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
    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-background-dark p-8 w-full">
            <div className="max-w-3xl mx-auto space-y-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Settings</h1>
                    <p className="mt-1 text-slate-500">Environment-backed configuration notes for live testing and deployment.</p>
                </div>

                <div className="space-y-4">
                    {settings.map((setting) => (
                        <div key={setting.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{setting.title}</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-500">{setting.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Settings;
