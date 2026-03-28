import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import api from '../services/api';
import type { WebhookSummary } from '../types/api';

const AVAILABLE_EVENTS = ['timer.started', 'timer.stopped', 'entry.created', 'entry.updated', 'entry.deleted', 'invoice.created', 'invoice.paid'];

const Webhooks: React.FC = () => {
    const [webhooks, setWebhooks] = useState<WebhookSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

    const [form, setForm] = useState({ url: '', events: [] as string[] });

    const fetchWebhooks = useCallback(async () => {
        try {
            const res = await api.get<{ webhooks: WebhookSummary[] }>('/webhooks');
            setWebhooks(res.data.webhooks || []);
        } catch {
            setFeedback({ message: 'Failed to load webhooks', tone: 'error' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchWebhooks(); }, [fetchWebhooks]);

    const toggleEvent = (event: string) => {
        setForm(prev => ({
            ...prev,
            events: prev.events.includes(event) ? prev.events.filter(e => e !== event) : [...prev.events, event],
        }));
    };

    const handleCreate = async () => {
        if (!form.url.trim() || form.events.length === 0) {
            setFeedback({ message: 'URL and at least one event required', tone: 'error' });
            return;
        }
        try {
            await api.post('/webhooks', { url: form.url.trim(), events: form.events });
            setFeedback({ message: 'Webhook created', tone: 'success' });
            setShowCreate(false);
            setForm({ url: '', events: [] });
            void fetchWebhooks();
        } catch {
            setFeedback({ message: 'Failed to create webhook', tone: 'error' });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/webhooks/${id}`);
            setFeedback({ message: 'Webhook deleted', tone: 'success' });
            void fetchWebhooks();
        } catch {
            setFeedback({ message: 'Failed to delete webhook', tone: 'error' });
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

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight" style={{ fontFamily: 'var(--font-family-display)' }}>Webhooks</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Send real-time event notifications to external services.</p>
                    </div>
                    <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all self-start">
                        <Plus size={16} /> New Webhook
                    </button>
                </div>

                {showCreate && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm space-y-4">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Webhook</h2>
                        <input className={inputClass} placeholder="https://your-service.com/webhook" value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} />
                        <div>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Events</p>
                            <div className="flex flex-wrap gap-2">
                                {AVAILABLE_EVENTS.map(ev => (
                                    <button key={ev} onClick={() => toggleEvent(ev)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${form.events.includes(ev)
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                        }`}
                                    >
                                        {ev}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleCreate} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-all">Create</button>
                            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-all">Cancel</button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-12 text-slate-500 dark:text-slate-400">Loading webhooks...</div>
                ) : webhooks.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 dark:text-slate-500">No webhooks configured. Create one to start receiving event notifications.</div>
                ) : (
                    <div className="space-y-3">
                        {webhooks.map(wh => (
                            <div key={wh.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Globe size={16} className="text-slate-400 shrink-0" />
                                        <span className="font-mono text-sm text-slate-900 dark:text-white truncate">{wh.url}</span>
                                        {wh.is_active ? (
                                            <ToggleRight size={18} className="text-emerald-500 shrink-0" />
                                        ) : (
                                            <ToggleLeft size={18} className="text-slate-400 shrink-0" />
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {wh.events.map(ev => (
                                            <span key={ev} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-xs text-slate-600 dark:text-slate-400">{ev}</span>
                                        ))}
                                    </div>
                                </div>
                                <button onClick={() => handleDelete(wh.id)} title="Delete webhook" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors shrink-0">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Webhooks;
