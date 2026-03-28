import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import api, { getApiErrorMessage, parseApiError } from '../services/api';

interface ScheduledReportItem {
    id: string;
    frequency: string;
    day_of_week?: number | null;
    recipients: string[];
    report_type: string;
    is_active: boolean;
    last_sent_at?: string | null;
    created_at: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ScheduledReports: React.FC = () => {
    const [reports, setReports] = useState<ScheduledReportItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const [form, setForm] = useState({
        frequency: 'weekly',
        day_of_week: '1',
        recipients: '',
        report_type: 'summary',
    });

    const fetchReports = useCallback(async () => {
        setLoadError(null);
        try {
            const res = await api.get<{ reports: ScheduledReportItem[] }>('/scheduled-reports');
            setReports(res.data.reports || []);
        } catch (error) {
            const parsed = parseApiError(error, 'Failed to load scheduled reports');
            const isRouteGap = parsed.status === 404 || /api route not found/i.test(parsed.message);
            setLoadError(
                isRouteGap
                    ? 'Scheduled reports are temporarily unavailable. Please verify backend route deployment and try again.'
                    : parsed.message,
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchReports(); }, [fetchReports]);

    const handleCreate = async () => {
        const recipients = form.recipients.split(',').map(r => r.trim()).filter(Boolean);
        if (recipients.length === 0) {
            setFeedback({ message: 'At least one recipient email required', tone: 'error' });
            return;
        }
        setCreating(true);
        try {
            await api.post('/scheduled-reports', {
                frequency: form.frequency,
                day_of_week: form.frequency === 'weekly' ? parseInt(form.day_of_week) : undefined,
                recipients,
                report_type: form.report_type,
            });
            setFeedback({ message: 'Scheduled report created', tone: 'success' });
            setShowCreate(false);
            setForm({ frequency: 'weekly', day_of_week: '1', recipients: '', report_type: 'summary' });
            void fetchReports();
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, 'Failed to create scheduled report'), tone: 'error' });
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id: string) => {
        setProcessingId(id);
        try {
            await api.delete(`/scheduled-reports/${id}`);
            setFeedback({ message: 'Scheduled report deleted', tone: 'success' });
            void fetchReports();
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, 'Failed to delete scheduled report'), tone: 'error' });
        } finally {
            setProcessingId(null);
        }
    };

    const handleToggle = async (report: ScheduledReportItem) => {
        setProcessingId(report.id);
        try {
            await api.put(`/scheduled-reports/${report.id}`, { is_active: !report.is_active });
            void fetchReports();
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, 'Failed to update report'), tone: 'error' });
        } finally {
            setProcessingId(null);
        }
    };

    const inputClass = 'w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none';

    return (
        <div className="flex-1 w-full overflow-y-auto bg-slate-50 dark:bg-slate-900 p-4 md:p-6 lg:p-8">
            <div className="max-w-5xl mx-auto space-y-6">
                {feedback && (
                    <div className={`p-3 rounded-lg text-sm font-medium ${feedback.tone === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {feedback.message}
                    </div>
                )}
                {loadError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300">
                        <p className="font-semibold">Unable to load scheduled reports</p>
                        <p className="mt-1">{loadError}</p>
                        <button
                            type="button"
                            className="mt-3 inline-flex items-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-900/20"
                            onClick={() => {
                                setLoading(true);
                                void fetchReports();
                            }}
                        >
                            Retry
                        </button>
                    </div>
                )}

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight" style={{ fontFamily: 'var(--font-family-display)' }}>Scheduled Reports</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Automate recurring email reports for your team.</p>
                    </div>
                    <button type="button" onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all self-start">
                        <Plus size={16} /> New Schedule
                    </button>
                </div>

                {showCreate && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm space-y-4">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Scheduled Report</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="schedule-frequency" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Frequency</label>
                                <select
                                    id="schedule-frequency"
                                    name="frequency"
                                    className={`${inputClass} mt-1`}
                                    value={form.frequency}
                                    onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}
                                >
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                </select>
                            </div>
                            {form.frequency === 'weekly' && (
                                <div>
                                    <label htmlFor="schedule-day-of-week" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Day of Week</label>
                                    <select
                                        id="schedule-day-of-week"
                                        name="dayOfWeek"
                                        className={`${inputClass} mt-1`}
                                        value={form.day_of_week}
                                        onChange={e => setForm(p => ({ ...p, day_of_week: e.target.value }))}
                                    >
                                        {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label htmlFor="schedule-report-type" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Report Type</label>
                                <select
                                    id="schedule-report-type"
                                    name="reportType"
                                    className={`${inputClass} mt-1`}
                                    value={form.report_type}
                                    onChange={e => setForm(p => ({ ...p, report_type: e.target.value }))}
                                >
                                    <option value="summary">Summary</option>
                                    <option value="detailed">Detailed</option>
                                    <option value="billable">Billable Hours</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="schedule-recipients" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recipients</label>
                                <input
                                    id="schedule-recipients"
                                    name="recipients"
                                    className={`${inputClass} mt-1`}
                                    placeholder="name@company.com, another@company.com"
                                    value={form.recipients}
                                    onChange={e => setForm(p => ({ ...p, recipients: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" onClick={handleCreate} disabled={creating} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-60">{creating ? 'Creating...' : 'Create'}</button>
                            <button type="button" onClick={() => setShowCreate(false)} disabled={creating} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-all disabled:opacity-60">Cancel</button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-12 text-slate-500 dark:text-slate-400">Loading scheduled reports...</div>
                ) : loadError ? (
                    <div className="text-center py-12 text-slate-500 dark:text-slate-400">Scheduled reports are unavailable right now.</div>
                ) : reports.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 dark:text-slate-500">No scheduled reports. Create one to automate email delivery.</div>
                ) : (
                    <div className="space-y-3">
                        {reports.map(r => (
                            <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <CalendarClock size={16} className="text-slate-400 shrink-0" />
                                        <span className="font-bold text-slate-900 dark:text-white capitalize">{r.frequency} {r.report_type} report</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                                            {r.is_active ? 'Active' : 'Paused'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                        {r.frequency === 'weekly' && r.day_of_week != null ? `Every ${DAY_NAMES[r.day_of_week]}` : 'Monthly'}
                                        {' · '}To: {(r.recipients || []).join(', ')}
                                        {r.last_sent_at && ` · Last sent ${new Date(r.last_sent_at).toLocaleDateString()}`}
                                    </p>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <button type="button" onClick={() => handleToggle(r)} disabled={processingId === r.id} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-60 ${r.is_active ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400'}`}>
                                        {r.is_active ? 'Pause' : 'Resume'}
                                    </button>
                                    <button type="button" onClick={() => handleDelete(r.id)} disabled={processingId === r.id} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors disabled:opacity-60"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ScheduledReports;
