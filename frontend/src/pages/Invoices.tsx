import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CheckCircle, DollarSign, FileText, Plus, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import api, { getApiErrorMessage } from '../services/api';
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
    const [creating, setCreating] = useState(false);
    const [autopilotCreating, setAutopilotCreating] = useState(false);
    const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [shareInvoiceId, setShareInvoiceId] = useState<string | null>(null);
    const [shareUrl, setShareUrl] = useState<string | null>(null);

    const [form, setForm] = useState({
        client_name: '',
        project_id: '',
        tax_rate: '0',
        notes: '',
        due_date: '',
        line_items: [{ description: '', hours: '', rate: '' }],
    });
    const [autopilotForm, setAutopilotForm] = useState({
        client_name: '',
        project_id: '',
        tax_rate: '0',
    });

    const fetchInvoices = useCallback(async () => {
        try {
            const params: Record<string, string> = {};
            if (statusFilter !== 'all') params.status = statusFilter;
            const res = await api.get<{ invoices: InvoiceSummary[] }>('/invoices', { params });
            setInvoices(res.data.invoices || []);
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, 'Failed to load invoices'), tone: 'error' });
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
        setCreating(true);
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
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, 'Failed to create invoice'), tone: 'error' });
        } finally {
            setCreating(false);
        }
    };

    const updateStatus = async (id: string, status: 'sent' | 'paid') => {
        setStatusUpdatingId(id);
        try {
            await api.patch(`/invoices/${id}/status`, { status });
            setFeedback({ message: `Invoice marked as ${status}`, tone: 'success' });
            void fetchInvoices();
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, 'Failed to update status'), tone: 'error' });
        } finally {
            setStatusUpdatingId(null);
        }
    };

    const deleteInvoice = async (id: string) => {
        setDeletingId(id);
        try {
            await api.delete(`/invoices/${id}`);
            setFeedback({ message: 'Invoice deleted', tone: 'success' });
            void fetchInvoices();
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, 'Only draft invoices can be deleted'), tone: 'error' });
        } finally {
            setDeletingId(null);
        }
    };

    const handleAutopilotCreate = async () => {
        setAutopilotCreating(true);
        try {
            const response = await api.post<{ message?: string; invoice?: InvoiceSummary }>('/invoices/autopilot', {
                client_name: autopilotForm.client_name.trim() || undefined,
                project_id: autopilotForm.project_id || undefined,
                tax_rate: parseFloat(autopilotForm.tax_rate) || 0,
            });
            setFeedback({
                message: response.data.message || 'Draft invoice created from approved billable work',
                tone: 'success',
            });
            setAutopilotForm({ client_name: '', project_id: '', tax_rate: '0' });
            void fetchInvoices();
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, 'Failed to create billing autopilot invoice'), tone: 'error' });
        } finally {
            setAutopilotCreating(false);
        }
    };

    const createShareLink = async (invoiceId: string) => {
        setShareInvoiceId(invoiceId);
        try {
            const response = await api.post<{ url: string }>('/reports/share', {
                type: 'invoice-evidence',
                id: invoiceId,
            });
            setShareUrl(response.data.url);
            setFeedback({ message: 'Invoice evidence share link generated', tone: 'success' });
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, 'Failed to generate invoice evidence link'), tone: 'error' });
        } finally {
            setShareInvoiceId(null);
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
                    <button type="button" onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all self-start">
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
                            <div className="flex items-start gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
                                <span className="mt-0.5 shrink-0">{stat.icon}</span>
                                <span className="leading-tight break-words">{stat.label}</span>
                            </div>
                            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">${stat.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                    ))}
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                        <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-primary/10 p-3 text-primary">
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Client Billing Autopilot</p>
                                <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">Create a draft from approved billable time</h2>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                    Convert approved, uninvoiced time into a clean invoice draft without rebuilding line items manually.
                                </p>
                            </div>
                        </div>
                        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div>
                                <label htmlFor="autopilot-client-name" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Client Name Override</label>
                                <input
                                    id="autopilot-client-name"
                                    className={`${inputClass} mt-1`}
                                    placeholder="Optional client label"
                                    value={autopilotForm.client_name}
                                    onChange={(event) => setAutopilotForm((previous) => ({ ...previous, client_name: event.target.value }))}
                                />
                            </div>
                            <div>
                                <label htmlFor="autopilot-project-id" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Scope to Project</label>
                                <select
                                    id="autopilot-project-id"
                                    className={`${inputClass} mt-1`}
                                    value={autopilotForm.project_id}
                                    onChange={(event) => setAutopilotForm((previous) => ({ ...previous, project_id: event.target.value }))}
                                >
                                    <option value="">All approved billable work</option>
                                    {projects.map((project) => (
                                        <option key={project.id} value={project.id}>{project.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="autopilot-tax-rate" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tax Rate (%)</label>
                                <input
                                    id="autopilot-tax-rate"
                                    type="number"
                                    step="0.01"
                                    className={`${inputClass} mt-1`}
                                    value={autopilotForm.tax_rate}
                                    onChange={(event) => setAutopilotForm((previous) => ({ ...previous, tax_rate: event.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="mt-5 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={handleAutopilotCreate}
                                disabled={autopilotCreating}
                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                <Sparkles size={16} />
                                {autopilotCreating ? 'Generating draft...' : 'Run billing autopilot'}
                            </button>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Uses approved billable entries that have not been invoiced yet.
                            </p>
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                        <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-slate-100 dark:bg-slate-700 p-3 text-slate-700 dark:text-slate-200">
                                <ShieldCheck size={20} />
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">External Trust Layer</p>
                                <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">Invoice evidence share links</h2>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                    Generate client-ready proof for approved line items, timing, and project-linked invoice evidence.
                                </p>
                            </div>
                        </div>
                        {shareUrl ? (
                            <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Latest Share Link</p>
                                <p className="mt-2 break-all text-sm text-slate-700 dark:text-slate-300">{shareUrl}</p>
                                <button
                                    type="button"
                                    onClick={() => void navigator.clipboard.writeText(shareUrl)}
                                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white"
                                >
                                    <BadgeCheck size={16} />
                                    Copy link
                                </button>
                            </div>
                        ) : (
                            <div className="mt-5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
                                Generate a share link from any invoice row below to expose clean supporting evidence to clients.
                            </div>
                        )}
                    </section>
                </div>

                {/* Create form */}
                {showCreate && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm space-y-4">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Invoice</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="invoice-client-name" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Client Name</label>
                                <input
                                    id="invoice-client-name"
                                    name="clientName"
                                    className={`${inputClass} mt-1`}
                                    placeholder="Client Name *"
                                    value={form.client_name}
                                    onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label htmlFor="invoice-project" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Project</label>
                                <select
                                    id="invoice-project"
                                    name="projectId"
                                    className={`${inputClass} mt-1`}
                                    value={form.project_id}
                                    onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))}
                                >
                                    <option value="">No project</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tax Rate (%)</label>
                                <input
                                    id="invoice-tax-rate"
                                    name="taxRate"
                                    className={`${inputClass} mt-1`}
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={form.tax_rate}
                                    onChange={e => setForm(p => ({ ...p, tax_rate: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label htmlFor="invoice-due-date" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Due Date</label>
                                <input
                                    id="invoice-due-date"
                                    name="dueDate"
                                    className={`${inputClass} mt-1`}
                                    type="date"
                                    value={form.due_date}
                                    onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div>
                            <label htmlFor="invoice-notes" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Notes</label>
                            <textarea
                                id="invoice-notes"
                                name="notes"
                                className={`${inputClass} mt-1`}
                                rows={2}
                                placeholder="Notes (optional)"
                                value={form.notes}
                                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Line Items</p>
                            {form.line_items.map((li, idx) => (
                                <div key={idx} className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label htmlFor={`line-item-description-${idx}`} className="sr-only">Line item description</label>
                                        <input
                                            id={`line-item-description-${idx}`}
                                            name={`lineItems.${idx}.description`}
                                            className={inputClass}
                                            placeholder="Description"
                                            value={li.description}
                                            onChange={e => updateLineItem(idx, 'description', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor={`line-item-hours-${idx}`} className="sr-only">Line item hours</label>
                                        <input
                                            id={`line-item-hours-${idx}`}
                                            name={`lineItems.${idx}.hours`}
                                            className={inputClass}
                                            type="number"
                                            step="0.01"
                                            placeholder="Hours"
                                            value={li.hours}
                                            onChange={e => updateLineItem(idx, 'hours', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor={`line-item-rate-${idx}`} className="sr-only">Line item rate</label>
                                        <input
                                            id={`line-item-rate-${idx}`}
                                            name={`lineItems.${idx}.rate`}
                                            className={inputClass}
                                            type="number"
                                            step="0.01"
                                            placeholder="Rate ($/hr)"
                                            value={li.rate}
                                            onChange={e => updateLineItem(idx, 'rate', e.target.value)}
                                        />
                                    </div>
                                </div>
                            ))}
                            <button type="button" onClick={addLineItem} className="text-sm text-primary font-medium hover:underline">+ Add line item</button>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button type="button" onClick={handleCreate} disabled={creating} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-70 disabled:cursor-not-allowed">{creating ? 'Creating...' : 'Create'}</button>
                            <button type="button" onClick={() => setShowCreate(false)} disabled={creating} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-all disabled:opacity-70">Cancel</button>
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
                                                <button
                                                    type="button"
                                                    onClick={() => createShareLink(inv.id)}
                                                    disabled={shareInvoiceId === inv.id}
                                                    title="Create invoice evidence link"
                                                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50"
                                                >
                                                    <ShieldCheck size={16} />
                                                </button>
                                                <button type="button" onClick={() => updateStatus(inv.id, 'sent')} disabled={statusUpdatingId === inv.id} title="Mark as Sent" className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 transition-colors disabled:opacity-50"><Send size={16} /></button>
                                                <button type="button" onClick={() => deleteInvoice(inv.id)} disabled={deletingId === inv.id} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors disabled:opacity-50"><Trash2 size={16} /></button>
                                            </>
                                        )}
                                        {inv.status === 'sent' && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => createShareLink(inv.id)}
                                                    disabled={shareInvoiceId === inv.id}
                                                    title="Create invoice evidence link"
                                                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50"
                                                >
                                                    <ShieldCheck size={16} />
                                                </button>
                                                <button type="button" onClick={() => updateStatus(inv.id, 'paid')} disabled={statusUpdatingId === inv.id} title="Mark as Paid" className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 transition-colors disabled:opacity-50"><CheckCircle size={16} /></button>
                                            </>
                                        )}
                                        {inv.status === 'paid' && (
                                            <button
                                                type="button"
                                                onClick={() => createShareLink(inv.id)}
                                                disabled={shareInvoiceId === inv.id}
                                                title="Create invoice evidence link"
                                                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50"
                                            >
                                                <ShieldCheck size={16} />
                                            </button>
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
