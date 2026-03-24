import React, { useState, useEffect } from 'react';
import api from '../services/api';
import type { UserSummary } from '../types/api';

const Team: React.FC = () => {
    const [team, setTeam] = useState<UserSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTeam = async () => {
            try {
                const res = await api.get<UserSummary[]>('/users');
                setTeam(res.data);
            } catch (error) {
                console.error('Failed to load team', error);
            } finally {
                setLoading(false);
            }
        };

        fetchTeam();
    }, []);

    return (
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-background-dark w-full">
            {/* Page Title */}
            <div className="mb-8">
                <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Engineering Team</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Manage specialized engineers across active product squads.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-500">Total Headcount</span>
                        <span className="text-emerald-500 text-xs font-bold flex items-center bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">+2%</span>
                    </div>
                    <div className="text-3xl font-bold">{loading ? '...' : team.length}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-500">Currently Active</span>
                        <span className="text-emerald-500 text-xs font-bold flex items-center bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">+5%</span>
                    </div>
                    <div className="text-3xl font-bold">{loading ? '...' : team.filter(u => u.is_active).length}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-500">Open Roles</span>
                        <span className="text-slate-400 text-xs font-bold flex items-center bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-full">Stable</span>
                    </div>
                    <div className="text-3xl font-bold">4</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-500">Avg. Task Velocity</span>
                        <span className="text-red-500 text-xs font-bold flex items-center bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-full">-1.2%</span>
                    </div>
                    <div className="text-3xl font-bold">24.5</div>
                </div>
            </div>

            {/* Live Status & Directory */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Member Directory Table */}
                <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <h3 className="text-lg font-bold">Team Directory</h3>
                        <div className="flex gap-2">
                            <button className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">Filter</button>
                            <button className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">Export</button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 font-semibold">Member</th>
                                    <th className="px-6 py-4 font-semibold">Role</th>
                                    <th className="px-6 py-4 font-semibold">Status</th>
                                    <th className="px-6 py-4 font-semibold">Squad</th>
                                    <th className="px-6 py-4 font-semibold"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {loading && <tr><td colSpan={5} className="px-6 py-4 text-center">Loading...</td></tr>}
                                {!loading && team.map((user) => (
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
                                            <span className="text-sm capitalize">{user.role?.name || 'Engineer'}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                                                <span className="text-xs font-medium">{user.is_active ? 'Active Now' : 'Offline'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-tight">Core App</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-slate-400 hover:text-slate-600">
                                                <span className="material-symbols-outlined text-sm">more_vert</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Real-time Activity Feed */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                        <h3 className="text-lg font-bold">Real-time Activity</h3>
                        <p className="text-xs text-slate-500 mt-1">Live updates from repos and tools</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Activity Item */}
                        <div className="flex gap-4 relative">
                            <div className="absolute left-4 top-8 bottom-[-24px] w-px bg-slate-100 dark:bg-slate-800"></div>
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 z-10">
                                <span className="material-symbols-outlined text-sm text-blue-600 dark:text-blue-400">commit</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <p className="text-sm">
                                    <span className="font-semibold text-slate-900 dark:text-slate-100">Marcus Chen</span>
                                    pushed 4 commits to <span className="text-primary font-medium">origin/main</span>
                                </p>
                                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">Just now</span>
                                <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <p className="text-xs text-slate-600 dark:text-slate-300 font-mono">feat: integrate stripe checkout api</p>
                                </div>
                            </div>
                        </div>

                        {/* Activity Item */}
                        <div className="flex gap-4 relative">
                            <div className="absolute left-4 top-8 bottom-[-24px] w-px bg-slate-100 dark:bg-slate-800"></div>
                            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 z-10">
                                <span className="material-symbols-outlined text-sm text-emerald-600 dark:text-emerald-400">check_circle</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <p className="text-sm">
                                    <span className="font-semibold text-slate-900 dark:text-slate-100">Sarah Jenkins</span>
                                    approved PR <span className="text-primary font-medium">#412: DB Migration</span>
                                </p>
                                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">12 minutes ago</span>
                            </div>
                        </div>

                        {/* Activity Item */}
                        <div className="flex gap-4 relative">
                            <div className="absolute left-4 top-8 bottom-[-24px] w-px bg-slate-100 dark:bg-slate-800"></div>
                            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0 z-10">
                                <span className="material-symbols-outlined text-sm text-purple-600 dark:text-purple-400">rocket_launch</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <p className="text-sm">
                                    <span className="font-semibold text-slate-900 dark:text-slate-100">Deployment</span>
                                    to <span className="font-medium">staging</span> was successful
                                </p>
                                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">45 minutes ago</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Team;
