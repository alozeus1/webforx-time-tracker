import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import api, { getApiErrorMessage } from '../services/api';
import type { ManagerOperationsResponse, ProjectSummary, ScheduleEntrySummary, UserSummary } from '../types/api';
import { getStoredRole, getStoredUserProfile } from '../utils/session';
import { useFeedback } from '../hooks/useFeedback';

const COLORS: Record<ScheduleEntrySummary['entry_type'], string> = {
    shift: '#4f46e5',
    availability: '#059669',
    unavailable: '#e11d48',
};

const toLocalInput = (value: Date | string) => {
    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const initialForm = {
    id: '', title: '', user_id: '', project_id: '', entry_type: 'shift' as ScheduleEntrySummary['entry_type'],
    start_time: '', end_time: '', notes: '', color: '',
};

const Schedule: React.FC = () => {
    const { confirm } = useFeedback();
    const role = getStoredRole();
    const profile = getStoredUserProfile();
    const canManage = role === 'Manager' || role === 'Admin';
    const [entries, setEntries] = useState<ScheduleEntrySummary[]>([]);
    const [users, setUsers] = useState<UserSummary[]>([]);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [capacity, setCapacity] = useState<ManagerOperationsResponse['teamForecast']['members']>([]);
    const [range, setRange] = useState<{ start: string; end: string } | null>(null);
    const [userFilter, setUserFilter] = useState('');
    const [form, setForm] = useState({ ...initialForm, user_id: profile?.id || '' });
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

    const loadEntries = useCallback(async () => {
        if (!range) return;
        try {
            const response = await api.get<{ entries: ScheduleEntrySummary[] }>('/schedules', {
                params: { ...range, ...(userFilter ? { user_id: userFilter } : {}) },
            });
            setEntries(response.data.entries || []);
        } catch (error) {
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to load schedule') });
        }
    }, [range, userFilter]);

    useEffect(() => { void loadEntries(); }, [loadEntries]);

    useEffect(() => {
        const loadReferenceData = async () => {
            const projectResponse = await api.get<ProjectSummary[]>('/projects').catch(() => ({ data: [] as ProjectSummary[] }));
            setProjects((projectResponse.data || []).filter((project) => project.is_active !== false));
            if (!canManage) return;
            const [userResponse, operationsResponse] = await Promise.all([
                api.get<UserSummary[]>('/users').catch(() => ({ data: [] as UserSummary[] })),
                api.get<ManagerOperationsResponse>('/reports/operations').catch(() => ({ data: null })),
            ]);
            setUsers((userResponse.data || []).filter((user) => user.is_active));
            setCapacity(operationsResponse.data?.teamForecast.members || []);
        };
        void loadReferenceData();
    }, [canManage]);

    useEffect(() => {
        if (canManage && !form.user_id && users[0]) setForm((current) => ({ ...current, user_id: users[0].id }));
    }, [canManage, form.user_id, users]);

    const calendarEvents = useMemo(() => entries.map((entry) => ({
        id: entry.id,
        title: canManage ? `${entry.title} · ${entry.assignee.first_name} ${entry.assignee.last_name}` : entry.title,
        start: entry.start_time,
        end: entry.end_time,
        backgroundColor: entry.color || COLORS[entry.entry_type],
        borderColor: entry.color || COLORS[entry.entry_type],
    })), [canManage, entries]);

    const openCreate = (start = new Date(), end = new Date(Date.now() + 60 * 60 * 1000)) => {
        setForm({ ...initialForm, user_id: users[0]?.id || profile?.id || '', start_time: toLocalInput(start), end_time: toLocalInput(end) });
        setShowForm(true);
    };

    const openEdit = (id: string) => {
        const entry = entries.find((item) => item.id === id);
        if (!entry || !canManage) return;
        setForm({ id: entry.id, title: entry.title, user_id: entry.user_id, project_id: entry.project_id || '', entry_type: entry.entry_type, start_time: toLocalInput(entry.start_time), end_time: toLocalInput(entry.end_time), notes: entry.notes || '', color: entry.color || '' });
        setShowForm(true);
    };

    const saveEntry = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            const payload = { ...form, project_id: form.project_id || null, start_time: new Date(form.start_time).toISOString(), end_time: new Date(form.end_time).toISOString(), color: form.color || null };
            if (form.id) await api.put(`/schedules/${form.id}`, payload);
            else await api.post('/schedules', payload);
            setFeedback({ tone: 'success', message: form.id ? 'Schedule entry updated.' : 'Schedule entry created.' });
            setShowForm(false);
            await loadEntries();
        } catch (error) {
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to save schedule entry') });
        } finally {
            setSaving(false);
        }
    };

    const moveEntry = async (id: string, start: Date | null, end: Date | null, revert: () => void) => {
        if (!start || !end) { revert(); return; }
        try {
            await api.put(`/schedules/${id}`, { start_time: start.toISOString(), end_time: end.toISOString() });
            await loadEntries();
        } catch (error) {
            revert();
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to move schedule entry') });
        }
    };

    const deleteEntry = async () => {
        if (!form.id || !await confirm({ message: 'Delete this schedule entry?', destructive: true, confirmLabel: 'Delete entry' })) return;
        try {
            await api.delete(`/schedules/${form.id}`);
            setShowForm(false);
            await loadEntries();
        } catch (error) {
            setFeedback({ tone: 'error', message: getApiErrorMessage(error, 'Failed to delete schedule entry') });
        }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950 lg:p-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2"><CalendarDays className="text-primary" /><h1 className="text-3xl font-black text-slate-900 dark:text-white">Team Schedule</h1></div>
                        <p className="mt-1 text-sm text-slate-500">Plan shifts and availability without changing tracked-time records.</p>
                    </div>
                    {canManage && <button type="button" onClick={() => openCreate()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white"><Plus size={16} /> Add schedule entry</button>}
                </div>

                {feedback && <div className={`rounded-xl px-4 py-3 text-sm font-medium ${feedback.tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{feedback.message}</div>}

                {canManage && (
                    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Team member
                            <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-800">
                                <option value="">Entire team</option>
                                {users.map((user) => <option key={user.id} value={user.id}>{user.first_name} {user.last_name}</option>)}
                            </select>
                        </label>
                        <div className="flex gap-3 overflow-x-auto pb-1">
                            {capacity.slice(0, 8).map((member) => <div key={member.user_id} className="min-w-44 rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="truncate text-xs font-bold text-slate-700">{member.name}</p><p className={`mt-1 text-lg font-black ${member.overloadRisk ? 'text-rose-600' : 'text-emerald-600'}`}>{member.remainingCapacityHours}h</p><p className="text-[10px] uppercase text-slate-400">14-day capacity</p></div>)}
                        </div>
                    </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 lg:p-5">
                    <div className="mb-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-500"><span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-indigo-600" /> Shift</span><span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-emerald-600" /> Available</span><span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-rose-600" /> Unavailable</span></div>
                    <FullCalendar
                        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                        initialView="timeGridWeek"
                        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
                        events={calendarEvents}
                        selectable={canManage}
                        editable={canManage}
                        selectMirror
                        allDaySlot={false}
                        nowIndicator
                        height="auto"
                        datesSet={(info) => setRange((current) => current?.start === info.startStr && current?.end === info.endStr ? current : { start: info.startStr, end: info.endStr })}
                        select={(info) => openCreate(info.start, info.end)}
                        eventClick={(info) => openEdit(info.event.id)}
                        eventDrop={(info) => void moveEntry(info.event.id, info.event.start, info.event.end, info.revert)}
                        eventResize={(info) => void moveEntry(info.event.id, info.event.start, info.event.end, info.revert)}
                    />
                </div>
            </div>

            {showForm && canManage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <form onSubmit={saveEntry} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
                        <div className="flex items-center justify-between"><h2 className="text-xl font-black dark:text-white">{form.id ? 'Edit schedule entry' : 'New schedule entry'}</h2>{form.id && <button type="button" onClick={() => void deleteEntry()} className="text-rose-600" aria-label="Delete schedule entry"><Trash2 size={18} /></button>}</div>
                        <input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Shift or availability title" className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <select required value={form.user_id} onChange={(event) => setForm((current) => ({ ...current, user_id: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2"><option value="">Select member</option>{users.map((user) => <option key={user.id} value={user.id}>{user.first_name} {user.last_name}</option>)}</select>
                            <select value={form.entry_type} onChange={(event) => setForm((current) => ({ ...current, entry_type: event.target.value as ScheduleEntrySummary['entry_type'] }))} className="rounded-lg border border-slate-200 px-3 py-2"><option value="shift">Shift</option><option value="availability">Available</option><option value="unavailable">Unavailable</option></select>
                            <input required type="datetime-local" value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2" />
                            <input required type="datetime-local" value={form.end_time} onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2" />
                        </div>
                        <select value={form.project_id} onChange={(event) => setForm((current) => ({ ...current, project_id: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2"><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
                        <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes (optional)" className="w-full rounded-lg border border-slate-200 px-3 py-2" />
                        <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-bold">Cancel</button><button disabled={saving} type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button></div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default Schedule;
