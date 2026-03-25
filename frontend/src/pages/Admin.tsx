import React, { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import type { ProjectSummary, UserSummary, IntegrationSummary, AuditLogSummary, NotificationSummary } from '../types/api';

const availableTabs = ['projects', 'users', 'integrations', 'notifications', 'audit'] as const;

const Admin: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const queryTab = searchParams.get('tab');
    const activeTab =
        queryTab && availableTabs.includes(queryTab as (typeof availableTabs)[number])
            ? queryTab
            : 'projects';

    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [users, setUsers] = useState<UserSummary[]>([]);
    const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
    const [auditLogs, setAuditLogs] = useState<AuditLogSummary[]>([]);
    const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
    
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [newProjectBudgetHours, setNewProjectBudgetHours] = useState('');
    const [newProjectBudgetAmount, setNewProjectBudgetAmount] = useState('');
    
    const handleTabChange = (tab: string) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', tab);
            return next;
        });
    };

    async function fetchProjects() {
        try {
            const res = await api.get<ProjectSummary[]>('/projects');
            setProjects(res.data);
        } catch (error) {
            console.error('Error fetching projects:', error);
        }
    }

    async function fetchUsers() {
        try {
            const res = await api.get<UserSummary[]>('/users');
            setUsers(res.data);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    }

    async function fetchIntegrations() {
        try {
            const res = await api.get<{ integrations: IntegrationSummary[] }>('/integrations');
            setIntegrations(res.data.integrations || []);
        } catch (error) {
            console.error('Error fetching integrations:', error);
        }
    }

    async function fetchAuditLogs() {
        try {
            const res = await api.get<{ logs: AuditLogSummary[] }>('/admin/audit-logs');
            setAuditLogs(res.data.logs || []);
        } catch (error) {
            console.error('Error fetching audit logs:', error);
        }
    }

    async function fetchNotifications() {
        try {
            const res = await api.get<{ notifications: NotificationSummary[] }>('/admin/notifications');
            setNotifications(res.data.notifications || []);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    }

    useEffect(() => {
        const loadAdminData = async () => {
            await Promise.all([
                fetchProjects(), 
                fetchUsers(),
                fetchIntegrations(),
                fetchAuditLogs(),
                fetchNotifications()
            ]);
        };

        void loadAdminData();
    }, []);

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/projects', {
                name: newProjectName,
                description: newProjectDesc,
                budget_hours: newProjectBudgetHours,
                budget_amount: newProjectBudgetAmount
            });
            setIsProjectModalOpen(false);
            setNewProjectName('');
            setNewProjectDesc('');
            setNewProjectBudgetHours('');
            setNewProjectBudgetAmount('');
            fetchProjects();
        } catch (error) {
            console.error('Error creating project:', error);
            alert('Failed to create project.');
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900/50 overflow-y-auto w-full">
            <div className="p-8 max-w-7xl mx-auto w-full">
                <div className="flex flex-wrap justify-between items-end gap-4 mb-8">
                    <div className="flex flex-col gap-1">
                        <h1 className="text-slate-900 dark:text-white text-3xl font-black leading-tight tracking-tight">Organization Management</h1>
                        <p className="text-slate-500 text-base font-normal">Configure and monitor your organization's infrastructure, team, and security.</p>
                    </div>
                    {activeTab === 'projects' && (
                        <button
                            onClick={() => setIsProjectModalOpen(true)}
                            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                        >
                            <Plus size={16} />
                            Create New Project
                        </button>
                    )}
                </div>

                <div className="mb-6">
                    <div className="flex border-b border-slate-200 dark:border-slate-800 gap-8 overflow-x-auto">
                        {['projects', 'users', 'integrations', 'notifications', 'audit'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => handleTabChange(tab)}
                                className={`flex flex-col items-center justify-center border-b-2 pb-3 transition-all whitespace-nowrap ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                <p className="text-sm font-bold leading-normal capitalize">{tab === 'audit' ? 'Audit Logs' : tab}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden mb-8">
                    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                        <h3 className="font-bold text-slate-900 dark:text-white capitalize">
                            {activeTab === 'audit' ? 'System Audit Logs' : `${activeTab} Directory`}
                        </h3>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/50">
                                    {activeTab === 'projects' && (
                                        <>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Project Name</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Time Budget Burn</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Profitability (Cost)</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-center">Status</th>
                                        </>
                                    )}
                                    {activeTab === 'users' && (
                                        <>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Name</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Email</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-center">Status</th>
                                        </>
                                    )}
                                    {activeTab === 'integrations' && (
                                        <>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Integration App</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Configuration Summary</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-center">Status</th>
                                        </>
                                    )}
                                    {activeTab === 'audit' && (
                                        <>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Timestamp</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">User</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Action</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Resource</th>
                                        </>
                                    )}
                                    {activeTab === 'notifications' && (
                                        <>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Timestamp</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">User</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Type</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400">Message</th>
                                            <th className="px-6 py-4 text-xs font-bold uppercase text-slate-400 text-center">Read</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {activeTab === 'projects' && projects.map((p) => {
                                    const hoursBurned = p.hours_burned ?? 0;
                                    const costBurned = p.cost_burned ?? 0;
                                    const timePct = p.budget_hours ? (hoursBurned / p.budget_hours) * 100 : 0;
                                    const costPct = p.budget_amount ? (costBurned / p.budget_amount) * 100 : 0;
                                    return (
                                        <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                            <td className="px-6 py-4 text-sm font-semibold">
                                                <p className="text-slate-900 dark:text-slate-100">{p.name}</p>
                                                <p className="text-xs text-slate-500 font-normal">{p.description || 'No description'}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex gap-2 items-center">
                                                    <div className="w-16 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full">
                                                        <div className={`h-full rounded-full ${timePct > 90 ? 'bg-rose-500' : 'bg-primary'}`} style={{ width: `${Math.min(timePct, 100)}%` }}></div>
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{hoursBurned.toFixed(1)}h / {p.budget_hours || '∞'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex gap-2 items-center">
                                                    <div className="w-16 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full">
                                                        <div className={`h-full rounded-full ${costPct > 90 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(costPct, 100)}%` }}></div>
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">${costBurned.toFixed(2)} / ${p.budget_amount || '∞'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Active
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {activeTab === 'users' && users.map((u) => (
                                    <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                                    {u.first_name[0]}{u.last_name[0]}
                                                </div>
                                                <span className="text-sm font-semibold dark:text-slate-200">{u.first_name} {u.last_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-500">{u.email}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${u.is_active ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span> {u.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {activeTab === 'integrations' && (integrations.length === 0 ? (
                                    <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-500 text-sm">No integrations configured.</td></tr>
                                ) : integrations.map((intg, i) => (
                                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                        <td className="px-6 py-4 font-semibold text-sm capitalize dark:text-slate-200">{intg.type}</td>
                                        <td className="px-6 py-4 text-sm text-slate-500">
                                            {JSON.stringify(intg.summary || {})}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${intg.is_active ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${intg.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span> {intg.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                    </tr>
                                )))}
                                {activeTab === 'audit' && (auditLogs.length === 0 ? (
                                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500 text-sm">No audit logs found.</td></tr>
                                ) : auditLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                        <td className="px-6 py-4 text-sm text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                                        <td className="px-6 py-4 text-sm font-semibold dark:text-slate-200">{log.user.email}</td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">{log.action}</span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{log.resource}</td>
                                    </tr>
                                )))}
                                {activeTab === 'notifications' && (notifications.length === 0 ? (
                                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500 text-sm">No system notifications found.</td></tr>
                                ) : notifications.map((notif) => (
                                    <tr key={notif.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                        <td className="px-6 py-4 text-sm text-slate-500">{new Date(notif.created_at).toLocaleString()}</td>
                                        <td className="px-6 py-4 text-sm font-semibold dark:text-slate-200">{notif.user.email}</td>
                                        <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{notif.type}</td>
                                        <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">{notif.message}</td>
                                        <td className="px-6 py-4 text-center">
                                            {notif.is_read ? (
                                                <span className="material-symbols-outlined text-emerald-500 text-sm">done_all</span>
                                            ) : (
                                                <span className="material-symbols-outlined text-slate-300 text-sm">check</span>
                                            )}
                                        </td>
                                    </tr>
                                )))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* New Project Modal Overlay */}
                {isProjectModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                <span className="font-bold text-lg dark:text-white">Create New Project</span>
                                <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onClick={() => setIsProjectModalOpen(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-6">
                                <form onSubmit={handleCreateProject}>
                                    <div className="mb-4">
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Project Name</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white"
                                            placeholder="e.g. Website Redesign"
                                            value={newProjectName}
                                            onChange={(e) => setNewProjectName(e.target.value)}
                                            autoFocus
                                            required
                                        />
                                    </div>
                                    <div className="mb-4">
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Description</label>
                                        <textarea
                                            className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white"
                                            placeholder="Brief details about this project..."
                                            rows={2}
                                            value={newProjectDesc}
                                            onChange={(e) => setNewProjectDesc(e.target.value)}
                                        ></textarea>
                                    </div>
                                    <div className="flex gap-4 mb-6">
                                        <div className="flex-1">
                                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Budgeted Hours</label>
                                            <input
                                                type="number"
                                                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white"
                                                placeholder="e.g. 100"
                                                value={newProjectBudgetHours}
                                                onChange={(e) => setNewProjectBudgetHours(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Budgeted Cost ($)</label>
                                            <input
                                                type="number"
                                                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-white"
                                                placeholder="e.g. 5000"
                                                value={newProjectBudgetAmount}
                                                onChange={(e) => setNewProjectBudgetAmount(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3">
                                        <button type="button" className="px-4 py-2 font-bold text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white" onClick={() => setIsProjectModalOpen(false)}>Cancel</button>
                                        <button type="submit" className="px-6 py-2 bg-primary text-white font-bold text-sm rounded-lg hover:bg-primary/90 shadow-md">Create Project</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Admin;
