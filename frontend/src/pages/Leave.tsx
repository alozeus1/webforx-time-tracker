import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, X, CheckCircle2, XCircle, Clock3, ChevronDown, ChevronUp, History, Download, Search } from 'lucide-react';
import api, { getApiErrorMessage } from '../services/api';
import { hasAnyRole } from '../utils/session';
import { usePageMetadata } from '../hooks/usePageMetadata';
import { useFeedback } from '../hooks/useFeedback';

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

// History status display config
const HISTORY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
    submitted:  { label: 'Submitted',      color: 'text-indigo-600',  dot: 'bg-indigo-500' },
    approved:   { label: 'Approved',       color: 'text-emerald-600', dot: 'bg-emerald-500' },
    rejected:   { label: 'Rejected',       color: 'text-rose-600',    dot: 'bg-rose-500' },
    cancelled:  { label: 'Cancelled',      color: 'text-slate-400',   dot: 'bg-slate-400' },
};

interface HistoryEntry {
    id: string;
    status: string;
    comment?: string | null;
    created_at: string;
    actor: { first_name: string; last_name: string };
}

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
    history?: HistoryEntry[];
}

const fmt = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

const fmtDateTime = (d: string) =>
    new Date(d).toLocaleString(undefined, {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

// Local calendar date as YYYY-MM-DD. Using local components (not toISOString,
// which is UTC) keeps "on leave now" and CSV dates consistent with what the
// page displays via toLocaleDateString — avoids off-by-one for non-UTC users.
const ymd = (d: string | Date): string => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// "Currently on leave" = an approved request whose date range includes today.
// Compared as YYYY-MM-DD strings so it is timezone-stable.
const isOnLeaveNow = (r: { status: string; start_date: string; end_date: string }): boolean => {
    if (r.status !== 'approved') return false;
    const today = ymd(new Date());
    return ymd(r.start_date) <= today && today <= ymd(r.end_date);
};

// ─── Status Timeline ─────────────────────────────────────────────────────────

const StatusTimeline: React.FC<{ request: LeaveRequest }> = ({ request }) => {
    const history = request.history ?? [];

    // Build timeline entries: history events + a "pending review" placeholder if still pending
    const entries: Array<{ status: string; actor?: string; ts?: string; comment?: string | null; isCurrent?: boolean }> = [
        ...history.map(h => ({
            status: h.status,
            actor: `${h.actor.first_name} ${h.actor.last_name}`,
            ts: h.created_at,
            comment: h.comment,
        })),
    ];

    // If still pending and no non-submitted history, add "Under Review" current step
    if (request.status === 'pending') {
        entries.push({ status: 'under_review', isCurrent: true });
    }

    if (entries.length === 0) return null;

    return (
        <div className="mt-3 space-y-0">
            {entries.map((e, i) => {
                const cfg = e.status === 'under_review'
                    ? { label: 'Under Review', color: 'text-amber-600', dot: 'bg-amber-400' }
                    : (HISTORY_CONFIG[e.status] ?? { label: e.status, color: 'text-slate-500', dot: 'bg-slate-400' });

                const isLast = i === entries.length - 1;

                return (
                    <div key={i} className="flex gap-3">
                        {/* Dot + line */}
                        <div className="flex flex-col items-center">
                            <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot} ${e.isCurrent ? 'animate-pulse' : ''}`} />
                            {!isLast && <span className="w-px flex-1 bg-slate-200 dark:bg-slate-700 my-1" />}
                        </div>
                        {/* Content */}
                        <div className={`pb-3 ${isLast ? '' : ''}`}>
                            <p className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</p>
                            {e.actor && e.ts && (
                                <p className="text-[11px] text-slate-400">
                                    {e.actor} · {fmtDateTime(e.ts)}
                                </p>
                            )}
                            {!e.actor && e.isCurrent && (
                                <p className="text-[11px] text-slate-400">Awaiting admin or manager review</p>
                            )}
                            {e.comment && (
                                <p className="text-[11px] text-slate-500 mt-0.5 italic">"{e.comment}"</p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ─── Main component ──────────────────────────────────────────────────────────

const Leave: React.FC = () => {
    const { toast, confirm } = useFeedback();
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
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Team-list (manager) filters
    const [teamStatus, setTeamStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
    const [teamType, setTeamType] = useState('all');
    const [onLeaveNow, setOnLeaveNow] = useState(false);
    const [teamSearch, setTeamSearch] = useState('');

    const filteredTeam = useMemo(() => {
        const q = teamSearch.trim().toLowerCase();
        return allRequests
            .filter((r) => teamStatus === 'all' || r.status === teamStatus)
            .filter((r) => teamType === 'all' || r.leave_type === teamType)
            .filter((r) => !onLeaveNow || isOnLeaveNow(r))
            .filter((r) => {
                if (!q) return true;
                const name = `${r.user?.first_name ?? ''} ${r.user?.last_name ?? ''}`.toLowerCase();
                return name.includes(q) || (r.user?.email ?? '').toLowerCase().includes(q);
            })
            .sort((a, b) => {
                const nameA = `${a.user?.first_name ?? ''} ${a.user?.last_name ?? ''}`.trim();
                const nameB = `${b.user?.first_name ?? ''} ${b.user?.last_name ?? ''}`.trim();
                return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
                    || new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
            });
    }, [allRequests, teamStatus, teamType, onLeaveNow, teamSearch]);

    const onLeaveNowCount = useMemo(() => allRequests.filter(isOnLeaveNow).length, [allRequests]);

    const exportTeamCsv = () => {
        const header = ['Name', 'Email', 'Leave Type', 'Start', 'End', 'Working Days', 'Status', 'On Leave Now', 'Reason', 'Reviewed By', 'Submitted'];
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [header.join(',')];
        filteredTeam.forEach((r) => {
            lines.push([
                `${r.user?.first_name ?? ''} ${r.user?.last_name ?? ''}`.trim(),
                r.user?.email ?? '',
                r.leave_type.replace('_', ' '),
                ymd(r.start_date),
                ymd(r.end_date),
                Number(r.days),
                r.status,
                isOnLeaveNow(r) ? 'Yes' : 'No',
                r.reason ?? '',
                r.reviewer ? `${r.reviewer.first_name} ${r.reviewer.last_name}` : '',
                ymd(r.created_at),
            ].map(esc).join(','));
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leave-list-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

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
        if (!await confirm({ message: 'Cancel this leave request?', destructive: true, confirmLabel: 'Cancel request' })) return;
        try {
            await api.delete(`/leave/${id}`);
            void fetchMine();
        } catch {
            toast('Failed to cancel request.', { tone: 'error' });
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
            toast(getApiErrorMessage(err, 'Failed to review request'), { tone: 'error' });
        }
    };

    const myPending = myRequests.filter(r => r.status === 'pending').length;
    const teamPending = allRequests.filter(r => r.status === 'pending').length;

    const toggleExpand = (id: string) => setExpandedId(prev => (prev === id ? null : id));

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
                                    <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="Brief description of your leave…" className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
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
                                {myRequests.map(r => {
                                    const isExpanded = expandedId === r.id;
                                    const hasHistory = (r.history?.length ?? 0) > 0;
                                    return (
                                        <div key={r.id} className="px-6 py-4">
                                            <div className="flex items-start gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-bold text-slate-800 dark:text-white capitalize">{r.leave_type.replace('_', ' ')}</span>
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[r.status] ?? ''}`}>
                                                            {STATUS_ICONS[r.status]} {r.status === 'pending' ? 'Under Review' : r.status}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-0.5">{fmt(r.start_date)} – {fmt(r.end_date)} · <strong>{Number(r.days)} day{Number(r.days) !== 1 ? 's' : ''}</strong></p>
                                                    {r.reason && <p className="text-xs text-slate-400 mt-0.5 italic">"{r.reason}"</p>}
                                                    {r.reviewer_note && r.status !== 'pending' && (
                                                        <p className="text-xs text-slate-500 mt-1 bg-slate-50 dark:bg-slate-900 rounded px-2 py-1">
                                                            <span className="font-bold">Reviewer note:</span> {r.reviewer_note}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {/* Timeline toggle */}
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExpand(r.id)}
                                                        title={isExpanded ? 'Hide timeline' : 'View timeline'}
                                                        className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-bold px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                                                    >
                                                        <History size={13} />
                                                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                    </button>
                                                    {r.status === 'pending' && (
                                                        <button type="button" onClick={() => void handleCancel(r.id)} className="text-xs text-rose-500 hover:text-rose-700 font-bold px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                                                            Cancel
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Expandable timeline */}
                                            {isExpanded && (
                                                <div className="mt-3 pl-1 border-l-2 border-slate-100 dark:border-slate-700 ml-1">
                                                    {hasHistory || r.status === 'pending' ? (
                                                        <StatusTimeline request={r} />
                                                    ) : (
                                                        <p className="text-[11px] text-slate-400 py-2 px-3">No timeline history available.</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Team Requests — Manager/Admin only */}
                {isManager && activeView === 'team' && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white">Team Leave Requests</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        <strong className="text-emerald-600">{onLeaveNowCount}</strong> currently on leave · {filteredTeam.length} shown
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={exportTeamCsv}
                                    disabled={filteredTeam.length === 0}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Download the currently filtered list as CSV"
                                >
                                    <Download size={15} /> Export CSV
                                </button>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className="relative">
                                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={teamSearch}
                                        onChange={e => setTeamSearch(e.target.value)}
                                        placeholder="Search name or email…"
                                        className="pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary w-56"
                                    />
                                </div>
                                <select value={teamStatus} onChange={e => setTeamStatus(e.target.value as typeof teamStatus)} className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30">
                                    <option value="all">Status: All</option>
                                    <option value="pending">Pending</option>
                                    <option value="approved">Approved</option>
                                    <option value="rejected">Rejected</option>
                                </select>
                                <select value={teamType} onChange={e => setTeamType(e.target.value)} className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30">
                                    <option value="all">Type: All</option>
                                    {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setOnLeaveNow(v => !v)}
                                    className={`px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${onLeaveNow ? 'bg-primary text-white border-primary' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                >
                                    On leave now
                                </button>
                            </div>
                        </div>
                        {allRequests.length === 0 ? (
                            <p className="px-6 py-10 text-center text-slate-400 text-sm">No requests in the organisation yet.</p>
                        ) : filteredTeam.length === 0 ? (
                            <p className="px-6 py-10 text-center text-slate-400 text-sm">No requests match the current filters.</p>
                        ) : (
                            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {filteredTeam.map(r => {
                                    const isExpanded = expandedId === r.id;
                                    return (
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
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {/* Timeline toggle */}
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExpand(r.id)}
                                                        title={isExpanded ? 'Hide timeline' : 'View timeline'}
                                                        className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-bold px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                                                    >
                                                        <History size={13} />
                                                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                    </button>
                                                    {r.status === 'pending' && reviewingId !== r.id && (
                                                        <button type="button" onClick={() => { setReviewingId(r.id); setReviewNote(''); }} className="text-xs font-bold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors">
                                                            Review
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Expandable timeline */}
                                            {isExpanded && (r.history?.length ?? 0) > 0 && (
                                                <div className="mt-3 pl-1 border-l-2 border-slate-100 dark:border-slate-700 ml-1">
                                                    <StatusTimeline request={r} />
                                                </div>
                                            )}

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
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Leave;
