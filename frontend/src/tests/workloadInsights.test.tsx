import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WorkloadInsights from '../components/WorkloadInsights';
import type { UserWellbeingSummary } from '../types/api';

const makeWellbeing = (overrides: Partial<UserWellbeingSummary> = {}): UserWellbeingSummary => ({
    sevenDayHours: 52.4,
    averageDailyHours: 7.49,
    burnoutThresholdHours: 50,
    cautionThresholdHours: 45,
    hoursUntilBurnout: 0,
    weeklyHourLimit: 40,
    status: 'burnout_risk',
    workloadAlerts: [
        {
            id: 'alert-1',
            type: 'burnout_alert',
            message: 'Burnout Alert: You have logged 52.4 hours in the last 7 days.',
            is_read: false,
            created_at: '2026-03-28T10:00:00.000Z',
        },
    ],
    ...overrides,
});

describe('WorkloadInsights', () => {
    it('renders transparent workload and recovery wording for high logged hours', () => {
        render(<WorkloadInsights wellbeing={makeWellbeing()} />);

        expect(screen.getByText('Your recent workload is too high')).toBeInTheDocument();
        expect(screen.getByText('Workload & Recovery')).toBeInTheDocument();
        expect(screen.getByText('High Workload')).toBeInTheDocument();
        expect(screen.getByText('Recent Workload Alerts')).toBeInTheDocument();
        expect(screen.getByText(/Workload alert: You have logged 52.4 hours/i)).toBeInTheDocument();
        expect(screen.getByText(/planning threshold, not a medical assessment/i)).toBeInTheDocument();
        expect(screen.queryByText(/Burnout Monitor/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Burnout Alert:/i)).not.toBeInTheDocument();
    });

    it('shows a balanced state without the warning banner when workload is healthy', () => {
        render(
            <WorkloadInsights
                wellbeing={makeWellbeing({
                    sevenDayHours: 32,
                    averageDailyHours: 4.57,
                    hoursUntilBurnout: 18,
                    status: 'balanced',
                    workloadAlerts: [],
                })}
            />,
        );

        expect(screen.queryByText('Your recent workload is too high')).not.toBeInTheDocument();
        expect(screen.getByText('Balanced')).toBeInTheDocument();
        expect(screen.getByText(/No recent workload alerts/i)).toBeInTheDocument();
    });
});
