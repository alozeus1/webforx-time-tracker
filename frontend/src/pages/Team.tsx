import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api, { getApiErrorMessage } from '../services/api';
import type { BulkUserImportResponse, ProjectSummary, RoleOption, UserSummary } from '../types/api';
import { getStoredRole, getStoredUserProfile } from '../utils/session';
import { parseUserImportCsv, type UserImportCsvRow } from '../utils/userImportCsv';
import AccessibleDialog from '../components/AccessibleDialog';

interface TeamHoursEntry { name: string; hours: number; }

const formatHoursText = (hours: number) => {
    if (hours <= 0) return '0.0h';
    if (hours < 0.1) return `${Math.max(1, Math.round(hours * 60))}m`;
    if (hours < 1) return `${hours.toFixed(2)}h`;
    return `${hours.toFixed(1)}h`;
};

interface TeamFormState {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    role: string;
    is_active: boolean;
}

type TeamFormErrors = Partial<Record<keyof TeamFormState, string>>;

interface ImportFormState {
    default_role: string;
    role_in_project: string;
    default_project_ids: string[];
    use_email_as_password: boolean;
    skip_existing: boolean;
}

const emptyForm: TeamFormState = {
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    role: 'Employee',
    is_active: true,
};

const buildImportFormDefaults = (roleName: string): ImportFormState => ({
    default_role: roleName,
    role_in_project: 'Team Member',
    default_project_ids: [],
    use_email_as_password: true,
    skip_existing: true,
});

const Team: React.FC = () => {
    const [team, setTeam] = useState<UserSummary[]>([]);
    const [roles, setRoles] = useState<RoleOption[]>([]);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
    const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
    const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
    const [form, setForm] = useState<TeamFormState>(emptyForm);
    const [formErrors, setFormErrors] = useState<TeamFormErrors>({});
    const [importForm, setImportForm] = useState<ImportFormState>(buildImportFormDefaults('Employee'));
    const [importRows, setImportRows] = useState<UserImportCsvRow[]>([]);
    const [importErrors, setImportErrors] = useState<string[]>([]);
    const [importFileName, setImportFileName] = useState('');
    const [lastImportResult, setLastImportResult] = useState<BulkUserImportResponse | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');

    const [teamHours, setTeamHours] = useState<TeamHoursEntry[]>([]);
    const [roleSavingFor, setRoleSavingFor] = useState<Set<string>>(new Set());

    const role = getStoredRole();
    const canManageTeam = role === 'Admin' || role === 'Manager';
    const isAdmin = role === 'Admin';
    const currentUserId = getStoredUserProfile()?.id ?? null;

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

    const loadProjects = useCallback(async () => {
        if (!canManageTeam) {
            return;
        }

        try {
            const response = await api.get<ProjectSummary[]>('/projects');
            setProjects((response.data || []).filter((project) => project.is_active !== false));
        } catch (error) {
            console.error('Failed to load projects', error);
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
            await Promise.all([loadTeam(), loadRoles()]);
            setLoading(false);
            void loadTeamHours();
        };

        void load();
    }, [loadRoles, loadTeam, loadTeamHours]);

    useEffect(() => {
        if (importModalOpen && canManageTeam && projects.length === 0) {
            void loadProjects();
        }
    }, [canManageTeam, importModalOpen, loadProjects, projects.length]);

    const activeCount = team.filter((user) => user.is_active).length;
    const inactiveCount = team.length - activeCount;
    const adminsCount = team.filter((user) => user.role?.name === 'Admin').length;
    const defaultEmployeeRole = roles.find((item) => item.name === 'Employee')?.name || roles[0]?.name || 'Employee';

    useEffect(() => {
        setImportForm((previous) => {
            if (previous.default_role) {
                return previous;
            }

            return {
                ...previous,
                default_role: defaultEmployeeRole,
            };
        });
    }, [defaultEmployeeRole]);

    const openCreateModal = () => {
        setSelectedUser(null);
        setForm({
            ...emptyForm,
            role: defaultEmployeeRole,
        });
        setImportModalOpen(false);
        setModalMode('create');
        setMenuOpenFor(null);
        setFeedback(null);
        setFormErrors({});
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
        setImportModalOpen(false);
        setModalMode('edit');
        setMenuOpenFor(null);
        setFeedback(null);
        setFormErrors({});
    };

    const closeModal = () => {
        setModalMode(null);
        setSelectedUser(null);
        setForm(emptyForm);
        setFormErrors({});
    };

    const openImportModal = () => {
        setModalMode(null);
        setSelectedUser(null);
        setImportRows([]);
        setImportErrors([]);
        setImportFileName('');
        setImportForm(buildImportFormDefaults(defaultEmployeeRole));
        setImportModalOpen(true);
        setMenuOpenFor(null);
        setFeedback(null);
    };

    const closeImportModal = () => {
        setImportModalOpen(false);
        setImportRows([]);
        setImportErrors([]);
        setImportFileName('');
    };

    const handleImportFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        if (!file.name.toLowerCase().endsWith('.csv')) {
            setImportRows([]);
            setImportErrors(['Only CSV files are supported right now. Please export your spreadsheet as CSV and upload again.']);
            setImportFileName(file.name);
            event.target.value = '';
            return;
        }

        try {
            const fileText = await file.text();
            const parsed = parseUserImportCsv(fileText);
            setImportRows(parsed.rows);
            setImportErrors(parsed.errors);
            setImportFileName(file.name);
        } catch (error) {
            console.error('Failed to parse import CSV', error);
            setImportRows([]);
            setImportErrors(['Unable to read this CSV file. Please verify the file and try again.']);
            setImportFileName(file.name);
        } finally {
            event.target.value = '';
        }
    };

    const toggleDefaultProject = (projectId: string) => {
        setImportForm((previous) => {
            const nextSet = new Set(previous.default_project_ids);
            if (nextSet.has(projectId)) {
                nextSet.delete(projectId);
            } else {
                nextSet.add(projectId);
            }

            return {
                ...previous,
                default_project_ids: Array.from(nextSet),
            };
        });
    };

    const handleImportTemplateDownload = () => {
        const templateRows = [
            'email,first_name,last_name,user_type,projects',
            'maya.okafor@webforxtech.com,Maya,Okafor,manager,"Platform Engineering"',
            'chris.adewale@webforxtech.com,Chris,Adewale,employee,"EDUSUC;Web Forx Technology"',
            'lea.khan@webforxtech.com,Lea,Khan,intern,"LAFABAH"',
        ];

        const csv = `${templateRows.join('\n')}\n`;
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'team-import-template.csv');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const handleImportUsers = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canManageTeam) {
            return;
        }

        if (importRows.length === 0) {
            setFeedback({ message: 'Upload a CSV with valid user rows before importing.', tone: 'error' });
            return;
        }

        setImporting(true);
        setFeedback(null);

        try {
            const response = await api.post<BulkUserImportResponse>('/users/import', {
                users: importRows,
                options: {
                    default_role: importForm.default_role,
                    role_in_project: importForm.role_in_project.trim() || 'Team Member',
                    default_project_ids: importForm.default_project_ids,
                    use_email_as_password: importForm.use_email_as_password,
                    skip_existing: importForm.skip_existing,
                },
            });

            const result = response.data;
            setLastImportResult(result);
            setFeedback({
                message: `Import complete: ${result.summary.created} created, ${result.summary.skipped} skipped, ${result.summary.failed} failed.`,
                tone: result.summary.failed > 0 ? 'error' : 'success',
            });

            await Promise.all([loadTeam(), loadTeamHours()]);
            closeImportModal();
        } catch (error) {
            console.error('Failed to import users', error);
            const message =
                typeof (error as { response?: { data?: { message?: string } } })?.response?.data?.message === 'string'
                    ? (error as { response: { data: { message: string } } }).response.data.message
                    : 'Failed to import users';
            setFeedback({ message, tone: 'error' });
        } finally {
            setImporting(false);
        }
    };

    const handleSaveMember = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canManageTeam) {
            return;
        }

        const nextErrors: TeamFormErrors = {};
        if (!form.first_name.trim()) nextErrors.first_name = 'First name is required.';
        if (!form.last_name.trim()) nextErrors.last_name = 'Last name is required.';
        if (!form.email.trim()) nextErrors.email = 'Email is required.';
        if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
            nextErrors.email = 'Enter a valid email address.';
        }
        if (modalMode === 'create' && !form.password.trim()) {
            nextErrors.password = 'Temporary password is required when creating a team member.';
        }
        if (!form.role.trim()) {
            nextErrors.role = 'Role is required.';
        }

        if (Object.keys(nextErrors).length > 0) {
            setFormErrors(nextErrors);
            setFeedback({ message: 'Please fix the highlighted fields before saving.', tone: 'error' });
            return;
        }

        setSaving(true);
        setFeedback(null);
        setFormErrors({});

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
            const message = getApiErrorMessage(error, 'Failed to save team member');
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
        if (!window.confirm(`Are you sure you want to deactivate ${user.first_name} ${user.last_name}? This will hide them from the active team roster.`)) return;

        setSaving(true);
        setFeedback(null);
        setMenuOpenFor(null);

        try {
            await api.delete(`/users/${user.id}`);
            setTeam((previous) => previous.map((member) => (
                member.id === user.id
                    ? { ...member, is_active: false }
                    : member
            )));
            setStatusFilter('active');
            setFeedback({ message: `${user.first_name} ${user.last_name} has been deactivated and removed from the active roster`, tone: 'success' });
        } catch (error) {
            console.error('Failed to delete team member', error);
            setFeedback({ message: 'Failed to remove team member', tone: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleInlineRoleChange = async (user: UserSummary, newRole: string) => {
        if (!isAdmin || user.id === currentUserId) return;

        setRoleSavingFor((prev) => new Set(prev).add(user.id));
        setFeedback(null);

        try {
            await api.put(`/users/${user.id}`, { role: newRole });
            setTeam((prev) =>
                prev.map((member) =>
                    member.id === user.id
                        ? { ...member, role: { ...member.role, name: newRole } }
                        : member,
                ),
            );
            setFeedback({ message: `${user.first_name} ${user.last_name}'s role changed to ${newRole}`, tone: 'success' });
        } catch (error) {
            setFeedback({ message: getApiErrorMessage(error, 'Failed to update role'), tone: 'error' });
        } finally {
            setRoleSavingFor((prev) => {
                const next = new Set(prev);
                next.delete(user.id);
                return next;
            });
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
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={openImportModal}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <span className="material-symbols-outlined text-base">upload_file</span>
                            Import CSV
                        </button>
                        <button
                            type="button"
                            onClick={openCreateModal}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90"
                        >
                            <span className="material-symbols-outlined text-base">group_add</span>
                            Add Team Member
                        </button>
                    </div>
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

            {lastImportResult && (
                <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Last Import Summary</h3>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Total rows: {lastImportResult.summary.total}
                        </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
                            <p className="font-semibold">Created</p>
                            <p className="text-base font-bold">{lastImportResult.summary.created}</p>
                        </div>
                        <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                            <p className="font-semibold">Skipped</p>
                            <p className="text-base font-bold">{lastImportResult.summary.skipped}</p>
                        </div>
                        <div className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">
                            <p className="font-semibold">Failed</p>
                            <p className="text-base font-bold">{lastImportResult.summary.failed}</p>
                        </div>
                        <div className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            <p className="font-semibold">Team Assignments</p>
                            <p className="text-base font-bold">
                                {lastImportResult.created.reduce((count, entry) => count + entry.assigned_projects, 0)}
                            </p>
                        </div>
                    </div>
                    {(lastImportResult.failed.length > 0 || lastImportResult.skipped.length > 0) && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {lastImportResult.failed.slice(0, 3).map((entry, index) => (
                                <p key={`failed-${entry.email}-${index}`}>Failed: {entry.email} - {entry.reason}</p>
                            ))}
                            {lastImportResult.skipped.slice(0, 3).map((entry, index) => (
                                <p key={`skipped-${entry.email}-${index}`}>Skipped: {entry.email} - {entry.reason}</p>
                            ))}
                            {(lastImportResult.failed.length > 3 || lastImportResult.skipped.length > 3) && (
                                <p className="mt-1 text-slate-500 dark:text-slate-400">
                                    Additional rows were skipped or failed. Review the CSV and retry those entries.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-sm font-medium text-slate-500">Active Members</span>
                    <div className="text-3xl font-bold mt-3">{loading ? '...' : activeCount}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-sm font-medium text-slate-500">Deactivated Accounts</span>
                    <div className="text-3xl font-bold mt-3">{loading ? '...' : inactiveCount}</div>
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
                    <ResponsiveContainer width="100%" height={208} minWidth={280}>
                            <BarChart data={teamHours} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" unit="h" tick={{ fontSize: 11 }} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                                <Tooltip formatter={(value) => [formatHoursText(Number(value)), 'Hours']} />
                                <Bar dataKey="hours" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={18} />
                            </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-visible">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold">Team Directory</h3>
                            <p className="mt-1 text-xs text-slate-500">
                                Deactivated accounts are hidden from the default roster. Use the filter to review or restore them.
                            </p>
                        </div>
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
                                <option value="all">All Accounts</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                            <button
                                type="button"
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                onClick={() => void loadTeam()}
                            >
                                Refresh
                            </button>
                            <button
                                type="button"
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                onClick={handleExportTeam}
                            >
                                Export
                            </button>
                        </div>
                    </div>
                    <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                        {loading && (
                            <div className="px-4 py-6 text-center text-sm text-slate-500">Loading...</div>
                        )}
                        {!loading && filteredTeam.map((user) => {
                            const isSelf = user.id === currentUserId;
                            const isRoleSaving = roleSavingFor.has(user.id);
                            return (
                            <article key={`mobile-${user.id}`} className="space-y-3 px-4 py-4">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="h-10 w-10 overflow-hidden rounded-full bg-slate-200 bg-cover text-slate-500"
                                        style={{ backgroundImage: `url('https://ui-avatars.com/api/?name=${user.first_name}+${user.last_name}&background=random')` }}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                            {user.first_name} {user.last_name}
                                        </p>
                                        <p className="truncate text-xs text-slate-500">{user.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    {isAdmin && !isSelf ? (
                                        <div className="flex items-center gap-1.5">
                                            <select
                                                value={user.role?.name || 'Employee'}
                                                onChange={(e) => void handleInlineRoleChange(user, e.target.value)}
                                                disabled={isRoleSaving}
                                                aria-label={`Change role for ${user.first_name} ${user.last_name}`}
                                                className="rounded-md border border-slate-200 bg-slate-50 py-1 pl-2 pr-6 text-xs font-semibold text-slate-600 outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                            >
                                                {(roles.length > 0
                                                    ? roles.map((r) => r.name)
                                                    : ['Admin', 'Employee', 'Intern', 'Manager']
                                                ).map((r) => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                            {isRoleSaving && (
                                                <span className="material-symbols-outlined animate-spin text-sm text-primary">progress_activity</span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                            {user.role?.name || 'Employee'}
                                        </span>
                                    )}
                                    <span className={`inline-flex items-center gap-2 font-medium ${user.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                        <span className={`h-2 w-2 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                                        {user.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                                {canManageTeam && (
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                            onClick={() => openEditModal(user)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                            onClick={() => void toggleUserActive(user)}
                                            disabled={saving}
                                        >
                                            {user.is_active ? 'Deactivate' : 'Activate'}
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-lg border border-rose-200 px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/20"
                                            onClick={() => void handleDeleteUser(user)}
                                            disabled={saving}
                                        >
                                            Deactivate User
                                        </button>
                                    </div>
                                )}
                            </article>
                            );
                        })}
                        {!loading && filteredTeam.length === 0 && (
                            <div className="px-4 py-6 text-center text-sm text-slate-500">
                                No team members match this filter.
                            </div>
                        )}
                    </div>

                    <div className="hidden md:block overflow-x-auto">
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
                                {!loading && filteredTeam.map((user) => {
                                    const isSelf = user.id === currentUserId;
                                    const isRoleSaving = roleSavingFor.has(user.id);
                                    return (
                                    <tr key={user.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isRoleSaving ? 'bg-primary/5 dark:bg-primary/10' : ''}`}>
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
                                            {isAdmin && !isSelf ? (
                                                <div className="relative flex items-center gap-1.5">
                                                    <select
                                                        value={user.role?.name || 'Employee'}
                                                        onChange={(e) => void handleInlineRoleChange(user, e.target.value)}
                                                        disabled={isRoleSaving}
                                                        aria-label={`Change role for ${user.first_name} ${user.last_name}`}
                                                        className="rounded-md border border-slate-200 bg-slate-50 py-1 pl-2 pr-7 text-sm font-medium text-slate-700 outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                                    >
                                                        {(roles.length > 0
                                                            ? roles.map((r) => r.name)
                                                            : ['Admin', 'Employee', 'Intern', 'Manager']
                                                        ).map((r) => (
                                                            <option key={r} value={r}>{r}</option>
                                                        ))}
                                                    </select>
                                                    {isRoleSaving && (
                                                        <span className="material-symbols-outlined animate-spin text-sm text-primary">progress_activity</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-sm capitalize">{user.role?.name || 'Employee'}{isSelf && isAdmin && <span className="ml-1.5 text-xs text-slate-400">(you)</span>}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                                                <span className="text-xs font-medium">{user.is_active ? 'Active' : 'Inactive'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right relative">
                                            <button
                                                type="button"
                                                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                                                onClick={() => setMenuOpenFor((prev) => prev === user.id ? null : user.id)}
                                                aria-label={`Actions for ${user.first_name} ${user.last_name}`}
                                            >
                                                <span className="material-symbols-outlined text-sm">more_vert</span>
                                            </button>

                                            {menuOpenFor === user.id && (
                                                <div className="absolute right-6 top-12 z-20 min-w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                                        onClick={() => openEditModal(user)}
                                                        disabled={!canManageTeam}
                                                    >
                                                        <span className="material-symbols-outlined text-base">edit</span>
                                                        Edit Member
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                                        onClick={() => void toggleUserActive(user)}
                                                        disabled={!canManageTeam || saving}
                                                    >
                                                        <span className="material-symbols-outlined text-base">{user.is_active ? 'person_off' : 'person'}</span>
                                                        {user.is_active ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:cursor-not-allowed disabled:opacity-50"
                                                        onClick={() => void handleDeleteUser(user)}
                                                        disabled={!canManageTeam || saving}
                                                    >
                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                        Deactivate User
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                                })}
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

            <AccessibleDialog
                isOpen={Boolean(modalMode)}
                onClose={closeModal}
                ariaLabelledBy="team-member-modal-title"
                panelClassName="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
                <div className="mb-4 flex items-center justify-between">
                    <h3 id="team-member-modal-title" className="text-xl font-bold text-slate-900 dark:text-slate-100">
                        {modalMode === 'create' ? 'Add Team Member' : 'Edit Team Member'}
                    </h3>
                    <button
                        type="button"
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        onClick={closeModal}
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {feedback && (
                    <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${
                        feedback.tone === 'success'
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border border-rose-200 bg-rose-50 text-rose-800'
                    }`}>
                        {feedback.message}
                    </div>
                )}

                <form className="space-y-4" onSubmit={(event) => void handleSaveMember(event)}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="team-member-first-name" className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">First Name</label>
                                    <input
                                        id="team-member-first-name"
                                        name="firstName"
                                        type="text"
                                        value={form.first_name}
                                        onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                        autoComplete="given-name"
                                    />
                                    {formErrors.first_name && (
                                        <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{formErrors.first_name}</p>
                                    )}
                                </div>
                                <div>
                                    <label htmlFor="team-member-last-name" className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Last Name</label>
                                    <input
                                        id="team-member-last-name"
                                        name="lastName"
                                        type="text"
                                        value={form.last_name}
                                        onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                        autoComplete="family-name"
                                    />
                                    {formErrors.last_name && (
                                        <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{formErrors.last_name}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label htmlFor="team-member-email" className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Email</label>
                                <input
                                    id="team-member-email"
                                    name="email"
                                    type="email"
                                    value={form.email}
                                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    autoComplete="email"
                                />
                                {formErrors.email && (
                                    <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{formErrors.email}</p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="team-member-password" className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                                        {modalMode === 'create' ? 'Temporary Password' : 'Reset Password (Optional)'}
                                    </label>
                                    <input
                                        id="team-member-password"
                                        name="password"
                                        type="password"
                                        value={form.password}
                                        onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                        autoComplete={modalMode === 'create' ? 'new-password' : 'off'}
                                    />
                                    {formErrors.password && (
                                        <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{formErrors.password}</p>
                                    )}
                                </div>
                                <div>
                                    <label htmlFor="team-member-role" className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Role</label>
                                    <select
                                        id="team-member-role"
                                        name="role"
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
                                    {formErrors.role && (
                                        <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{formErrors.role}</p>
                                    )}
                                </div>
                            </div>

                            {modalMode === 'edit' && (
                                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Active account</p>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={form.is_active}
                                        aria-label="Toggle account active status"
                                        onClick={() => setForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${form.is_active ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-600'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
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
            </AccessibleDialog>

            <AccessibleDialog
                isOpen={importModalOpen}
                onClose={closeImportModal}
                ariaLabelledBy="bulk-import-modal-title"
                panelClassName="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h3 id="bulk-import-modal-title" className="text-xl font-bold text-slate-900 dark:text-slate-100">Bulk Import Team Members</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Upload a CSV to create users in bulk and assign them to teams/projects automatically.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        onClick={closeImportModal}
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form className="space-y-5" onSubmit={(event) => void handleImportUsers(event)}>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                <p className="font-semibold">Supported columns</p>
                                <p className="mt-1">
                                    Required: <code>email</code>. Optional: <code>first_name</code>, <code>last_name</code>, <code>full_name</code>,
                                    <code> user_type</code>/<code>role</code>, <code>projects</code>/<code>team</code>, <code>project_ids</code>.
                                </p>
                                <p className="mt-1">User types accepted: employee, intern, manager.</p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleImportTemplateDownload}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                    <span className="material-symbols-outlined text-base">download</span>
                                    Download CSV Template
                                </button>
                                <label
                                    htmlFor="team-import-csv"
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                                >
                                    <span className="material-symbols-outlined text-base">upload_file</span>
                                    Upload CSV
                                </label>
                                <input
                                    id="team-import-csv"
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={(event) => void handleImportFileSelected(event)}
                                />
                                {importFileName && (
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                        File: {importFileName}
                                    </span>
                                )}
                            </div>

                            {importErrors.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                                    {importErrors.slice(0, 6).map((error, index) => (
                                        <p key={`${error}-${index}`}>{error}</p>
                                    ))}
                                    {importErrors.length > 6 && (
                                        <p>Additional CSV warnings detected. Please fix and re-upload if needed.</p>
                                    )}
                                </div>
                            )}

                            {importRows.length > 0 && (
                                <div className="rounded-xl border border-slate-200 dark:border-slate-700">
                                    <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold dark:border-slate-700">
                                        Parsed rows ready for import: {importRows.length}
                                    </div>
                                    <div className="max-h-48 overflow-auto">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                                <tr>
                                                    <th className="px-4 py-2 font-semibold">Email</th>
                                                    <th className="px-4 py-2 font-semibold">Name</th>
                                                    <th className="px-4 py-2 font-semibold">Type/Role</th>
                                                    <th className="px-4 py-2 font-semibold">Team/Projects</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {importRows.slice(0, 5).map((row, index) => (
                                                    <tr key={`${row.email}-${index}`} className="border-t border-slate-100 dark:border-slate-800">
                                                        <td className="px-4 py-2">{row.email}</td>
                                                        <td className="px-4 py-2">{row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim() || '--'}</td>
                                                        <td className="px-4 py-2">{row.user_type || row.role || row.type || importForm.default_role}</td>
                                                        <td className="px-4 py-2">{row.projects || row.project || row.team || '--'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Default User Type</label>
                                    <select
                                        value={importForm.default_role}
                                        onChange={(event) => setImportForm((previous) => ({ ...previous, default_role: event.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    >
                                        {(roles.length > 0 ? roles : [{ id: 'fallback-employee', name: 'Employee' }, { id: 'fallback-intern', name: 'Intern' }, { id: 'fallback-manager', name: 'Manager' }]).map((option) => (
                                            <option key={option.id} value={option.name}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Default Team Role</label>
                                    <input
                                        type="text"
                                        value={importForm.role_in_project}
                                        onChange={(event) => setImportForm((previous) => ({ ...previous, role_in_project: event.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                        placeholder="Team Member"
                                    />
                                </div>
                            </div>

                            {projects.length > 0 && (
                                <div>
                                    <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">Default Team Assignments (optional)</p>
                                    <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-800">
                                        {projects.map((project) => (
                                            <label key={project.id} className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                                <input
                                                    type="checkbox"
                                                    checked={importForm.default_project_ids.includes(project.id)}
                                                    onChange={() => toggleDefaultProject(project.id)}
                                                />
                                                {project.name}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                                <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200">
                                    <input
                                        type="checkbox"
                                        checked={importForm.use_email_as_password}
                                        onChange={(event) => setImportForm((previous) => ({ ...previous, use_email_as_password: event.target.checked }))}
                                    />
                                    Use each email as the temporary password
                                </label>
                                <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200">
                                    <input
                                        type="checkbox"
                                        checked={importForm.skip_existing}
                                        onChange={(event) => setImportForm((previous) => ({ ...previous, skip_existing: event.target.checked }))}
                                    />
                                    Skip users that already exist
                                </label>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                    onClick={closeImportModal}
                                    disabled={importing}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={importing || importRows.length === 0}
                                    className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {importing ? 'Importing...' : importRows.length > 0 ? `Import ${importRows.length} Users` : 'Import Users'}
                                </button>
                            </div>
                </form>
            </AccessibleDialog>
        </div>
    );
};

export default Team;
