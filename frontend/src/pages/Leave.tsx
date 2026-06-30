import React, { useEffect, useState } from 'react';
import { CalendarDays, Plus, X, CheckCircle2, XCircle, Clock3, ChevronDown } from 'lucide-react';
import api, { getApiErrorMessage } from '../services/api';
import { hasAnyRole } from '../utils/session';
import { usePageMetadata } from '../hooks/usePageMetadata';

const LEAVE_TYPES = [
    { value: 'annual', label: 'Annual Leave' },
    { value: 'sick', label: 'Sick Leave' },
    { value: 'unpaid', label: 'Unpaid Leave' },
    { value: 'public_holiday', label: 'Public Holiday' },
    { value: 'other', label: 'Other' },
];

const STATUS_COLORS: Record<string, string> = {
    pending: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
    approved: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
    rejected: 'text-rose-600 bg-rose-50 dark:bg-rose-900/20',
};
const STATUS_ICONS: Record<string, React.ReactNode> = {
    pending: <Clock3 size={13} />,
    approved: <CheckCircle2 size={13} />,
    rejected: <XCircle size={13} />,
};

interface LeaveRequest {
    id: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    days: number;
    reason?: string | null;
    status: string;
    reviewer_note?: string | null;
    created_at: string;
    user?: { first_name: string; last_name: string; email: string };
    reviewer?: { first_name: string; last_name: string } | null;
}

const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

const Leave: React.FC = () => {
    usePageMetadata({
        title: 'Leave & PTO | Web Forx Time Tracker',
        description: 'Submit and manage leave requests, view team leave calendar, and track PTO balances.',
    });

    const isManager = hasAnyRole(['Admin', 'Manager']);
    const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
    const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeView, setActiveView] = useState<'mine' | 'team'>('mine');
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [reviewNote, setReviewNote] = useState('');

    // Form state
    const [leaveType, setLeaveType] = useState('annual');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [days, setDays] = useState('');
    const [reason, setReason] = useState('');

    const fetchMine = async () => {
        const res = await api.get<LeaveRequest[]>('/leave');
        setMyRequests(res.data);
    };
    const fetchAll = async () => {
        const res = await api.get<LeaveRequest[]>('/leave/all');
        setAllRequests(res.data);
    };

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                await fetchMine();
                if (isManager) await fetchAll();
            } finally {
                setLoading(false);
            }
        };
        void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-calculate days when dates change
    useEffect(() => {
        if (startDate && endDate) {
            const s = new Date(startDate);
            const e = new Date(endDate);
            if (e >= s) {
                let count = 0;
                const cur = new Date(s);
                while (cur <= e) {
                    const dow = cur.getDay();
                    if (dow !== 0 && dow !== 6) count++;
                    cur.setDate(cur.getDate() + 1);
                }
                setDays(String(count));
            }
        }
    }, [startDate, endDate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            await api.post('/leave', { leave_type: leaveType, start_date: startDate, end_date: endDate, days: parseFloat(days), reason });
            setShowForm(false);
            setLeaveType('annual'); setStartDate(''); setEndDate(''); setDays(''); setReason('');
            void fetchMine();
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to submit request'));
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = async (id: string) => {
        if (!window.confirm('Cancel this leave request?')) return;
        try {
            await api.delete(`/leave/${id}`);
            void fetchMine();
        } catch {
            alert('Failed to cancel request.');
        }
    };

    const handleReview = async (id: string, status: 'approved' | 'rejected') => {
        try {
            await api.patch(`/leave/${id}/review`, { status, reviewer_note: reviewNote });
            setReviewingId(null);
            setReviewNote('');
            void fetchAll();
            void fetchMine();
        } catch (err) {
            alert(getApiErrorMessage(err, 'Failed to review request'));
        }
    };

    const myPending = myRequests.filter(r => r.status === 'pending').length;
    const teamPending = allRequests.filter(r => r.status === 'pending').length;

    return (
        <div className="flex-1 flex w-full flex-col overflow-y-auto bg-slate-50 dark:bg-slate-950">
            <div className="max-w-5xl mx-auto w-full px-4 py-8 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600">
                            <CalendarDays size={22} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-900 dark:text-white">Leave & PTO</h1>
                            <p className="text-xs text-slate-500">Submit requests and track time off</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold shadow hover:bg-primary/90 transition-colors"
                    >
                        <Plus size={16} /> Request Leave
                    </button>
                </div>

                {/* Tabs */}
                {isManager && (
                    <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
                        {([['mine', 'My Requests', myPending], ['team', 'Team Requests', teamPending]] as const).map(([v, label, badge]) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setActiveView(v)}
                                className={`relative px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === v ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                {label}
                                {badge > 0 && <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 min-w-[18px]">{badge}</span>}
                            </button>
                        ))}
                    </div>
                )}

                {/* Request form modal */}
                {showForm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
                            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700">
                                <h2 className="font-black text-slate-900 dark:text-white">New Leave Request</h2>
                                <button type="button" onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
                            </div>
                            <form onSubmit={handleSubmit} className="p-5 space-y-4">
                                {error && <p className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 rounded-lg">{error}</p>}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Leave Type</label>
                                    <div className="relative">
                                        <select value={leaveType} onChange={e => setLeaveType(e.target.value)} className="w-full appearance-none rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm font-semibold pr-8 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                                            {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Start Date</label>
                                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">End Date</label>
                                        <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} required className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Working Days</label>
                                    <input type="number" min="0.5" step="0.5" value={days} onChange={e => setDays(e.target.value)} required placeholder="Auto-calculated (excl. weekends)" className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                                    <p className="text-[11px] text-slate-400 mt-1">Weekends are excluded automatically. Adjust for half-days.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Reason <span className="font-normal">(optional)</span></label>
                                    <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Brief description of your leave..." className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                                </div>
                                <div className="flex gap-3 pt-1">
                                    <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Cancel</button>
                                    <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60">
                                        {saving ? 'Submitting…' : 'Submit Request'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* My Requests */}
                {(!isManager || activeView === 'mine') && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                            <h3 className="font-bold text-slate-900 dark:text-white">My Leave Requests</h3>
                        </div>
                        {loading ? (
                            <p className="px-6 py-10 text-center text-slate-400 text-sm">Loading…</p>
                        ) : myRequests.length === 0 ? (
                            <div className="px-6 py-12 text-center">
                                <CalendarDays size={36} className="mx-auto mb-3 text-slate-200 dark:text-slate-700" />
                                <p className="text-slate-500 text-sm font-semibold">No leave requests yet</p>
                                <p className="text-slate-400 text-xs mt-1">Click "Request Leave" to submit your first request.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {myRequests.map(r => (
                                    <div key={r.id} className="px-6 py-4 flex items-start gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-bold text-slate-800 dark:text-white capitalize">{r.leave_type.replace('_', ' ')}</span>
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[r.status] ?? ''}`}>
                                                    {STATUS_ICONS[r.status]} {r.status}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-0.5">{fmt(r.start_date)} – {fmt(r.end_date)} · <strong>{Number(r.days)} day{Number(r.days) !== 1 ? 's' : ''}</strong></p>
                                            {r.reason && <p className="text-xs text-slate-400 mt-0.5 italic">"{r.reason}"</p>}
                                            {r.reviewer_note && (
                                                <p className="text-xs text-slate-500 mt-1 bg-slate-50 dark:bg-slate-900 rounded px-2 py-1">
                                                    <span className="font-bold">Reviewer note:</span> {r.reviewer_note}
                                                </p>
                                            )}
                                        </div>
                                        {r.status === 'pending' && (
                                            <button type="button" onClick={() => void handleCancel(r.id)} className="shrink-0 text-xs text-rose-500 hover:text-rose-700 font-bold px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Team Requests — Manager/Admin only */}
                {isManager && activeView === 'team' && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                            <h3 className="font-bold text-slate-900 dark:text-white">Team Leave Requests</h3>
                        </div>
                        {allRequests.length === 0 ? (
                            <p className="px-6 py-10 text-center text-slate-400 text-sm">No requests in the organisation yet.</p>
                        ) : (
                            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {allRequests.map(r => (
                                    <div key={r.id} className="px-6 py-4">
                                        <div className="flex items-start gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-bold text-slate-800 dark:text-white">{r.user?.first_name} {r.user?.last_name}</span>
                                                    <span className="text-xs text-slate-400">{r.user?.email}</span>
                                                    <span className="text-xs font-semibold capitalize text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full">{r.leave_type.replace('_', ' ')}</span>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[r.status] ?? ''}`}>
                                                        {STATUS_ICONS[r.status]} {r.status}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-0.5">{fmt(r.start_date)} – {fmt(r.end_date)} · <strong>{Number(r.days)} day{Number(r.days) !== 1 ? 's' : ''}</strong></p>
                                                {r.reason && <p className="text-xs text-slate-400 mt-0.5 italic">"{r.reason}"</p>}
                                            </div>
                                            {r.status === 'pending' && reviewingId !== r.id && (
                                                <button type="button" onClick={() => { setReviewingId(r.id); setReviewNote(''); }} className="shrink-0 text-xs font-bold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors">
                                                    Review
                                                </button>
                                            )}
                                        </div>
                                        {/* Inline review panel */}
                                        {r.status === 'pending' && reviewingId === r.id && (
                                            <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
                                                <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={2} placeholder="Optional note to the employee…" className="w-full rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={() => void handleReview(r.id, 'approved')} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors">Approve</button>
                                                    <button type="button" onClick={() => void handleReview(r.id, 'rejected')} className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors">Reject</button>
                                                    <button type="button" onClick={() => setReviewingId(null)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">Cancel</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Leave;
