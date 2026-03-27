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
        <div className="flex-1 w-full overflow-y-auto bg-slate-50 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-5xl space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Workspace Configuration</p>
                    <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">Settings</h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-500">
                        Environment-backed configuration notes for live testing and deployment.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {settings.map((setting, index) => (
                        <div key={setting.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                            <div className="mb-3 inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                                Section {index + 1}
                            </div>
                            <h2 className="text-lg font-bold text-slate-900">{setting.title}</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-500">{setting.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Settings;
