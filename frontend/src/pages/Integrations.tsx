import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Box, CalendarDays, Save, Unplug } from 'lucide-react';
import api from '../services/api';
import type { CalendarStatus, IntegrationSummary } from '../types/api';

const taskConnectorDefinitions = [
    {
        type: 'github',
        title: 'GitHub',
        description: 'Turn commits and repos into workday signals.',
        fields: [
            { key: 'repository', label: 'Repository', placeholder: 'webforxtech/time-tracker' },
            { key: 'personalAccessToken', label: 'Personal Access Token', placeholder: 'ghp_...' },
        ],
    },
    {
        type: 'jira',
        title: 'Jira',
        description: 'Map tickets and sprint work into timer suggestions.',
        fields: [
            { key: 'baseUrl', label: 'Base URL', placeholder: 'https://company.atlassian.net' },
            { key: 'email', label: 'Email', placeholder: 'you@company.com' },
            { key: 'apiToken', label: 'API Token', placeholder: 'Atlassian API token' },
            { key: 'projectKey', label: 'Project Key', placeholder: 'WFX' },
        ],
    },
    {
        type: 'linear',
        title: 'Linear',
        description: 'Use team cycles and issues as task-native context.',
        fields: [
            { key: 'apiKey', label: 'API Key', placeholder: 'lin_api_...' },
            { key: 'teamName', label: 'Team Name', placeholder: 'Platform' },
        ],
    },
    {
        type: 'asana',
        title: 'Asana',
        description: 'Bring workspace tasks into workday reconstruction.',
        fields: [
            { key: 'personalAccessToken', label: 'Personal Access Token', placeholder: 'Asana PAT' },
            { key: 'workspace', label: 'Workspace', placeholder: 'Client Delivery' },
        ],
    },
    {
        type: 'clickup',
        title: 'ClickUp',
        description: 'Connect workspace work items to timer and timeline review.',
        fields: [
            { key: 'apiKey', label: 'API Key', placeholder: 'ClickUp API key' },
            { key: 'workspaceId', label: 'Workspace ID', placeholder: '901234567' },
        ],
    },
    {
        type: 'trello',
        title: 'Trello',
        description: 'Use board activity as lightweight task context.',
        fields: [
            { key: 'apiKey', label: 'API Key', placeholder: 'Trello API key' },
            { key: 'token', label: 'Token', placeholder: 'Trello token' },
            { key: 'boardId', label: 'Board ID', placeholder: 'board123' },
        ],
    },
];

const Integrations: React.FC = () => {
    const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
    const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
    const [taigaUsername, setTaigaUsername] = useState('');
    const [taigaPassword, setTaigaPassword] = useState('');
    const [mattermostWebhookUrl, setMattermostWebhookUrl] = useState('');
    const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
    const [savingType, setSavingType] = useState<string | null>(null);
    const [testingType, setTestingType] = useState<string | null>(null);
    const [taskConnectorForm, setTaskConnectorForm] = useState<Record<string, Record<string, string>>>({
        github: { repository: '', personalAccessToken: '' },
        jira: { baseUrl: '', email: '', apiToken: '', projectKey: '' },
        linear: { apiKey: '', teamName: '' },
        asana: { personalAccessToken: '', workspace: '' },
        clickup: { apiKey: '', workspaceId: '' },
        trello: { apiKey: '', token: '', boardId: '' },
    });

    const integrationMap = useMemo(
        () => new Map(integrations.map((integration) => [integration.type, integration])),
        [integrations]
    );

    const loadCalendarStatus = async () => {
        try {
            const response = await api.get<CalendarStatus>('/calendar/status');
            setCalendarStatus(response.data);
        } catch (error) {
            console.error('Failed to load Google Calendar status:', error);
        }
    };

    const fetchIntegrations = async () => {
        try {
            const response = await api.get<{ integrations: IntegrationSummary[] }>('/integrations');
            setIntegrations(response.data.integrations || []);
        } catch (error) {
            console.error('Failed to load integrations:', error);
        }
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const calendarState = params.get('calendar');

        if (calendarState === 'connected') {
            setFeedback({ message: 'Google Calendar connected successfully', tone: 'success' });
            params.delete('calendar');
            params.delete('reason');
            const nextQuery = params.toString();
            const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
            window.history.replaceState({}, '', nextUrl);
        }

        if (calendarState === 'error') {
            setFeedback({ message: 'Google Calendar connection failed. Please try again.', tone: 'error' });
            params.delete('calendar');
            params.delete('reason');
            const nextQuery = params.toString();
            const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
            window.history.replaceState({}, '', nextUrl);
        }

        void fetchIntegrations();
        void loadCalendarStatus();
    }, []);

    const handleSave = async (type: string, config: Record<string, string>) => {
        setSavingType(type);
        setFeedback(null);

        try {
            const response = await api.post<{ message: string }>('/integrations', { type, config });
            setFeedback({ message: response.data.message, tone: 'success' });
            await fetchIntegrations();

            if (type === 'taiga') {
                setTaigaPassword('');
            }
        } catch (error) {
            console.error(`Failed to save ${type} integration:`, error);
            setFeedback({ message: `Failed to save ${type} integration`, tone: 'error' });
        } finally {
            setSavingType(null);
        }
    };

    const handleTest = async (type: string) => {
        setTestingType(type);
        setFeedback(null);

        try {
            const response = await api.post<{ message: string }>('/integrations/test', { type });
            setFeedback({ message: response.data.message, tone: 'success' });
        } catch (error) {
            console.error(`Failed to test ${type} integration:`, error);
            const message =
                typeof (error as { response?: { data?: { message?: string } } })?.response?.data?.message === 'string'
                    ? (error as { response: { data: { message: string } } }).response.data.message
                    : `Failed to test ${type} integration`;
            setFeedback({ message, tone: 'error' });
        } finally {
            setTestingType(null);
        }
    };

    const updateTaskConnectorField = (type: string, key: string, value: string) => {
        setTaskConnectorForm((previous) => ({
            ...previous,
            [type]: {
                ...previous[type],
                [key]: value,
            },
        }));
    };

    const handleGoogleCalendarConnect = async () => {
        try {
            const response = await api.get<{ url: string }>('/calendar/connect', {
                params: { returnTo: '/integrations' },
            });

            window.location.assign(response.data.url);
        } catch (error) {
            console.error('Failed to start Google Calendar connection:', error);
            setFeedback({ message: 'Failed to start Google Calendar connection', tone: 'error' });
        }
    };

    const handleGoogleCalendarDisconnect = async () => {
        try {
            const response = await api.delete<{ message: string }>('/calendar/disconnect');
            setFeedback({ message: response.data.message, tone: 'success' });
            await loadCalendarStatus();
        } catch (error) {
            console.error('Failed to disconnect Google Calendar:', error);
            setFeedback({ message: 'Failed to disconnect Google Calendar', tone: 'error' });
        }
    };

    return (
        <div className="flex-1 p-6 lg:p-10 w-full mx-auto bg-background-light dark:bg-background-dark min-h-full">
            <div className="mb-10">
                <h2 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Integrations</h2>
                <p className="text-slate-600 dark:text-slate-400 text-lg">Configure external systems for live testing without leaving the admin console.</p>
            </div>

            {feedback && (
                <div className={`mb-6 rounded-xl px-4 py-3 text-sm font-medium ${
                    feedback.tone === 'success'
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border border-rose-200 bg-rose-50 text-rose-800'
                }`}>
                    {feedback.message}
                </div>
            )}

            <div className="grid grid-cols-1 gap-12 max-w-5xl">
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <CalendarDays size={24} />
                        </div>
                        <div className="flex items-center gap-3">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Google Calendar</h3>
                            {calendarStatus?.connected && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                                    <BadgeCheck size={14} />
                                    Connected
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="p-8 flex flex-col gap-6">
                            <div className="space-y-2">
                                <h4 className="text-2xl font-bold">Calendar-Based Work Suggestions</h4>
                                <p className="text-slate-600 dark:text-slate-400 max-w-2xl">Connect a Google account to pull real meetings and focus blocks into the timer flow.</p>
                                {!calendarStatus?.configured && (
                                    <p className="text-sm font-medium text-amber-600">Workspace calendar access has not been enabled yet. You can keep tracking time normally until it is available.</p>
                                )}
                                {calendarStatus?.connected && (
                                    <p className="text-sm text-slate-500">Connected account: {calendarStatus.email || 'Google account'}</p>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={() => void handleGoogleCalendarConnect()}
                                    disabled={!calendarStatus?.configured}
                                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <CalendarDays size={16} />
                                    {calendarStatus?.connected ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
                                </button>

                                {calendarStatus?.connected && (
                                    <button
                                        onClick={() => void handleGoogleCalendarDisconnect()}
                                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                                    >
                                        <Unplug size={16} />
                                        Disconnect
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Box size={24} />
                        </div>
                        <div className="flex items-center gap-3">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Task Management (Taiga)</h3>
                            {integrationMap.get('taiga')?.is_active && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                                    <BadgeCheck size={14} />
                                    Configured
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="p-8 flex flex-col gap-8">
                            <div className="space-y-2">
                                <h4 className="text-2xl font-bold">Pull tasks from Taiga</h4>
                                <p className="text-slate-600 dark:text-slate-400 max-w-2xl">Store a workspace credential for live-test syncing. Credentials are encrypted before they are written to the backend database.</p>
                                {integrationMap.get('taiga')?.summary?.username && (
                                    <p className="text-sm text-slate-500">Configured user: {integrationMap.get('taiga')?.summary?.username}</p>
                                )}
                            </div>

                            <form
                                className="space-y-8"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void handleSave('taiga', { username: taigaUsername, password: taigaPassword });
                                }}
                            >
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                        <label htmlFor="taiga-username" className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Taiga Username or Email</label>
                                        <input
                                            id="taiga-username"
                                            type="text"
                                            value={taigaUsername}
                                            onChange={(event) => setTaigaUsername(event.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                            placeholder="name@company.com"
                                            autoComplete="username"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="taiga-password" className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Taiga Password</label>
                                        <input
                                            id="taiga-password"
                                            type="password"
                                            value={taigaPassword}
                                            onChange={(event) => setTaigaPassword(event.target.value)}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                            placeholder="Enter Taiga password"
                                            autoComplete="current-password"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    <button
                                        type="submit"
                                        disabled={savingType === 'taiga' || !taigaUsername.trim() || !taigaPassword.trim()}
                                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <Save size={16} />
                                        {savingType === 'taiga' ? 'Saving...' : 'Save Taiga Config'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleTest('taiga')}
                                        disabled={testingType === 'taiga' || !integrationMap.get('taiga')?.is_active}
                                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                                    >
                                        <BadgeCheck size={16} />
                                        {testingType === 'taiga' ? 'Testing...' : 'Test Taiga'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </section>

                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Box size={24} />
                        </div>
                        <div className="flex items-center gap-3">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Notification Services (Mattermost)</h3>
                            {integrationMap.get('mattermost')?.is_active && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                                    <BadgeCheck size={14} />
                                    Configured
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="p-8 flex flex-col gap-8">
                            <div className="space-y-2">
                                <h4 className="text-2xl font-bold">Instant Notifications with Mattermost</h4>
                                <p className="text-slate-600 dark:text-slate-400 max-w-2xl">Save a Mattermost incoming webhook for test alerts and summary notifications.</p>
                                {integrationMap.get('mattermost')?.summary?.webhookHost && (
                                    <p className="text-sm text-slate-500">Configured host: {integrationMap.get('mattermost')?.summary?.webhookHost}</p>
                                )}
                            </div>

                            <form
                                className="space-y-8"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void handleSave('mattermost', { webhookUrl: mattermostWebhookUrl });
                                }}
                            >
                                <div>
                                    <label htmlFor="mattermost-webhook" className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Webhook URL</label>
                                    <input
                                        id="mattermost-webhook"
                                        type="url"
                                        value={mattermostWebhookUrl}
                                        onChange={(event) => setMattermostWebhookUrl(event.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                        placeholder="https://mattermost.example.com/hooks/..."
                                    />
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    <button
                                        type="submit"
                                        disabled={savingType === 'mattermost' || !mattermostWebhookUrl.trim()}
                                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <Save size={16} />
                                        {savingType === 'mattermost' ? 'Saving...' : 'Save Mattermost Config'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleTest('mattermost')}
                                        disabled={testingType === 'mattermost' || !integrationMap.get('mattermost')?.is_active}
                                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                                    >
                                        <BadgeCheck size={16} />
                                        {testingType === 'mattermost' ? 'Testing...' : 'Test Mattermost'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </section>

                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Box size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Task-Native Sync Hub</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Connect issue trackers and delivery tools so the Workday view can suggest time from real work context.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        {taskConnectorDefinitions.map((connector) => {
                            const configuredIntegration = integrationMap.get(connector.type);
                            const connectorConfig = taskConnectorForm[connector.type] || {};
                            const isReadyToSave = connector.fields.every((field) => (connectorConfig[field.key] || '').trim().length > 0);

                            return (
                                <div key={connector.type} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                                    <div className="p-6 space-y-5">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <h4 className="text-xl font-bold text-slate-900 dark:text-white">{connector.title}</h4>
                                                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{connector.description}</p>
                                            </div>
                                            {configuredIntegration?.is_active && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                                                    <BadgeCheck size={14} />
                                                    Configured
                                                </span>
                                            )}
                                        </div>

                                        {configuredIntegration?.summary && (
                                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                                                {Object.entries(configuredIntegration.summary).map(([key, value]) => (
                                                    <p key={key}>
                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{key}:</span> {value}
                                                    </p>
                                                ))}
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            {connector.fields.map((field) => (
                                                <div key={`${connector.type}-${field.key}`}>
                                                    <label htmlFor={`${connector.type}-${field.key}`} className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">{field.label}</label>
                                                    <input
                                                        id={`${connector.type}-${field.key}`}
                                                        type={field.key.toLowerCase().includes('token') || field.key.toLowerCase().includes('key') ? 'password' : 'text'}
                                                        value={connectorConfig[field.key] || ''}
                                                        onChange={(event) => updateTaskConnectorField(connector.type, field.key, event.target.value)}
                                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                                        placeholder={field.placeholder}
                                                    />
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex flex-wrap gap-3">
                                            <button
                                                type="button"
                                                disabled={savingType === connector.type || !isReadyToSave}
                                                onClick={() => void handleSave(connector.type, connectorConfig)}
                                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <Save size={16} />
                                                {savingType === connector.type ? 'Saving...' : `Save ${connector.title}`}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={testingType === connector.type || !configuredIntegration?.is_active}
                                                onClick={() => void handleTest(connector.type)}
                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                                            >
                                                <BadgeCheck size={16} />
                                                {testingType === connector.type ? 'Testing...' : `Test ${connector.title}`}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default Integrations;
