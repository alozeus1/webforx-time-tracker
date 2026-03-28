import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, Send, CheckCircle, Trash2, DollarSign } from 'lucide-react';
import api from '../services/api';
import type { InvoiceSummary, ProjectSummary } from '../types/api';

const STATUS_STYLES: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const Invoices: React.FC = () => {
    const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

    const [form, setForm] = useState({
        client_name: '',
        project_id: '',
        tax_rate: '0',
        notes: '',
        due_date: '',
        line_items: [{ description: '', hours: '', rate: '' }],
    });

    const fetchInvoices = useCallback(async () => {
        try {
            const params: Record<string, string> = {};
            if (statusFilter !== 'all') params.status = statusFilter;
            const res = await api.get<{ invoices: InvoiceSummary[] }>('/invoices', { params });
            setInvoices(res.data.invoices || []);
        } catch {
            setFeedback({ message: 'Failed to load invoices', tone: 'error' });
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        const init = async () => {
            const [, projRes] = await Promise.all([
                fetchInvoices(),
                api.get<ProjectSummary[]>('/projects').catch(() => ({ data: [] as ProjectSummary[] })),
            ]);
            setProjects(projRes.data || []);
        };
        void init();
    }, [fetchInvoices]);

    const handleCreate = async () => {
        try {
            const lineItems = form.line_items
                .filter(li => li.description && li.hours && li.rate)
                .map(li => ({
                    description: li.description,
                    hours: parseFloat(li.hours),
                    rate: parseFloat(li.rate),
                }));
            if (!form.client_name.trim() || lineItems.length === 0) {
                setFeedback({ message: 'Client name and at least one line item required', tone: 'error' });
                return;
            }
            await api.post('/invoices', {
                client_name: form.client_name.trim(),
                project_id: form.project_id || undefined,
                tax_rate: parseFloat(form.tax_rate) || 0,
                notes: form.notes || undefined,
                due_date: form.due_date || undefined,
                line_items: lineItems,
            });
            setFeedback({ message: 'Invoice created', tone: 'success' });
            setShowCreate(false);
            setForm({ client_name: '', project_id: '', tax_rate: '0', notes: '', due_date: '', line_items: [{ description: '', hours: '', rate: '' }] });
            void fetchInvoices();
        } catch {
            setFeedback({ message: 'Failed to create invoice', tone: 'error' });
        }
    };

    const updateStatus = async (id: string, status: 'sent' | 'paid') => {
        try {
            await api.patch(`/invoices/${id}/status`, { status });
            setFeedback({ message: `Invoice marked as ${status}`, tone: 'success' });
            void fetchInvoices();
        } catch {
            setFeedback({ message: 'Failed to update status', tone: 'error' });
        }
    };

    const deleteInvoice = async (id: string) => {
        try {
            await api.delete(`/invoices/${id}`);
            setFeedback({ message: 'Invoice deleted', tone: 'success' });
            void fetchInvoices();
        } catch {
            setFeedback({ message: 'Only draft invoices can be deleted', tone: 'error' });
        }
    };

    const addLineItem = () => {
        setForm(prev => ({ ...prev, line_items: [...prev.line_items, { description: '', hours: '', rate: '' }] }));
    };

    const updateLineItem = (idx: number, field: string, value: string) => {
        setForm(prev => {
            const items = [...prev.line_items];
            items[idx] = { ...items[idx], [field]: value };
            return { ...prev, line_items: items };
        });
    };

    const pillClass = 'px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all cursor-pointer hover:border-slate-300 dark:hover:border-slate-600';
    const inputClass = 'w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none';

    const totalStats = {
        total: invoices.reduce((s, i) => s + i.total, 0),
        paid: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0),
        outstanding: invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.total, 0),
    };

    return (
        <div className="flex-1 w-full overflow-y-auto bg-slate-50 dark:bg-slate-900 p-4 md:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                {feedback && (
                    <div className={`p-3 rounded-lg text-sm font-medium ${feedback.tone === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {feedback.message}
                    </div>
                )}

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight" style={{ fontFamily: 'var(--font-family-display)' }}>Invoices</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Create, manage and track client invoices.</p>
                    </div>
                    <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all self-start">
                        <Plus size={16} /> New Invoice
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                        { label: 'Total Invoiced', value: totalStats.total, icon: <FileText size={18} /> },
                        { label: 'Paid', value: totalStats.paid, icon: <CheckCircle size={18} /> },
                        { label: 'Outstanding', value: totalStats.outstanding, icon: <DollarSign size={18} /> },
                    ].map(stat => (
                        <div key={stat.label} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
                            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">{stat.icon}{stat.label}</div>
                            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">${stat.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                    ))}
                </div>

                {/* Create form */}
                {showCreate && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm space-y-4">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Invoice</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input className={inputClass} placeholder="Client Name *" value={form.client_name} onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))} />
                            <select className={inputClass} value={form.project_id} onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))}>
                                <option value="">No project</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <input className={inputClass} type="number" step="0.01" placeholder="Tax Rate %" value={form.tax_rate} onChange={e => setForm(p => ({ ...p, tax_rate: e.target.value }))} />
                            <input className={inputClass} type="date" placeholder="Due Date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
                        </div>
                        <textarea className={inputClass} rows={2} placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                        <div className="space-y-2">
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Line Items</p>
                            {form.line_items.map((li, idx) => (
                                <div key={idx} className="grid grid-cols-3 gap-2">
                                    <input className={inputClass} placeholder="Description" value={li.description} onChange={e => updateLineItem(idx, 'description', e.target.value)} />
                                    <input className={inputClass} type="number" step="0.01" placeholder="Hours" value={li.hours} onChange={e => updateLineItem(idx, 'hours', e.target.value)} />
                                    <input className={inputClass} type="number" step="0.01" placeholder="Rate ($/hr)" value={li.rate} onChange={e => updateLineItem(idx, 'rate', e.target.value)} />
                                </div>
                            ))}
                            <button onClick={addLineItem} className="text-sm text-primary font-medium hover:underline">+ Add line item</button>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button onClick={handleCreate} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-all">Create</button>
                            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-all">Cancel</button>
                        </div>
                    </div>
                )}

                {/* Filter */}
                <div className="flex gap-2 items-center">
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={pillClass}>
                        <option value="all">All Statuses</option>
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="paid">Paid</option>
                    </select>
                </div>

                {/* Invoice list */}
                {loading ? (
                    <div className="text-center py-12 text-slate-500 dark:text-slate-400">Loading invoices...</div>
                ) : invoices.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 dark:text-slate-500">No invoices found. Create your first invoice above.</div>
                ) : (
                    <div className="space-y-3">
                        {invoices.map(inv => (
                            <div key={inv.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{inv.invoice_number}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[inv.status] || STATUS_STYLES.draft}`}>{inv.status}</span>
                                    </div>
                                    <p className="font-bold text-slate-900 dark:text-white mt-1">{inv.client_name}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{inv.project?.name || 'No project'} &middot; {inv.line_items.length} item{inv.line_items.length !== 1 ? 's' : ''} &middot; Due {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'N/A'}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xl font-black text-slate-900 dark:text-white">${inv.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    <div className="flex gap-1">
                                        {inv.status === 'draft' && (
                                            <>
                                                <button onClick={() => updateStatus(inv.id, 'sent')} title="Mark as Sent" className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 transition-colors"><Send size={16} /></button>
                                                <button onClick={() => deleteInvoice(inv.id)} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"><Trash2 size={16} /></button>
                                            </>
                                        )}
                                        {inv.status === 'sent' && (
                                            <button onClick={() => updateStatus(inv.id, 'paid')} title="Mark as Paid" className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 transition-colors"><CheckCircle size={16} /></button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Invoices;
