import React from 'react';

const Timeline: React.FC = () => {
    return (
        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-background-dark w-full overflow-y-auto">
            {/* Header Controls */}
            <div className="flex flex-wrap justify-between items-center gap-4 p-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 hidden md:flex">
                <div className="flex items-center gap-4">
                    <button className="flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50">
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <div className="text-center">
                        <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Tuesday, Oct 24</h2>
                        <p className="text-sm text-slate-500">Week 43 of 2023</p>
                    </div>
                    <button className="flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50">
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                    <button className="ml-2 px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg">Today</button>
                </div>

                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 border border-transparent hover:border-slate-300">
                        <span className="material-symbols-outlined text-[18px]">filter_list</span>
                        Filter
                    </button>
                    <button className="flex items-center gap-2 bg-primary px-6 py-2 rounded-lg text-sm font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary/90">
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        New Task
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Main Schedule View */}
                <main className="flex-1 flex flex-col p-6 overflow-y-auto">
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden relative">

                        {/* Current Time Indicator */}
                        <div className="absolute w-full border-t-2 border-rose-500 z-10" style={{ top: '65%' }}>
                            <div className="absolute -left-2 -top-1 w-3 h-3 rounded-full bg-rose-500 ring-4 ring-rose-500/20"></div>
                            <div className="absolute left-[85px] -top-3 px-2 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full">13:42</div>
                        </div>

                        {/* Timeline Rows */}
                        <div className="grid grid-cols-[100px_1fr] border-b border-slate-100 dark:border-slate-800">
                            <div className="p-4 border-r border-slate-100 dark:border-slate-800 text-right">
                                <span className="text-xs font-bold text-slate-400">08:00</span>
                            </div>
                            <div className="relative min-h-[60px] p-2">
                                <div className="absolute inset-x-2 top-2 bottom-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex items-center px-4">
                                    <span className="text-xs text-slate-400">Free Time</span>
                                </div>
                            </div>
                        </div>

                        {/* Active Block 1 */}
                        <div className="grid grid-cols-[100px_1fr] border-b border-slate-100 dark:border-slate-800 group relative">
                            <div className="p-4 border-r border-slate-100 dark:border-slate-800 text-right">
                                <span className="text-xs font-bold text-slate-400">09:00</span>
                            </div>
                            <div className="p-2 relative min-h-[120px]">
                                <div className="h-full bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-lg p-4 flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer">
                                    <div>
                                        <div className="flex justify-between items-start">
                                            <h3 className="text-blue-900 dark:text-blue-200 font-bold text-base leading-tight">Project Alpha: UX Audit & Design Refactor</h3>
                                            <div className="flex gap-1 opacity-100 transition-opacity">
                                                <button className="p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                                            </div>
                                        </div>
                                        <p className="text-blue-700 dark:text-blue-400 text-sm mt-1">Focus Mode • Deep Work</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-2">
                                        <span className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-500">
                                            <span className="material-symbols-outlined text-[14px]">timer</span> 09:00 - 11:00
                                        </span>
                                        <div className="flex -space-x-2">
                                            <div className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-900 bg-slate-200 bg-cover" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBpZWI3UuO6zdDYktpDyl2a2Oz78OorLkCaXvrPT9savb8_OMQcWBRmPzy0IHZZtmYQpNxUsnVixWvfbenS-q7KCHeOLKuvNti-9fTuYEGnugVBiVzyG359Drks-WmeYT2Wotx2sPkr69VDY8O-Dv6eo25tFHI7T-NwV58g7ULZ5Ss_ajqwk71mmiS7lko3YGXY3RtWNGYNbbuznaHCyOwPVtp13Y4Ed8kZPtAej8Hw863U4_yCyZicXEUhVY3jaJARd7EZAwR1T6cB")' }}></div>
                                            <div className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-900 bg-slate-200 bg-cover" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCMbOlSHFfkuDZjnw-ViG6dh3E9fXsgPSSURbt_PdpFDPG6W2u1jYq3YtXrMfrX0qaWeP5FBAy2XbPjlPVdpyKw1ym-vykNaCuvEdzgoofz7fxZEz-amq8ykOIrq584_9mi2-mHjVjDNgyDB7WujEYUyhJ6E1wZy0-VPc4ZXC0K9WlJBw9132LvR8R79mi7EC0AF-8-a_XVT1rJE_wIpVMyrzd4-uJ4fKt4Aa754rQ6StOXMUaL5Vf8eGlAbRIlTZWhT2XH0H3w2GgK")' }}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Active Block 2 */}
                        <div className="grid grid-cols-[100px_1fr] border-b border-slate-100 dark:border-slate-800 group">
                            <div className="p-4 border-r border-slate-100 dark:border-slate-800 text-right">
                                <span className="text-xs font-bold text-slate-400">11:00</span>
                            </div>
                            <div className="p-2 relative min-h-[80px]">
                                <div className="h-full bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-500 rounded-lg p-3 flex flex-col md:flex-row items-start md:items-center justify-between hover:shadow-md transition-shadow cursor-pointer">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-emerald-500/10 p-2 rounded-lg hidden sm:block">
                                            <span className="material-symbols-outlined text-emerald-600">call</span>
                                        </div>
                                        <div>
                                            <h3 className="text-emerald-900 dark:text-emerald-200 font-bold text-sm">Client Stakeholder Sync</h3>
                                            <p className="text-emerald-700 dark:text-emerald-400 text-xs">Project Beta • Zoom Link Attached</p>
                                        </div>
                                    </div>
                                    <div className="md:text-right mt-2 md:mt-0">
                                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-500">11:00 - 12:00</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Active Block 3 - Overlap/Merged Style */}
                        <div className="grid grid-cols-[100px_1fr] border-b border-slate-100 dark:border-slate-800">
                            <div className="p-4 border-r border-slate-100 dark:border-slate-800 text-right">
                                <span className="text-xs font-bold text-slate-400">12:00</span>
                            </div>
                            <div className="p-2 relative min-h-[80px]">
                                <div className="h-full bg-slate-100 dark:bg-slate-800 border-l-4 border-slate-400 rounded-lg p-3 flex items-center gap-4 grayscale opacity-70">
                                    <span className="material-symbols-outlined text-slate-500">coffee</span>
                                    <span className="text-sm font-bold text-slate-600 dark:text-slate-400">Lunch Break</span>
                                </div>
                            </div>
                        </div>

                        {/* Active Block 4 */}
                        <div className="grid grid-cols-[100px_1fr] border-b border-slate-100 dark:border-slate-800 group">
                            <div className="p-4 border-r border-slate-100 dark:border-slate-800 text-right">
                                <span className="text-xs font-bold text-slate-400">13:00</span>
                            </div>
                            <div className="p-2 relative min-h-[140px]">
                                <div className="h-full bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-500 rounded-lg p-4 flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer">
                                    <div>
                                        <div className="flex justify-between items-start">
                                            <h3 className="text-purple-900 dark:text-purple-200 font-bold text-base">Gamma Project Prototyping</h3>
                                        </div>
                                        <p className="text-purple-700 dark:text-purple-400 text-sm mt-1">High Fidelity Assets • Interaction Design</p>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-2">
                                        <span className="flex items-center gap-1 text-xs font-bold text-purple-600 dark:text-purple-500">
                                            <span className="material-symbols-outlined text-[14px]">schedule</span> 13:00 - 15:30
                                        </span>
                                        <span className="inline-block px-2 py-1 rounded-full bg-purple-200 dark:bg-purple-800 text-[10px] font-black uppercase text-purple-700 dark:text-purple-200 w-max mt-2 sm:mt-0">High Priority</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Timeline Footer */}
                        <div className="grid grid-cols-[100px_1fr]">
                            <div className="p-4 border-r border-slate-100 dark:border-slate-800 text-right">
                                <span className="text-xs font-bold text-slate-400">16:00</span>
                            </div>
                            <div className="p-2 relative min-h-[60px]">
                                <div className="absolute inset-x-2 top-2 bottom-2 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer transition-colors">
                                    <span className="text-xs text-slate-400 font-bold">+ Add Entry</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </main>

                {/* Right Info Panel (Quick Access) */}
                <aside className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hidden lg:flex flex-col p-6 gap-8 overflow-y-auto">
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest">Mini Calendar</h3>
                            <span className="material-symbols-outlined text-slate-400">calendar_view_day</span>
                        </div>
                        {/* Calendar Widget Skeleton */}
                        <div className="grid grid-cols-7 gap-1 text-center mb-2">
                            <span className="text-[10px] font-bold text-slate-400">S</span>
                            <span className="text-[10px] font-bold text-slate-400">M</span>
                            <span className="text-[10px] font-bold text-slate-400">T</span>
                            <span className="text-[10px] font-bold text-slate-400">W</span>
                            <span className="text-[10px] font-bold text-slate-400">T</span>
                            <span className="text-[10px] font-bold text-slate-400">F</span>
                            <span className="text-[10px] font-bold text-slate-400">S</span>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center">
                            <div className="text-xs p-1 text-slate-300">22</div>
                            <div className="text-xs p-1 text-slate-300">23</div>
                            <div className="text-xs p-1 bg-primary text-white font-bold rounded-lg px-2">24</div>
                            <div className="text-xs p-1 hover:bg-slate-100 rounded-lg">25</div>
                            <div className="text-xs p-1 hover:bg-slate-100 rounded-lg">26</div>
                            <div className="text-xs p-1 hover:bg-slate-100 rounded-lg">27</div>
                            <div className="text-xs p-1 hover:bg-slate-100 rounded-lg">28</div>
                        </div>
                    </section>

                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest">Project Activity</h3>
                            <span className="material-symbols-outlined text-slate-400">history</span>
                        </div>
                        <div className="space-y-4">
                            <div className="flex gap-3">
                                <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0"></div>
                                <div>
                                    <p className="text-sm text-slate-700 dark:text-slate-300"><b>Sarah</b> moved <i>Hero Section</i> to Review</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">2 minutes ago</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full mt-1.5 shrink-0"></div>
                                <div>
                                    <p className="text-sm text-slate-700 dark:text-slate-300"><b>Beta Launch</b> merged 12 schedule blocks</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">1 hour ago</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="w-2 h-2 bg-slate-300 rounded-full mt-1.5 shrink-0"></div>
                                <div>
                                    <p className="text-sm text-slate-700 dark:text-slate-300">System backup completed</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">3 hours ago</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="mt-auto">
                        <div className="bg-primary/5 rounded-xl p-4 border border-primary/20 text-center">
                            <span className="material-symbols-outlined text-primary text-4xl mb-2">stars</span>
                            <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-1">Weekly Summary</h4>
                            <p className="text-xs text-slate-500 mb-4">You've reached 85% of your productivity goal this week!</p>
                            <button className="w-full py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-all">View Analytics</button>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
};

export default Timeline;
