import React, { useCallback, useEffect, useState } from 'react';
import Uppy from '@uppy/core';
import AwsS3 from '@uppy/aws-s3';
import { Check, ExternalLink, Receipt, Plus, Trash2, X } from 'lucide-react';
import api, { getApiErrorMessage } from '../services/api';
import type { ExpenseSummary, ProjectSummary } from '../types/api';
import { getStoredRole } from '../utils/session';
import { useFeedback } from '../hooks/useFeedback';

const CATEGORIES = ['travel', 'meals', 'supplies', 'software', 'equipment', 'other'];
const emptyForm = { description: '', category: 'travel', amount: '', currency: 'USD', incurred_on: new Date().toISOString().slice(0, 10), project_id: '', is_billable: false };

interface UploadedReceipt {
    object_key: string;
    file_name: string;
    content_type: string;
    size_bytes: number;
}

const Expenses: React.FC = () => {
    const { confirm } = useFeedback();
    const role = getStoredRole();
    const canReview = role === 'Manager' || role === 'Admin';
    const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [receiptConfigured, setReceiptConfigured] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [receipt, setReceipt] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

    const loadExpenses = useCallback(async () => {
        try {
            const response = await api.get<{ expenses: ExpenseSummary[]; receipt_upload_configured: boolean }>('/expenses', { params: statusFilter === 'all' ? {} : { status: statusFilter } });
            setExpenses(response.data.expenses || []);
            setReceiptConfigured(response.data.receipt_upload_configured);
        } catch (error) {
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to load expenses') });
        }
    }, [statusFilter]);

    useEffect(() => { void loadExpenses(); }, [loadExpenses]);
    useEffect(() => {
        void api.get<ProjectSummary[]>('/projects').then((response) => setProjects((response.data || []).filter((project) => project.is_active !== false))).catch(() => setProjects([]));
    }, []);

    const uploadReceipt = async (file: File): Promise<UploadedReceipt> => {
        const signed = await api.post<{ upload_url: string; object_key: string; method: 'PUT'; headers: Record<string, string> }>('/expenses/receipts/sign', {
            file_name: file.name,
            content_type: file.type,
            size_bytes: file.size,
        });
        const uppy = new Uppy({ restrictions: { maxNumberOfFiles: 1, maxFileSize: 10 * 1024 * 1024, allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] } });
        uppy.use(AwsS3, {
            shouldUseMultipart: false,
            getUploadParameters: async () => ({ method: signed.data.method, url: signed.data.upload_url, fields: {}, headers: signed.data.headers }),
        });
        uppy.addFile({ name: file.name, type: file.type, data: file });
        const result = await uppy.upload();
        uppy.destroy();
        if (!result?.successful?.length) throw new Error('Receipt upload failed');
        return { object_key: signed.data.object_key, file_name: file.name, content_type: file.type, size_bytes: file.size };
    };

    const submitExpense = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            const attachments = receipt ? [await uploadReceipt(receipt)] : [];
            await api.post('/expenses', { ...form, amount: Number(form.amount), project_id: form.project_id || null, incurred_on: new Date(`${form.incurred_on}T12:00:00`).toISOString(), attachments });
            setForm(emptyForm);
            setReceipt(null);
            setShowForm(false);
            setFeedback({ tone: 'success', message: 'Expense submitted for review.' });
            await loadExpenses();
        } catch (error) {
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to submit expense') });
        } finally {
            setSaving(false);
        }
    };

    const review = async (id: string, status: 'approved' | 'rejected') => {
        try {
            await api.post(`/expenses/${id}/review`, { status });
            await loadExpenses();
        } catch (error) {
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to review expense') });
        }
    };

    const remove = async (id: string) => {
        if (!await confirm({ message: 'Delete this expense?', destructive: true, confirmLabel: 'Delete expense' })) return;
        try { await api.delete(`/expenses/${id}`); await loadExpenses(); }
        catch (error) { setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to delete expense') }); }
    };

    const openReceipt = async (expenseId: string, attachmentId: string) => {
        try {
            const response = await api.get<{ url: string }>(`/expenses/${expenseId}/receipts/${attachmentId}/url`);
            window.open(response.data.url, '_blank', 'noopener,noreferrer');
        } catch (error) {
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to open receipt') });
        }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950 lg:p-8">
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div><div className="flex items-center gap-2"><Receipt className="text-primary" /><h1 className="text-3xl font-black text-slate-900 dark:text-white">Expenses</h1></div><p className="mt-1 text-sm text-slate-500">Submit expenses, attach receipts, and route billable costs into invoices.</p></div>
                    <button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white"><Plus size={16} /> Add expense</button>
                </div>

                {feedback && <div className={`rounded-xl px-4 py-3 text-sm font-medium ${feedback.tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{feedback.message}</div>}
                <div className="flex gap-2">{['all', 'pending', 'approved', 'rejected'].map((status) => <button key={status} type="button" onClick={() => setStatusFilter(status)} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${statusFilter === status ? 'bg-primary text-white' : 'bg-white text-slate-600'}`}>{status}</button>)}</div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr><th className="px-5 py-3">Expense</th>{canReview && <th className="px-5 py-3">Submitted by</th>}<th className="px-5 py-3">Project</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">{expenses.map((expense) => <tr key={expense.id}>
                            <td className="px-5 py-4"><p className="font-semibold text-slate-900 dark:text-white">{expense.description}</p><p className="text-xs capitalize text-slate-500">{expense.category} · {new Date(expense.incurred_on).toLocaleDateString()} · {expense.is_billable ? 'Billable' : 'Non-billable'}</p></td>
                            {canReview && <td className="px-5 py-4 text-sm text-slate-600">{expense.owner.first_name} {expense.owner.last_name}</td>}
                            <td className="px-5 py-4 text-sm text-slate-600">{expense.project?.name || 'Unassigned'}</td>
                            <td className="px-5 py-4 font-black text-slate-900 dark:text-white">{expense.currency} {Number(expense.amount).toFixed(2)}</td>
                            <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${expense.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : expense.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{expense.status}</span>{expense.invoice_line_item && <span className="ml-2 text-[10px] font-bold uppercase text-indigo-600">Invoiced</span>}</td>
                            <td className="px-5 py-4"><div className="flex justify-end gap-1">{expense.attachments.map((attachment) => <button key={attachment.id} type="button" title={attachment.file_name} onClick={() => void openReceipt(expense.id, attachment.id)} className="rounded p-2 text-slate-500 hover:bg-slate-100"><ExternalLink size={15} /></button>)}{canReview && expense.status === 'pending' && <><button type="button" title="Approve" onClick={() => void review(expense.id, 'approved')} className="rounded p-2 text-emerald-600 hover:bg-emerald-50"><Check size={16} /></button><button type="button" title="Reject" onClick={() => void review(expense.id, 'rejected')} className="rounded p-2 text-rose-600 hover:bg-rose-50"><X size={16} /></button></>} {!expense.invoice_line_item && (expense.status === 'pending' || canReview) && <button type="button" title="Delete" onClick={() => void remove(expense.id)} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 size={15} /></button>}</div></td>
                        </tr>)}{expenses.length === 0 && <tr><td colSpan={canReview ? 6 : 5} className="px-5 py-12 text-center text-sm text-slate-500">No expenses found.</td></tr>}</tbody></table></div>
                </div>
            </div>

            {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={submitExpense} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800"><h2 className="text-xl font-black dark:text-white">Add expense</h2>
                <input required value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                <div className="grid gap-3 sm:grid-cols-2"><select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2">{CATEGORIES.map((category) => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}</select><select value={form.project_id} onChange={(event) => setForm((current) => ({ ...current, project_id: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2"><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><input required min="0.01" step="0.01" type="number" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount" className="rounded-lg border border-slate-200 px-3 py-2" /><input required type="date" value={form.incurred_on} onChange={(event) => setForm((current) => ({ ...current, incurred_on: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2" /></div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.is_billable} onChange={(event) => setForm((current) => ({ ...current, is_billable: event.target.checked }))} /> Billable to client</label>
                <label className={`block rounded-xl border border-dashed p-4 text-sm ${receiptConfigured ? 'cursor-pointer border-slate-300 text-slate-600' : 'border-slate-200 text-slate-400'}`}>Receipt {receipt ? `— ${receipt.name}` : '(optional: JPG, PNG, WebP, PDF; max 10 MB)'}<input disabled={!receiptConfigured} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(event) => setReceipt(event.target.files?.[0] || null)} />{!receiptConfigured && <span className="mt-1 block text-xs">Receipt storage must be configured by an operator.</span>}</label>
                <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold">Cancel</button><button disabled={saving} type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Submitting…' : 'Submit expense'}</button></div>
            </form></div>}
        </div>
    );
};

export default Expenses;
