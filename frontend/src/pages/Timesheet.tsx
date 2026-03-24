import React, { useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, CheckCircle } from 'lucide-react';
import api from '../services/api';
import type { TimeEntrySummary } from '../types/api';

const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const startOfWeek = (date: Date) => {
    const copy = new Date(date);
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
};

const Timesheet: React.FC = () => {
    const [entries, setEntries] = useState<TimeEntrySummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadEntries = async () => {
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

    const weekStart = useMemo(() => startOfWeek(new Date()), []);
    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, index) => {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + index);
            return day;
        }),
        [weekStart]
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

    return (
        <div className="timesheet-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Weekly Timesheet</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Your submitted and pending entries for the current week.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline" style={{ gap: '8px' }}>
                        <CalendarIcon size={16} /> {weekLabel}
                    </button>
                    <button className="btn btn-primary" style={{ gap: '8px' }} disabled>
                        <CheckCircle size={16} /> Submission Handled by Approvals
                    </button>
                </div>
            </div>

            <div className="card">
                <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', textAlign: 'center' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-subtle)' }}>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 500, color: 'var(--text-muted)' }}>Project</th>
                                {weekDays.map((day) => (
                                    <th key={day.toISOString()} style={{ padding: '12px 8px', fontWeight: 500, color: 'var(--text-muted)' }}>
                                        {dayFormatter.format(day)}
                                    </th>
                                ))}
                                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={9} style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading weekly summary...</td>
                                </tr>
                            )}

                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td colSpan={9} style={{ padding: '24px', color: 'var(--text-muted)' }}>No entries logged for this week yet.</td>
                                </tr>
                            )}

                            {!loading && rows.map((row) => {
                                const total = row.totals.reduce((sum, value) => sum + value, 0);

                                return (
                                    <tr key={row.project} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '16px', textAlign: 'left', fontWeight: 500 }}>{row.project}</td>
                                        {row.totals.map((value, index) => (
                                            <td key={`${row.project}-${index}`} style={{ padding: '16px 8px' }}>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    style={{ textAlign: 'center', height: '36px', width: '72px', margin: '0 auto', backgroundColor: 'var(--bg-main)' }}
                                                    value={value > 0 ? value.toFixed(1) : '-'}
                                                    disabled
                                                    readOnly
                                                />
                                            </td>
                                        ))}
                                        <td style={{ padding: '16px', textAlign: 'right', fontWeight: 600, color: 'var(--color-primary)' }}>
                                            {total.toFixed(1)}h
                                        </td>
                                    </tr>
                                );
                            })}

                            {!loading && (
                                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderTop: '2px solid var(--border-color)' }}>
                                    <td style={{ padding: '16px', textAlign: 'left', fontWeight: 700 }}>Daily Total</td>
                                    {dailyTotals.map((value, index) => (
                                        <td key={`total-${index}`} style={{ padding: '16px 8px', fontWeight: 600, color: value > 0 ? 'var(--text-main)' : 'var(--text-muted)' }}>
                                            {value > 0 ? `${value.toFixed(1)}h` : '0h'}
                                        </td>
                                    ))}
                                    <td style={{ padding: '16px', textAlign: 'right', fontWeight: 700, fontSize: '1.1rem' }}>{weeklyTotal.toFixed(1)}h</td>
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
