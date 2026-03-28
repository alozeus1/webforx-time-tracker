import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import api from '../services/api';
import type { ProjectTemplateSummary } from '../types/api';

const Templates: React.FC = () => {
    const [templates, setTemplates] = useState<ProjectTemplateSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [applyingId, setApplyingId] = useState<string | null>(null);
    const [projectName, setProjectName] = useState('');
    const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

    const [form, setForm] = useState({
        name: '',
        description: '',
        default_billable: true,
        budget_hours: '',
        budget_amount: '',
    });

    const fetchTemplates = useCallback(async () => {
        try {
            const res = await api.get<{ templates: ProjectTemplateSummary[] }>('/templates');
            setTemplates(res.data.templates || []);
        } catch {
            setFeedback({ message: 'Failed to load templates', tone: 'error' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchTemplates(); }, [fetchTemplates]);

    const handleCreate = async () => {
        if (!form.name.trim()) { setFeedback({ message: 'Template name is required', tone: 'error' }); return; }
        try {
            await api.post('/templates', {
                name: form.name.trim(),
                description: form.description || undefined,
                default_billable: form.default_billable,
                budget_hours: form.budget_hours ? parseFloat(form.budget_hours) : undefined,
                budget_amount: form.budget_amount ? parseFloat(form.budget_amount) : undefined,
            });
            setFeedback({ message: 'Template created', tone: 'success' });
            setShowCreate(false);
            setForm({ name: '', description: '', default_billable: true, budget_hours: '', budget_amount: '' });
            void fetchTemplates();
        } catch {
            setFeedback({ message: 'Failed to create template', tone: 'error' });
        }
    };

    const handleApply = async (templateId: string) => {
        if (!projectName.trim()) { setFeedback({ message: 'Enter a project name', tone: 'error' }); return; }
        try {
            await api.post(`/templates/${templateId}/apply`, { name: projectName.trim() });
            setFeedback({ message: `Project "${projectName.trim()}" created from template`, tone: 'success' });
            setApplyingId(null);
            setProjectName('');
        } catch {
            setFeedback({ message: 'Failed to create project. Name may already exist.', tone: 'error' });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/templates/${id}`);
            setFeedback({ message: 'Template deleted', tone: 'success' });
            void fetchTemplates();
        } catch {
            setFeedback({ message: 'Failed to delete template', tone: 'error' });
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
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight" style={{ fontFamily: 'var(--font-family-display)' }}>Project Templates</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Reusable project configurations for quick setup.</p>
                    </div>
                    <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all self-start">
                        <Plus size={16} /> New Template
                    </button>
                </div>

                {showCreate && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm space-y-4">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Template</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input className={inputClass} placeholder="Template Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                            <input className={inputClass} placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                            <input className={inputClass} type="number" step="0.5" placeholder="Budget Hours" value={form.budget_hours} onChange={e => setForm(p => ({ ...p, budget_hours: e.target.value }))} />
                            <input className={inputClass} type="number" step="0.01" placeholder="Budget Amount ($)" value={form.budget_amount} onChange={e => setForm(p => ({ ...p, budget_amount: e.target.value }))} />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input type="checkbox" checked={form.default_billable} onChange={e => setForm(p => ({ ...p, default_billable: e.target.checked }))} className="rounded border-slate-300" />
                            Default billable
                        </label>
                        <div className="flex gap-2">
                            <button onClick={handleCreate} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-all">Create</button>
                            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-all">Cancel</button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-12 text-slate-500 dark:text-slate-400">Loading templates...</div>
                ) : templates.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 dark:text-slate-500">No templates yet. Create one to speed up project setup.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {templates.map(t => (
                            <div key={t.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm space-y-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white">{t.name}</h3>
                                        {t.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t.description}</p>}
                                    </div>
                                    <button onClick={() => handleDelete(t.id)} title="Delete template" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"><Trash2 size={16} /></button>
                                </div>
                                <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                                    {t.budget_hours != null && <span>{t.budget_hours}h budget</span>}
                                    {t.budget_amount != null && <span>${t.budget_amount}</span>}
                                    <span>{t.default_billable ? 'Billable' : 'Non-billable'}</span>
                                </div>
                                {applyingId === t.id ? (
                                    <div className="flex gap-2">
                                        <input className={inputClass} placeholder="New project name" value={projectName} onChange={e => setProjectName(e.target.value)} />
                                        <button onClick={() => handleApply(t.id)} className="px-3 py-2 bg-primary text-white rounded-lg text-xs font-bold whitespace-nowrap">Create</button>
                                        <button onClick={() => { setApplyingId(null); setProjectName(''); }} className="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-xs font-medium whitespace-nowrap">Cancel</button>
                                    </div>
                                ) : (
                                    <button onClick={() => setApplyingId(t.id)} className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
                                        <Copy size={14} /> Use Template
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Templates;
