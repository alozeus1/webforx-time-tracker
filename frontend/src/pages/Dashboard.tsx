import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import type { TimeEntrySummary } from '../types/api';

const Dashboard: React.FC = () => {
    const [stats, setStats] = useState({ totalDuration: 0, topProject: 'None', topProjectDuration: 0 });
    const [recentEntries, setRecentEntries] = useState<TimeEntrySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const response = await api.get<{ entries: TimeEntrySummary[] }>('/timers/me');
                const entries = response.data.entries;

                let total = 0;
                const projectMap: Record<string, number> = {};

                entries.forEach((e) => {
                    total += e.duration || 0;
                    if (e.project) {
                        projectMap[e.project.name] = (projectMap[e.project.name] || 0) + (e.duration || 0);
                    }
                });

                let topProject = 'None';
                let topProjectDuration = 0;
                Object.entries(projectMap).forEach(([name, duration]) => {
                    if (duration > topProjectDuration) {
                        topProject = name;
                        topProjectDuration = duration;
                    }
                });

                setStats({ totalDuration: total, topProject, topProjectDuration });
                setRecentEntries(entries.slice(0, 5)); // Keep the 5 most recent
            } catch (error) {
                console.error('Failed to load dashboard data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    const formatHours = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    };

    const formatDecimalHours = (seconds: number) => {
        return (seconds / 3600).toFixed(1);
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-background-light dark:bg-background-dark w-full">
            <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10 hidden md:flex">
                <div className="flex items-center gap-4 flex-1">
                    <div className="relative w-full max-w-md">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                        <input className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none" placeholder="Search tasks, code reviews, or projects..." type="text" />
                    </div>
                </div>
                <div className="flex flex-1 justify-end items-center gap-4">
                    <button className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg relative">
                        <span className="material-symbols-outlined">notifications</span>
                        <span className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
                    </button>
                    <button
                        onClick={() => navigate('/timer')}
                        className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-primary/90 transition-all"
                    >
                        <span className="material-symbols-outlined text-sm">add</span>
                        New Entry
                    </button>
                </div>
            </header>

            <div className="p-8 overflow-y-auto">
                <div className="max-w-6xl mx-auto space-y-8">
                    {/* Timer & Quick Input Section */}
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                        <div className="flex flex-col lg:flex-row gap-6 items-center">
                            {/* Timer Graphic */}
                            <div className="flex items-center gap-4 lg:pr-8 lg:border-r border-slate-200 dark:border-slate-800 w-full lg:w-auto justify-center">
                                <div className="text-center">
                                    <div className="flex gap-2">
                                        <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                            <span className="text-3xl font-bold tracking-tighter font-mono">00</span>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1">HR</p>
                                        </div>
                                        <div className="text-2xl font-bold self-center text-slate-300">:</div>
                                        <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700">
                                            <span className="text-3xl font-bold tracking-tighter font-mono">00</span>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1">MIN</p>
                                        </div>
                                        <div className="text-2xl font-bold self-center text-slate-300">:</div>
                                        <div className="bg-primary/10 text-primary px-4 py-3 rounded-xl border border-primary/20">
                                            <span className="text-3xl font-bold tracking-tighter font-mono">00</span>
                                            <p className="text-[10px] uppercase tracking-wider text-primary/60 font-semibold mt-1">SEC</p>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => navigate('/timer')}
                                    className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-105 transition-transform"
                                >
                                    <span className="material-symbols-outlined text-3xl">play_arrow</span>
                                </button>
                            </div>

                            {/* Task Input Fields */}
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</label>
                                    <select className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20">
                                        <option>Cloud Infrastructure Migr...</option>
                                        <option>Mobile App UI Redesign</option>
                                        <option>Internal Admin Tools</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1 md:col-span-2">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">What are you working on?</label>
                                    <div className="relative">
                                        <input className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Refactoring AWS Lambda functions for data pipeline..." type="text" />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                            <span className="material-symbols-outlined text-slate-400 text-lg cursor-pointer hover:text-primary">sell</span>
                                            <span className="material-symbols-outlined text-slate-400 text-lg cursor-pointer hover:text-primary">monetization_on</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-slate-500 text-sm font-medium">Daily Goal</span>
                                <span className="material-symbols-outlined text-primary text-xl">target</span>
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="text-2xl font-bold">{loading ? '...' : formatDecimalHours(stats.totalDuration)}</span>
                                <span className="text-slate-400 pb-1 text-sm">/ 8h</span>
                            </div>
                            <div className="mt-4 h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${Math.min((stats.totalDuration / (8 * 3600)) * 100, 100)}%` }}></div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-slate-500 text-sm font-medium">Weekly Total</span>
                                <span className="material-symbols-outlined text-emerald-500 text-xl">event_available</span>
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="text-2xl font-bold">34.2</span>
                                <span className="text-slate-400 pb-1 text-sm">hours</span>
                            </div>
                            <p className="text-xs text-emerald-600 font-medium mt-4 flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">trending_up</span> 12% from last week
                            </p>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-slate-500 text-sm font-medium">Top Project</span>
                                <span className="material-symbols-outlined text-orange-500 text-xl">bolt</span>
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="text-2xl font-bold truncate max-w-[120px]" title={stats.topProject}>{loading ? '...' : stats.topProject}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-4">{formatHours(stats.topProjectDuration)} Tracked</p>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-slate-500 text-sm font-medium">Tasks Completed</span>
                                <span className="material-symbols-outlined text-purple-500 text-xl">check_circle</span>
                            </div>
                            <div className="flex items-end gap-2">
                                <span className="text-2xl font-bold">18</span>
                                <span className="text-slate-400 pb-1 text-sm">this week</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-4">4 tasks pending for today</p>
                        </div>
                    </div>

                    {/* Timeline & Entries */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                        {/* Timeline Section */}
                        <div className="xl:col-span-2 space-y-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold">Visual Timeline</h2>
                                <div className="flex gap-2">
                                    <button className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200">
                                        <span className="material-symbols-outlined text-sm">chevron_left</span>
                                    </button>
                                    <span className="text-sm font-semibold flex items-center">Today</span>
                                    <button className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200">
                                        <span className="material-symbols-outlined text-sm">chevron_right</span>
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden relative min-h-[400px]">
                                {/* Time Labels */}
                                <div className="grid grid-cols-1 divide-y divide-slate-100 dark:divide-slate-800">
                                    <div className="h-12 flex items-center px-4 text-[10px] text-slate-400 font-bold uppercase">09:00 AM</div>
                                    <div className="h-12 flex items-center px-4 text-[10px] text-slate-400 font-bold uppercase">10:00 AM</div>
                                    <div className="h-12 flex items-center px-4 text-[10px] text-slate-400 font-bold uppercase">11:00 AM</div>
                                    <div className="h-12 flex items-center px-4 text-[10px] text-slate-400 font-bold uppercase">12:00 PM</div>
                                    <div className="h-12 flex items-center px-4 text-[10px] text-slate-400 font-bold uppercase">01:00 PM</div>
                                    <div className="h-12 flex items-center px-4 text-[10px] text-slate-400 font-bold uppercase">02:00 PM</div>
                                    <div className="h-12 flex items-center px-4 text-[10px] text-slate-400 font-bold uppercase">03:00 PM</div>
                                    <div className="h-12 flex items-center px-4 text-[10px] text-slate-400 font-bold uppercase">04:00 PM</div>
                                </div>

                                {/* Timeline Blocks */}
                                <div className="absolute top-0 left-20 right-4 h-full">
                                    <div className="absolute top-[12px] h-[72px] left-0 right-0 bg-primary/10 border-l-4 border-primary rounded px-3 py-2 cursor-pointer hover:bg-primary/20 transition-colors">
                                        <p className="text-xs font-bold text-primary">Standup & Daily Sync</p>
                                        <p className="text-[10px] text-primary/60">09:15 - 10:30 AM</p>
                                    </div>
                                    <div className="absolute top-[108px] h-[120px] left-0 right-0 bg-emerald-100 dark:bg-emerald-900/30 border-l-4 border-emerald-500 rounded px-3 py-2 cursor-pointer hover:bg-emerald-200 transition-colors">
                                        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Deep Work: Code Refactor</p>
                                        <p className="text-[10px] text-emerald-600/60 dark:text-emerald-400/60">11:00 AM - 01:30 PM</p>
                                    </div>
                                    <div className="absolute top-[252px] h-[48px] left-0 right-0 bg-slate-100 dark:bg-slate-800 border-l-4 border-slate-400 rounded px-3 py-2">
                                        <p className="text-xs font-bold text-slate-600 dark:text-slate-300">Lunch Break</p>
                                        <p className="text-[10px] text-slate-500">02:00 PM - 03:00 PM</p>
                                    </div>

                                    {/* Current Time Line */}
                                    <div className="absolute top-[340px] left-[-20px] right-[-10px] border-t-2 border-dashed border-red-500 flex items-center z-10">
                                        <span className="bg-red-500 text-white text-[9px] font-bold px-1 rounded absolute -left-1">NOW</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Recent Entries */}
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold">Recent Entries</h2>
                                <button className="text-xs text-primary font-semibold hover:underline">View All</button>
                            </div>
                            <div className="space-y-3">
                                {recentEntries.length === 0 && !loading && (
                                    <div className="text-center p-4 text-slate-500 text-sm">No recent entries found.</div>
                                )}
                                {recentEntries.map((entry) => (
                                    <div key={entry.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex items-center justify-between group hover:border-primary/30 transition-colors cursor-pointer">
                                        <div className="flex gap-4 items-center">
                                            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center">
                                                <span className="material-symbols-outlined">code</span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold">{entry.task_description || 'Untitled Task'}</p>
                                                <p className="text-xs text-slate-500">{entry.project?.name || 'Unassigned'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold">{formatHours(entry.duration || 0)}</p>
                                            <p className="text-[10px] text-slate-400 uppercase font-bold">Recorded</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
