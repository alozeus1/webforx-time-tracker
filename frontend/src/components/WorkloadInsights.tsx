import React from 'react';
import type { UserWellbeingSummary } from '../types/api';

const statusConfig: Record<UserWellbeingSummary['status'], {
    label: string;
    chipClass: string;
    panelClass: string;
    accentClass: string;
    bannerTitle: string;
    bannerMessage: (wellbeing: UserWellbeingSummary) => string;
}> = {
    balanced: {
        label: 'Balanced',
        chipClass: 'bg-emerald-100 text-emerald-700',
        panelClass: 'border-emerald-200 bg-emerald-50',
        accentClass: 'text-emerald-700',
        bannerTitle: 'Workload is in a healthy range',
        bannerMessage: (wellbeing) => `You have logged ${wellbeing.sevenDayHours.toFixed(1)}h in the last 7 days.`,
    },
    approaching_burnout: {
        label: 'Approaching Burnout',
        chipClass: 'bg-amber-100 text-amber-700',
        panelClass: 'border-amber-200 bg-amber-50',
        accentClass: 'text-amber-700',
        bannerTitle: 'Recovery time is recommended soon',
        bannerMessage: (wellbeing) =>
            `You have logged ${wellbeing.sevenDayHours.toFixed(1)}h in the last 7 days. Try to protect recovery time before you cross ${wellbeing.burnoutThresholdHours}h.`,
    },
    burnout_risk: {
        label: 'Burnout Risk',
        chipClass: 'bg-rose-100 text-rose-700',
        panelClass: 'border-rose-200 bg-rose-50',
        accentClass: 'text-rose-700',
        bannerTitle: 'Your recent workload is too high',
        bannerMessage: (wellbeing) =>
            `You have logged ${wellbeing.sevenDayHours.toFixed(1)}h in the last 7 days. Reduce workload and take recovery time as soon as possible.`,
    },
};

const alertLabelMap: Record<string, string> = {
    burnout_alert: 'Burnout alert',
    overtime_alert: 'Weekly limit alert',
};

interface WorkloadInsightsProps {
    wellbeing: UserWellbeingSummary;
}

const WorkloadInsights: React.FC<WorkloadInsightsProps> = ({ wellbeing }) => {
    const config = statusConfig[wellbeing.status];
    const showBanner = wellbeing.status !== 'balanced';

    return (
        <section className="space-y-4">
            {showBanner && (
                <div
                    className={`rounded-2xl border px-5 py-4 shadow-sm ${config.panelClass}`}
                    role="status"
                    aria-live="polite"
                >
                    <div className="flex items-start gap-3">
                        <span className={`material-symbols-outlined mt-0.5 ${config.accentClass}`}>health_and_safety</span>
                        <div className="space-y-1">
                            <p className={`text-sm font-bold ${config.accentClass}`}>{config.bannerTitle}</p>
                            <p className="text-sm text-slate-700">{config.bannerMessage(wellbeing)}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Workload & Recovery</p>
                            <h2 className="mt-1 text-lg font-black text-slate-900">Burnout Monitor</h2>
                        </div>
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${config.chipClass}`}>
                            {config.label}
                        </span>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last 7 Days</p>
                            <p className="mt-2 text-2xl font-black text-slate-900">{wellbeing.sevenDayHours.toFixed(1)}h</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Daily Average</p>
                            <p className="mt-2 text-2xl font-black text-slate-900">{wellbeing.averageDailyHours.toFixed(1)}h</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Weekly Limit</p>
                            <p className="mt-2 text-2xl font-black text-slate-900">
                                {wellbeing.weeklyHourLimit != null ? `${wellbeing.weeklyHourLimit}h` : 'Off'}
                            </p>
                        </div>
                    </div>

                    <div className="mt-5 space-y-2 text-sm text-slate-600">
                        <p>
                            Burnout alerts start at <span className="font-semibold text-slate-900">{wellbeing.burnoutThresholdHours}h</span> logged in 7 days.
                        </p>
                        <p>
                            {wellbeing.status === 'burnout_risk'
                                ? 'You are already above the threshold.'
                                : `${wellbeing.hoursUntilBurnout.toFixed(1)}h remaining before the burnout threshold.`}
                        </p>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Alert History</p>
                            <h2 className="mt-1 text-lg font-black text-slate-900">Recent Workload Alerts</h2>
                        </div>
                    </div>

                    <div className="mt-4 space-y-3">
                        {wellbeing.workloadAlerts.length === 0 && (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                No recent workload alerts. This history will show burnout and weekly-limit warnings when they happen.
                            </div>
                        )}
                        {wellbeing.workloadAlerts.map((alert) => (
                            <div key={alert.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                        {alertLabelMap[alert.type] || alert.type.replace(/_/g, ' ')}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                        {new Date(alert.created_at).toLocaleString()}
                                    </span>
                                </div>
                                <p className="mt-2 text-sm text-slate-800">{alert.message}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default WorkloadInsights;
