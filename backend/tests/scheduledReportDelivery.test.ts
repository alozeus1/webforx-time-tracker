process.env.AWS_SES_SMTP_ENDPOINT = 'smtp.test.amazonaws.com';
process.env.AWS_SMTP_USERNAME = 'test-user';
process.env.AWS_SMTP_PASSWORD = 'test-pass';
process.env.EMAIL_FROM = 'Web Forx Reports <reports@webforxtech.com>';

const mockSend = jest.fn();

jest.mock('nodemailer', () => ({
    __esModule: true,
    default: { createTransport: () => ({ sendMail: mockSend }) },
    createTransport: () => ({ sendMail: mockSend }),
}));

jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        scheduledReport: {
            findMany: jest.fn(),
            update: jest.fn(),
        },
        timeEntry: {
            findMany: jest.fn(),
        },
        user: {
            findMany: jest.fn(),
        },
    },
}));

import prisma from '../src/config/db';
import { processDueScheduledReports } from '../src/services/reporterService';

/**
 * Generation instant: Monday 2026-04-06 06:00 UTC.
 *
 * The previous complete week is therefore Monday 2026-03-30 to Sunday 2026-04-05.
 * Before the export-window fix this produced "2026-03-31 to 2026-04-06" — a
 * Tuesday-to-Monday window that dropped Monday 2026-03-30 entirely and included the
 * generation day itself, which had almost no data. That shape is asserted against
 * explicitly below so the regression cannot return.
 */
const monday = new Date('2026-04-06T06:00:00.000Z');

const WINDOW_DATES = [
    '2026-03-30', '2026-03-31', '2026-04-01',
    '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05',
];

/** One entry per day of the window, so the zero-entry gate passes by default. */
const fullWeekEntries = () =>
    WINDOW_DATES.map((date, index) => ({
        id: `entry-${index}`,
        task_description: 'Weekly delivery work',
        duration: 7200,
        start_time: new Date(`${date}T12:00:00.000Z`),
        status: 'approved',
        user: { email: 'employee@webforxtech.com' },
        project: { name: 'Platform Engineering' },
    }));

const baseSchedule = {
    frequency: 'weekly',
    day_of_week: 1,
    recipients: ['admin@webforxtech.com'],
    report_type: 'summary',
    organization_id: 'org-1',
    last_sent_at: null,
    created_at: new Date('2026-04-01T00:00:00.000Z'),
    reporting_timezone: 'UTC',
    schedule_generation_time: '06:00',
    validation_gates_enabled: true,
    validation_gate_zero_entries: true,
    validation_gate_window_integrity: true,
    validation_gate_required_days: [0, 1, 2, 3, 4, 5, 6],
};

beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ messageId: 'email-1' });
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(fullWeekEntries());
    (prisma.scheduledReport.update as jest.Mock).mockResolvedValue({});
    // resolveOrganizationAdmins and fetchDefaulters both call user.findMany, so the
    // mock has to discriminate: admins are looked up by role, defaulters are not.
    (prisma.user.findMany as jest.Mock).mockImplementation((args) => {
        if (args?.where?.role) {
            return Promise.resolve([{ email: 'admin@webforxtech.com' }]);
        }
        return Promise.resolve([
            { email: 'employee@webforxtech.com', first_name: 'Employee', last_name: 'One' },
            { email: 'defaulter@webforxtech.com', first_name: 'Defaulter', last_name: 'Two' },
        ]);
    });
});

describe('scheduled report delivery', () => {
    it('sends due weekly reports to configured recipients and records last_sent_at', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([{ id: 'schedule-1', ...baseSchedule }]);

        const result = await processDueScheduledReports(monday);

        expect(result).toMatchObject({ processed: 1, sent: 1, failed: 0, skipped: 0, blocked: 0 });
        expect(prisma.scheduledReport.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                is_active: true,
                AND: expect.any(Array),
            }),
        }));
        expect(prisma.user.findMany).toHaveBeenCalledWith({
            where: { organization_id: 'org-1', is_active: true },
            select: { email: true, first_name: true, last_name: true },
        });
        expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
            from: 'Web Forx Reports <reports@webforxtech.com>',
            to: ['admin@webforxtech.com'],
            subject: 'Weekly Summary Report - 2026-03-30 to 2026-04-05',
        }));
        expect(prisma.scheduledReport.update).toHaveBeenCalledWith({
            where: { id: 'schedule-1' },
            data: { last_sent_at: monday, last_validation_alert_window: null },
        });
    });

    it('REGRESSION: queries a Monday-to-Sunday window that excludes the generation day', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([{ id: 'schedule-1', ...baseSchedule }]);

        await processDueScheduledReports(monday);

        const entryCall = (prisma.timeEntry.findMany as jest.Mock).mock.calls.find(
            (call) => call[0]?.where?.organization_id === 'org-1' && call[0]?.include,
        );
        expect(entryCall).toBeDefined();

        const { gte, lt } = entryCall![0].where.start_time;
        expect(gte.toISOString()).toBe('2026-03-30T00:00:00.000Z'); // Monday 00:00
        expect(lt.toISOString()).toBe('2026-04-06T00:00:00.000Z'); // exclusive, next Monday 00:00

        // The old buggy window was 2026-03-31T00:00Z -> 2026-04-07T00:00Z.
        expect(gte.toISOString()).not.toBe('2026-03-31T00:00:00.000Z');
        expect(mockSend.mock.calls[0][0].subject).not.toContain('2026-04-06');
    });

    it('computes defaulters from the full window, not the billable-filtered entries, for report_type=billable', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'schedule-billable', ...baseSchedule, report_type: 'billable' },
        ]);

        await processDueScheduledReports(monday);

        // Three calls now: the zero-entry gate (select start_time only), then
        // fetchReportEntries (billable-filtered) and fetchDefaulters (unfiltered).
        const timeEntryCalls = (prisma.timeEntry.findMany as jest.Mock).mock.calls;
        expect(timeEntryCalls).toHaveLength(3);

        // The gate call is the only one selecting `start_time` alone.
        const gateCall = timeEntryCalls.find((call) => call[0]?.select?.start_time === true);
        expect(gateCall![0].where.is_billable).toBeUndefined();

        // fetchReportEntries uses `include`; fetchDefaulters selects the nested user.
        const entriesCall = timeEntryCalls.find((call) => call[0]?.include);
        const defaultersCall = timeEntryCalls.find((call) => call[0]?.select?.user);
        expect(entriesCall![0].where).toMatchObject({ is_billable: true });
        expect(defaultersCall![0].where.is_billable).toBeUndefined();
    });

    it('skips due schedules with no valid recipient instead of marking them sent', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'schedule-empty', ...baseSchedule, recipients: [] },
        ]);

        const result = await processDueScheduledReports(monday);

        expect(result).toMatchObject({ processed: 1, sent: 0, failed: 0, skipped: 1 });
        expect(mockSend).not.toHaveBeenCalled();
        expect(prisma.scheduledReport.update).not.toHaveBeenCalled();
    });

    it('keeps due schedules unsent when the email provider rejects delivery', async () => {
        mockSend.mockRejectedValueOnce(new Error('554 Message rejected: domain is not verified'));
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([{ id: 'schedule-failing', ...baseSchedule }]);

        const result = await processDueScheduledReports(monday);

        expect(result.failed).toBe(1);
        expect(result.failures[0]).toEqual({
            id: 'schedule-failing',
            message: 'SES SMTP error: 554 Message rejected: domain is not verified',
        });
        expect(prisma.scheduledReport.update).not.toHaveBeenCalled();
    });
});

describe('validation gates during delivery', () => {
    it('blocks delivery and alerts admins when a day in the window has zero entries', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([{ id: 'schedule-gap', ...baseSchedule }]);
        // Monday 2026-03-30 missing — precisely the defect that motivated this feature.
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(
            fullWeekEntries().filter((entry) => !entry.start_time.toISOString().startsWith('2026-03-30')),
        );

        const result = await processDueScheduledReports(monday);

        expect(result).toMatchObject({ processed: 1, sent: 0, failed: 0, blocked: 1 });
        expect(result.validationFailures[0]).toMatchObject({
            id: 'schedule-gap',
            window: '2026-03-30 to 2026-04-05',
        });
        expect(result.validationFailures[0].messages[0]).toContain('2026-03-30 contains zero entries');

        // The only email sent is the admin alert — never the report itself.
        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(mockSend.mock.calls[0][0].subject).toContain('Scheduled report blocked');
        expect(mockSend.mock.calls[0][0].attachments).toBeUndefined();

        // Regression (Codex review): the alert must go to organisation admins, NOT to
        // the report's delivery recipients. Those may be clients or payroll contacts,
        // and the alert carries internal diagnostics.
        expect(mockSend.mock.calls[0][0].to).toEqual(['admin@webforxtech.com']);
        expect(mockSend.mock.calls[0][0].to).not.toContain('admin@webforxtech.com.invalid');
        expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ role: { name: 'Admin' } }),
        }));

        // last_sent_at must not advance, but the alert marker is recorded.
        const updates = (prisma.scheduledReport.update as jest.Mock).mock.calls;
        expect(updates).toHaveLength(1);
        expect(updates[0][0].data).toEqual({ last_validation_alert_window: expect.any(Date) });
    });

    it('does not send the internal alert to the report recipients', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'schedule-external', ...baseSchedule, recipients: ['client@external-company.com'] },
        ]);
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(
            fullWeekEntries().filter((entry) => !entry.start_time.toISOString().startsWith('2026-03-30')),
        );

        await processDueScheduledReports(monday);

        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(mockSend.mock.calls[0][0].to).not.toContain('client@external-company.com');
        expect(mockSend.mock.calls[0][0].to).toEqual(['admin@webforxtech.com']);
    });

    it('alerts once per blocked window, not once per hourly tick', async () => {
        const blockedWindowStart = new Date('2026-03-30T00:00:00.000Z');
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'schedule-repeat', ...baseSchedule, last_validation_alert_window: blockedWindowStart },
        ]);
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(
            fullWeekEntries().filter((entry) => !entry.start_time.toISOString().startsWith('2026-03-30')),
        );

        const result = await processDueScheduledReports(monday);

        // Still correctly blocked, but silent — the endpoint is polled hourly and a
        // blocked report stays due all day, so re-alerting would send ~18 emails.
        expect(result.blocked).toBe(1);
        expect(mockSend).not.toHaveBeenCalled();
        expect(prisma.scheduledReport.update).not.toHaveBeenCalled();
    });

    it('re-alerts when a different window becomes blocked', async () => {
        // Marker from an older window must not suppress a new failure.
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'schedule-newwindow',
                ...baseSchedule,
                last_validation_alert_window: new Date('2026-03-23T00:00:00.000Z'),
            },
        ]);
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(
            fullWeekEntries().filter((entry) => !entry.start_time.toISOString().startsWith('2026-03-30')),
        );

        const result = await processDueScheduledReports(monday);

        expect(result.blocked).toBe(1);
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('does not record the alert marker when the alert email fails to send', async () => {
        // Regression (Codex review): recording the marker on a failed send would
        // suppress every retry and the blocked report would lose its only
        // notification. Originally written against Resend's resolved-value error
        // reporting; SES rejects properly, but the marker rule is what is under test.
        mockSend.mockRejectedValueOnce(new Error('554 Message rejected: domain is not verified'));
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([{ id: 'schedule-alertfail', ...baseSchedule }]);
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(
            fullWeekEntries().filter((entry) => !entry.start_time.toISOString().startsWith('2026-03-30')),
        );

        const result = await processDueScheduledReports(monday);

        expect(result.blocked).toBe(1);
        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(prisma.scheduledReport.update).not.toHaveBeenCalled();
    });

    it('clears the alert marker on a successful send so a later block re-alerts', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'schedule-recovered',
                ...baseSchedule,
                last_validation_alert_window: new Date('2026-03-30T00:00:00.000Z'),
            },
        ]);

        const result = await processDueScheduledReports(monday);

        expect(result.sent).toBe(1);
        expect(prisma.scheduledReport.update).toHaveBeenCalledWith({
            where: { id: 'schedule-recovered' },
            data: { last_sent_at: monday, last_validation_alert_window: null },
        });
    });

    it('sends normally when the empty day is excluded from the required day set', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'schedule-weekdays', ...baseSchedule, validation_gate_required_days: [1, 2, 3, 4, 5] },
        ]);
        // Saturday 2026-04-04 and Sunday 2026-04-05 empty.
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(
            fullWeekEntries().filter((entry) => {
                const iso = entry.start_time.toISOString();
                return !iso.startsWith('2026-04-04') && !iso.startsWith('2026-04-05');
            }),
        );

        const result = await processDueScheduledReports(monday);

        expect(result).toMatchObject({ sent: 1, blocked: 0 });
    });

    it('sends without checks when gates are disabled', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'schedule-nogate', ...baseSchedule, validation_gates_enabled: false },
        ]);
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);

        const result = await processDueScheduledReports(monday);

        expect(result).toMatchObject({ sent: 1, blocked: 0 });
    });
});

describe('generation timing', () => {
    it('does not generate before the Monday slot', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([{ id: 'schedule-early', ...baseSchedule }]);

        const result = await processDueScheduledReports(new Date('2026-04-06T05:59:00.000Z'));

        expect(result).toMatchObject({ sent: 0, skipped: 1 });
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('never generates on the window closing Sunday', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([{ id: 'schedule-sunday', ...baseSchedule }]);

        for (const hour of [0, 6, 12, 18, 23]) {
            jest.clearAllMocks();
            mockSend.mockResolvedValue({ messageId: 'e' });
            (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([{ id: 'schedule-sunday', ...baseSchedule }]);

            const sunday = new Date(Date.UTC(2026, 3, 5, hour, 0, 0)); // 2026-04-05 is a Sunday
            const result = await processDueScheduledReports(sunday);

            expect(result.sent).toBe(0);
            expect(mockSend).not.toHaveBeenCalled();
        }
    });

    it('resolves due-ness per report timezone rather than server time', async () => {
        // Gates off: this test isolates *timing*. The window boundaries shift by +12h
        // for Auckland, which would move the fixture entries into different local days.
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            {
                id: 'schedule-auckland',
                ...baseSchedule,
                reporting_timezone: 'Pacific/Auckland',
                validation_gates_enabled: false,
            },
        ]);

        // Sunday 2026-04-05 18:00 UTC is already Monday 2026-04-06 06:00 in
        // Pacific/Auckland (NZST, UTC+12). A server-time scheduler would see "Sunday"
        // and never fire this report.
        const result = await processDueScheduledReports(new Date('2026-04-05T18:00:00.000Z'));

        expect(result.sent).toBe(1);
        expect(mockSend.mock.calls[0][0].subject).toBe('Weekly Summary Report - 2026-03-30 to 2026-04-05');
    });

    it('a UTC-configured report is NOT yet due at the instant an Auckland one is', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'schedule-utc', ...baseSchedule, reporting_timezone: 'UTC', validation_gates_enabled: false },
        ]);

        const result = await processDueScheduledReports(new Date('2026-04-05T18:00:00.000Z'));

        expect(result).toMatchObject({ sent: 0, skipped: 1 });
    });

    it('does not re-send a window that has already been delivered', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'schedule-sent', ...baseSchedule, last_sent_at: new Date('2026-04-06T06:00:00.000Z') },
        ]);

        // A later tick on the same Monday must not send the same window twice.
        const result = await processDueScheduledReports(new Date('2026-04-06T14:00:00.000Z'));

        expect(result).toMatchObject({ sent: 0, skipped: 1 });
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends again once a new window has closed', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'schedule-next-week', ...baseSchedule, last_sent_at: new Date('2026-04-06T06:00:00.000Z') },
        ]);
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(
            ['2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-11', '2026-04-12'].map(
                (date, index) => ({
                    id: `next-${index}`,
                    task_description: 'Next week work',
                    duration: 3600,
                    start_time: new Date(`${date}T12:00:00.000Z`),
                    status: 'approved',
                    user: { email: 'employee@webforxtech.com' },
                    project: { name: 'Platform Engineering' },
                }),
            ),
        );

        const result = await processDueScheduledReports(new Date('2026-04-13T06:00:00.000Z'));

        expect(result.sent).toBe(1);
        expect(mockSend.mock.calls[0][0].subject).toBe('Weekly Summary Report - 2026-04-06 to 2026-04-12');
    });
});


describe('monthly schedules', () => {
    // Regression (Codex review): monthly windows were computed with
    // `new Date(y, m - 1, 1)` in SERVER-local time and returned no window object, so
    // the configured reporting timezone was displayed but never applied and the
    // validation gates never ran.
    const monthlyBase = { ...baseSchedule, frequency: 'monthly', day_of_week: null };

    const marchEntries = () =>
        Array.from({ length: 31 }, (_, index) => {
            const day = String(index + 1).padStart(2, '0');
            return {
                id: `m-${day}`,
                task_description: 'March work',
                duration: 3600,
                start_time: new Date(`2026-03-${day}T12:00:00.000Z`),
                status: 'approved',
                user: { email: 'employee@webforxtech.com' },
                project: { name: 'Platform Engineering' },
            };
        });

    it('builds the previous complete month in the reporting timezone', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'monthly-utc', ...monthlyBase, reporting_timezone: 'UTC' },
        ]);
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(marchEntries());

        // 1 April 2026, 06:00 UTC.
        const result = await processDueScheduledReports(new Date('2026-04-01T06:00:00.000Z'));

        expect(result.sent).toBe(1);
        expect(mockSend.mock.calls[0][0].subject).toBe('Monthly Summary Report - 2026-03-01 to 2026-03-31');

        const entriesCall = (prisma.timeEntry.findMany as jest.Mock).mock.calls.find((call) => call[0]?.include);
        expect(entriesCall![0].where.start_time.gte.toISOString()).toBe('2026-03-01T00:00:00.000Z');
        expect(entriesCall![0].where.start_time.lt.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    });

    it('shifts the month boundary for a non-UTC timezone', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'monthly-lagos', ...monthlyBase, reporting_timezone: 'Africa/Lagos', validation_gates_enabled: false },
        ]);
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(marchEntries());

        // 1 April 2026, 06:00 WAT (UTC+1) === 05:00 UTC.
        await processDueScheduledReports(new Date('2026-04-01T05:00:00.000Z'));

        const entriesCall = (prisma.timeEntry.findMany as jest.Mock).mock.calls.find((call) => call[0]?.include);
        // Africa/Lagos is UTC+1, so local 1 March 00:00 is 28 Feb 23:00 UTC.
        expect(entriesCall![0].where.start_time.gte.toISOString()).toBe('2026-02-28T23:00:00.000Z');
        expect(entriesCall![0].where.start_time.lt.toISOString()).toBe('2026-03-31T23:00:00.000Z');
    });

    it('is not due before the local generation slot on the 1st', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'monthly-early', ...monthlyBase, reporting_timezone: 'UTC' },
        ]);

        const result = await processDueScheduledReports(new Date('2026-04-01T05:59:00.000Z'));

        expect(result).toMatchObject({ sent: 0, skipped: 1 });
    });

    it('is not due on any day other than the 1st', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'monthly-notfirst', ...monthlyBase, reporting_timezone: 'UTC' },
        ]);

        const result = await processDueScheduledReports(new Date('2026-04-02T06:00:00.000Z'));

        expect(result).toMatchObject({ sent: 0, skipped: 1 });
    });

    it('runs the zero-entry gate but skips the weekly-only window-integrity gate', async () => {
        (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue([
            { id: 'monthly-gap', ...monthlyBase, reporting_timezone: 'UTC' },
        ]);
        // Drop 15 March — a month is not 7 days ending Sunday, so if the
        // window-integrity gate were applied it would fail for the wrong reason.
        (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(
            marchEntries().filter((entry) => !entry.start_time.toISOString().startsWith('2026-03-15')),
        );

        const result = await processDueScheduledReports(new Date('2026-04-01T06:00:00.000Z'));

        expect(result.blocked).toBe(1);
        expect(result.validationFailures[0].messages).toHaveLength(1);
        expect(result.validationFailures[0].messages[0]).toContain('2026-03-15 contains zero entries');
        expect(result.validationFailures[0].messages[0]).not.toContain('7 days ending Sunday');
    });
});
