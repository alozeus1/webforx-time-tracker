import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../services/api';
import type { RoleOption, UserSummary } from '../types/api';
import { getStoredRole } from '../utils/session';

interface TeamHoursEntry { name: string; hours: number; }

interface TeamFormState {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    role: string;
    is_active: boolean;
}

const emptyForm: TeamFormState = {
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    role: 'Employee',
    is_active: true,
};

const Team: React.FC = () => {
    const [team, setTeam] = useState<UserSummary[]>([]);
    const [roles, setRoles] = useState<RoleOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
    const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
    const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
    const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
    const [form, setForm] = useState<TeamFormState>(emptyForm);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

    const [teamHours, setTeamHours] = useState<TeamHoursEntry[]>([]);

    const role = getStoredRole();
    const canManageTeam = role === 'Admin' || role === 'Manager';

    const loadTeam = useCallback(async () => {
        try {
            const res = await api.get<UserSummary[]>('/users');
            setTeam(res.data);
        } catch (error) {
            console.error('Failed to load team', error);
            setFeedback({ message: 'Failed to load team members', tone: 'error' });
        }
    }, []);

    const loadRoles = useCallback(async () => {
        if (!canManageTeam) {
            return;
        }

        try {
            const response = await api.get<{ roles: RoleOption[] }>('/users/roles');
            setRoles(response.data.roles || []);
        } catch (error) {
            console.error('Failed to load roles', error);
        }
    }, [canManageTeam]);

    const loadTeamHours = useCallback(async () => {
        if (!canManageTeam) return;
        try {
            const res = await api.get<{ metrics: { totalHours: string }; userBreakdown: { name: string; totalHours: string }[] }>('/reports/dashboard?range=7d');
            setTeamHours(
                (res.data.userBreakdown || []).map(u => ({ name: u.name, hours: parseFloat(u.totalHours) || 0 }))
            );
        } catch {
            setTeamHours([]);
        }
    }, [canManageTeam]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            await Promise.all([loadTeam(), loadRoles(), loadTeamHours()]);
            setLoading(false);
        };

        void load();
    }, [loadRoles, loadTeam, loadTeamHours]);

    const activeCount = team.filter((user) => user.is_active).length;
    const adminsCount = team.filter((user) => user.role?.name === 'Admin').length;

    const openCreateModal = () => {
        setSelectedUser(null);
        setForm({
            ...emptyForm,
            role: roles.find((item) => item.name === 'Employee')?.name || roles[0]?.name || 'Employee',
        });
        setModalMode('create');
        setMenuOpenFor(null);
        setFeedback(null);
    };

    const openEditModal = (user: UserSummary) => {
        setSelectedUser(user);
        setForm({
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            password: '',
            role: user.role?.name || 'Employee',
            is_active: user.is_active,
        });
        setModalMode('edit');
        setMenuOpenFor(null);
        setFeedback(null);
    };

    const closeModal = () => {
        setModalMode(null);
        setSelectedUser(null);
        setForm(emptyForm);
    };

    const handleSaveMember = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canManageTeam) {
            return;
        }

        if (modalMode === 'create' && !form.password.trim()) {
            setFeedback({ message: 'Password is required when creating a team member', tone: 'error' });
            return;
        }

        setSaving(true);
        setFeedback(null);

        try {
            if (modalMode === 'create') {
                await api.post('/users', {
                    first_name: form.first_name.trim(),
                    last_name: form.last_name.trim(),
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                    role: form.role,
                });
                setFeedback({ message: 'Team member added successfully', tone: 'success' });
            }

            if (modalMode === 'edit' && selectedUser) {
                await api.put(`/users/${selectedUser.id}`, {
                    first_name: form.first_name.trim(),
                    last_name: form.last_name.trim(),
                    email: form.email.trim().toLowerCase(),
                    role: form.role,
                    is_active: form.is_active,
                    password: form.password.trim() ? form.password : undefined,
                });
                setFeedback({ message: 'Team member updated successfully', tone: 'success' });
            }

            await loadTeam();
            closeModal();
        } catch (error) {
            console.error('Failed to save team member', error);
            const message =
                typeof (error as { response?: { data?: { message?: string } } })?.response?.data?.message === 'string'
                    ? (error as { response: { data: { message: string } } }).response.data.message
                    : 'Failed to save team member';
            setFeedback({ message, tone: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const toggleUserActive = async (user: UserSummary) => {
        if (!canManageTeam) {
            return;
        }

        setSaving(true);
        setFeedback(null);
        setMenuOpenFor(null);

        try {
            await api.put(`/users/${user.id}`, { is_active: !user.is_active });
            await loadTeam();
            setFeedback({
                message: `${user.first_name} ${user.last_name} is now ${!user.is_active ? 'active' : 'inactive'}`,
                tone: 'success',
            });
        } catch (error) {
            console.error('Failed to update team member status', error);
            setFeedback({ message: 'Failed to update team member status', tone: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteUser = async (user: UserSummary) => {
        if (!canManageTeam) return;
        if (!window.confirm(`Are you sure you want to remove ${user.first_name} ${user.last_name}? This will deactivate their account.`)) return;

        setSaving(true);
        setFeedback(null);
        setMenuOpenFor(null);

        try {
            await api.delete(`/users/${user.id}`);
            await loadTeam();
            setFeedback({ message: `${user.first_name} ${user.last_name} has been removed`, tone: 'success' });
        } catch (error) {
            console.error('Failed to delete team member', error);
            setFeedback({ message: 'Failed to remove team member', tone: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const activityFeed = useMemo(() => {
        return team
            .slice()
            .sort((a, b) => a.first_name.localeCompare(b.first_name))
            .slice(0, 6)
            .map((user) => ({
                id: user.id,
                icon: user.is_active ? 'check_circle' : 'pause_circle',
                iconClass: user.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400',
                text: `${user.first_name} ${user.last_name} is ${user.is_active ? 'active' : 'inactive'} as ${user.role?.name || 'Employee'}`,
            }));
    }, [team]);

    const filteredTeam = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return team.filter((user) => {
            const matchesQuery =
                !query
                || `${user.first_name} ${user.last_name}`.toLowerCase().includes(query)
                || user.email.toLowerCase().includes(query)
                || (user.role?.name || '').toLowerCase().includes(query);

            const matchesStatus =
                statusFilter === 'all'
                || (statusFilter === 'active' && user.is_active)
                || (statusFilter === 'inactive' && !user.is_active);

            return matchesQuery && matchesStatus;
        });
    }, [searchQuery, statusFilter, team]);

    const handleExportTeam = () => {
        const header = 'First Name,Last Name,Email,Role,Status\n';
        const rows = filteredTeam
            .map((user) => [user.first_name, user.last_name, user.email, user.role?.name || 'Employee', user.is_active ? 'Active' : 'Inactive'].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const csv = `${header}${rows}\n`;
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'team-directory.csv');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-background-dark w-full">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Team Management</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage members, roles, and status for your organization.</p>
                </div>
                {canManageTeam && (
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90"
                    >
                        <span className="material-symbols-outlined text-base">group_add</span>
                        Add Team Member
                    </button>
                )}
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-sm font-medium text-slate-500">Total Members</span>
                    <div className="text-3xl font-bold mt-3">{loading ? '...' : team.length}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-sm font-medium text-slate-500">Currently Active</span>
                    <div className="text-3xl font-bold mt-3">{loading ? '...' : activeCount}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-sm font-medium text-slate-500">Admin Accounts</span>
                    <div className="text-3xl font-bold mt-3">{loading ? '...' : adminsCount}</div>
                </div>
            </div>

            {/* Team Hours Overview */}
            {canManageTeam && teamHours.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 mb-8">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Team Hours This Week</h3>
                    <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={teamHours} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" unit="h" tick={{ fontSize: 11 }} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                                <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}h`, 'Hours']} />
                                <Bar dataKey="hours" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={18} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-visible">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <h3 className="text-lg font-bold">Team Directory</h3>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                placeholder="Filter members..."
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                className="w-44 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            />
                            <select
                                value={statusFilter}
                                onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}
                                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                                <option value="all">All</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                            <button
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                onClick={() => void loadTeam()}
                            >
                                Refresh
                            </button>
                            <button
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                onClick={handleExportTeam}
                            >
                                Export
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 font-semibold">Member</th>
                                    <th className="px-6 py-4 font-semibold">Role</th>
                                    <th className="px-6 py-4 font-semibold">Status</th>
                                    <th className="px-6 py-4 font-semibold"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {loading && <tr><td colSpan={4} className="px-6 py-4 text-center">Loading...</td></tr>}
                                {!loading && filteredTeam.map((user) => (
                                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-slate-200 bg-cover flex items-center justify-center text-slate-500 font-bold overflow-hidden" style={{ backgroundImage: `url('https://ui-avatars.com/api/?name=${user.first_name}+${user.last_name}&background=random')` }}></div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold">{user.first_name} {user.last_name}</span>
                                                    <span className="text-xs text-slate-500">{user.email}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm capitalize">{user.role?.name || 'Employee'}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                                                <span className="text-xs font-medium">{user.is_active ? 'Active' : 'Inactive'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right relative">
                                            <button
                                                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                                                onClick={() => setMenuOpenFor((prev) => prev === user.id ? null : user.id)}
                                            >
                                                <span className="material-symbols-outlined text-sm">more_vert</span>
                                            </button>

                                            {menuOpenFor === user.id && (
                                                <div className="absolute right-6 top-12 z-20 min-w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                                                    <button
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                                        onClick={() => openEditModal(user)}
                                                        disabled={!canManageTeam}
                                                    >
                                                        <span className="material-symbols-outlined text-base">edit</span>
                                                        Edit Member
                                                    </button>
                                                    <button
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                                        onClick={() => void toggleUserActive(user)}
                                                        disabled={!canManageTeam || saving}
                                                    >
                                                        <span className="material-symbols-outlined text-base">{user.is_active ? 'person_off' : 'person'}</span>
                                                        {user.is_active ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                    <button
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-50"
                                                        onClick={() => void handleDeleteUser(user)}
                                                        disabled={!canManageTeam || saving}
                                                    >
                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                        Remove User
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {!loading && filteredTeam.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-6 text-center text-sm text-slate-500">
                                            No team members match this filter.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                        <h3 className="text-lg font-bold">Team Activity</h3>
                        <p className="text-xs text-slate-500 mt-1">Latest status snapshots</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {activityFeed.length === 0 && (
                            <p className="text-sm text-slate-500">No activity yet.</p>
                        )}
                        {activityFeed.map((activity) => (
                            <div key={activity.id} className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                    <span className={`material-symbols-outlined text-sm ${activity.iconClass}`}>{activity.icon}</span>
                                </div>
                                <p className="text-sm text-slate-700 dark:text-slate-300">{activity.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {modalMode && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm p-4 flex items-center justify-center">
                    <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                                {modalMode === 'create' ? 'Add Team Member' : 'Edit Team Member'}
                            </h3>
                            <button
                                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                onClick={closeModal}
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form className="space-y-4" onSubmit={(event) => void handleSaveMember(event)}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">First Name</label>
                                    <input
                                        type="text"
                                        value={form.first_name}
                                        onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Last Name</label>
                                    <input
                                        type="text"
                                        value={form.last_name}
                                        onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Email</label>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                                        {modalMode === 'create' ? 'Temporary Password' : 'Reset Password (Optional)'}
                                    </label>
                                    <input
                                        type="password"
                                        value={form.password}
                                        onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                        required={modalMode === 'create'}
                                    />
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Role</label>
                                    <select
                                        value={form.role}
                                        onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    >
                                        {(roles.length > 0 ? roles : [{ id: 'fallback', name: 'Employee' }, { id: 'fallback-admin', name: 'Admin' }]).map((option) => (
                                            <option key={option.id} value={option.name}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {modalMode === 'edit' && (
                                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={form.is_active}
                                        onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                                    />
                                    Active account
                                </label>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                    onClick={closeModal}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {saving ? 'Saving...' : (modalMode === 'create' ? 'Add Member' : 'Save Changes')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Team;
