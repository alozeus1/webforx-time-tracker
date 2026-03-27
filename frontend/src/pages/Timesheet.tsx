import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, CheckCircle, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import type { TimeEntrySummary } from '../types/api';

const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const toISODate = (value: Date) => {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const startOfWeek = (date: Date) => {
    const copy = new Date(date);
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
};

const Timesheet: React.FC = () => {
    const navigate = useNavigate();
    const [entries, setEntries] = useState<TimeEntrySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [weekAnchorDate, setWeekAnchorDate] = useState(() => new Date());
    const [exporting, setExporting] = useState(false);
    const datePickerRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const loadEntries = async () => {
            setLoading(true);
            try {
                const response = await api.get<{ entries: TimeEntrySummary[] }>('/timers/me');
                setEntries(response.data.entries || []);
            } catch (error) {
                console.error('Failed to load weekly timesheet:', error);
            } finally {
                setLoading(false);
            }
        };

        void loadEntries();
    }, []);

    const weekStart = useMemo(() => startOfWeek(weekAnchorDate), [weekAnchorDate]);
    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, index) => {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + index);
            return day;
        }),
        [weekStart],
    );

    const { rows, dailyTotals, weeklyTotal } = useMemo(() => {
        const weeklyEntries = entries.filter((entry) => {
            const entryDate = new Date(entry.start_time);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 7);
            return entryDate >= weekStart && entryDate < weekEnd;
        });

        const projectMap = new Map<string, { project: string; totals: number[] }>();
        const totals = Array.from({ length: 7 }, () => 0);

        weeklyEntries.forEach((entry) => {
            const entryDate = new Date(entry.start_time);
            const dayIndex = Math.floor((entryDate.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));

            if (dayIndex < 0 || dayIndex > 6) {
                return;
            }

            const projectName = entry.project?.name || 'Unassigned';
            const existing = projectMap.get(projectName) || {
                project: projectName,
                totals: Array.from({ length: 7 }, () => 0),
            };

            const hours = entry.duration / 3600;
            existing.totals[dayIndex] += hours;
            totals[dayIndex] += hours;
            projectMap.set(projectName, existing);
        });

        const projectRows = Array.from(projectMap.values()).sort((left, right) => {
            const leftTotal = left.totals.reduce((sum, value) => sum + value, 0);
            const rightTotal = right.totals.reduce((sum, value) => sum + value, 0);
            return rightTotal - leftTotal;
        });

        return {
            rows: projectRows,
            dailyTotals: totals,
            weeklyTotal: totals.reduce((sum, value) => sum + value, 0),
        };
    }, [entries, weekStart]);

    const weekLabel = `${dayFormatter.format(weekDays[0])} - ${dayFormatter.format(weekDays[6])}`;
    const maxDailyHours = Math.max(...dailyTotals, 1);

    const handleWeekShift = (delta: number) => {
        setWeekAnchorDate((previous) => {
            const next = new Date(previous);
            next.setDate(next.getDate() + delta * 7);
            return next;
        });
    };

    const handleOpenDatePicker = () => {
        const dateInput = datePickerRef.current;
        if (!dateInput) {
            return;
        }

        const pickerApi = dateInput as HTMLInputElement & { showPicker?: () => void };
        if (typeof pickerApi.showPicker === 'function') {
            pickerApi.showPicker();
            return;
        }

        dateInput.click();
    };

    const handleDateSelected = (value: string) => {
        if (!value) {
            return;
        }

        setWeekAnchorDate(new Date(`${value}T12:00:00`));
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await api.get('/reports/export', { responseType: 'blob' });
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `timesheet-${weekStart.toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export timesheet CSV:', error);
            alert('Export failed. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="timesheet-container flex-1 w-full overflow-y-auto">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900">Weekly Timesheet</h1>
                    <p className="mt-1 text-sm text-slate-500">Review weekly totals by project and export structured time records.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button className="btn btn-outline" onClick={() => handleWeekShift(-1)}>
                        <ChevronLeft size={16} /> Prev Week
                    </button>
                    <div className="relative">
                        <button className="btn btn-outline" onClick={handleOpenDatePicker}>
                            <CalendarIcon size={16} /> {weekLabel}
                        </button>
                        <input
                            ref={datePickerRef}
                            type="date"
                            value={toISODate(weekAnchorDate)}
                            onChange={(event) => handleDateSelected(event.target.value)}
                            className="pointer-events-none absolute h-0 w-0 opacity-0"
                            tabIndex={-1}
                            aria-hidden="true"
                        />
                    </div>
                    <button className="btn btn-outline" onClick={() => handleWeekShift(1)}>
                        Next Week <ChevronRight size={16} />
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/reports')}>
                        <CheckCircle size={16} /> Approval Queue
                    </button>
                    <button className="btn btn-outline" onClick={() => void handleExport()} disabled={exporting}>
                        <Download size={16} /> {exporting ? 'Exporting...' : 'Export CSV'}
                    </button>
                </div>
            </div>

            <div className="card mb-6">
                <div className="card-body">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-base font-bold text-slate-900">Hours Logged Trend</h3>
                        <span className="text-sm font-medium text-slate-500">Weekly total: {weeklyTotal.toFixed(1)}h</span>
                    </div>
                    <div className="grid min-h-[150px] grid-cols-7 items-end gap-3">
                        {dailyTotals.map((hours, index) => {
                            const ratio = Math.max((hours / maxDailyHours) * 100, 4);
                            return (
                                <div key={`trend-${index}`} className="text-center">
                                    <div
                                        className="mx-auto min-h-[10px] w-full max-w-[52px] rounded-t-lg bg-primary transition-all"
                                        style={{ height: `${ratio}%`, opacity: hours > 0 ? 0.95 : 0.35 }}
                                        title={`${hours.toFixed(1)}h`}
                                    />
                                    <div className="mt-2 text-[11px] font-semibold text-slate-500">{dayFormatter.format(weekDays[index])}</div>
                                    <div className="text-xs font-bold text-slate-700">{hours.toFixed(1)}h</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="overflow-x-auto">
                    <table className="min-w-[880px] w-full border-collapse text-center">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Project</th>
                                {weekDays.map((day) => (
                                    <th key={day.toISOString()} className="px-2 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                                        {dayFormatter.format(day)}
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={9} className="px-6 py-7 text-sm text-slate-500">Loading weekly summary...</td>
                                </tr>
                            )}

                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-6 py-7 text-sm text-slate-500">No entries logged for this week yet.</td>
                                </tr>
                            )}

                            {!loading && rows.map((row) => {
                                const total = row.totals.reduce((sum, value) => sum + value, 0);

                                return (
                                    <tr key={row.project} className="border-b border-slate-100">
                                        <td className="px-4 py-3 text-left text-sm font-semibold text-slate-800">{row.project}</td>
                                        {row.totals.map((value, index) => (
                                            <td key={`${row.project}-${index}`} className="px-2 py-3">
                                                <input
                                                    type="text"
                                                    className="form-control mx-auto h-9 w-[74px] text-center font-semibold text-slate-700"
                                                    value={value > 0 ? value.toFixed(1) : '-'}
                                                    disabled
                                                    readOnly
                                                />
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 text-right text-sm font-bold text-primary">
                                            {total.toFixed(1)}h
                                        </td>
                                    </tr>
                                );
                            })}

                            {!loading && (
                                <tr className="border-t-2 border-slate-200 bg-slate-50">
                                    <td className="px-4 py-3 text-left text-sm font-black text-slate-900">Daily Total</td>
                                    {dailyTotals.map((value, index) => (
                                        <td key={`total-${index}`} className={`px-2 py-3 text-sm font-bold ${value > 0 ? 'text-slate-800' : 'text-slate-500'}`}>
                                            {value > 0 ? `${value.toFixed(1)}h` : '0h'}
                                        </td>
                                    ))}
                                    <td className="px-4 py-3 text-right text-base font-black text-slate-900">{weeklyTotal.toFixed(1)}h</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Timesheet;
