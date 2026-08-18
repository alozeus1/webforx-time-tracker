import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import prisma from '../config/db';
import { env } from '../config/env';
import { generateExecutiveReportPdf } from './executiveReportTemplate';
import {
    DEFAULT_GENERATION_TIME,
    DEFAULT_REPORTING_TIMEZONE,
    ReportWindow,
    getPreviousCompleteMonth,
    getPreviousCompleteWeek,
    isGenerationDue,
    isMonthlyGenerationDue,
    isValidTimeZone,
} from '../utils/reportWindow';
import { getMailProvider, sendMail } from './mailer';
import {
    DEFAULT_VALIDATION_GATE_CONFIG,
    ValidationGateConfig,
    ValidationGateError,
    ValidationOutcome,
    normalizeRequiredDays,
    runValidationGates,
} from './reportValidationService';

type ReportEntry = {
    user: { email: string; first_name?: string | null; last_name?: string | null };
    project: { name: string } | null;
    task_description: string;
    duration: number;
    start_time: Date;
    status: string;
};

export type DefaulterUser = {
    email: string;
    first_name?: string | null;
    last_name?: string | null;
};

type ScheduledReportRecord = {
    id: string;
    frequency: string;
    day_of_week: number | null;
    recipients: unknown;
    report_type: string;
    organization_id: string;
    last_sent_at?: Date | string | null;
    reporting_timezone?: string | null;
    schedule_generation_time?: string | null;
    validation_gates_enabled?: boolean | null;
    validation_gate_zero_entries?: boolean | null;
    validation_gate_window_integrity?: boolean | null;
    validation_gate_required_days?: unknown;
    last_validation_alert_window?: Date | string | null;
};

export type ScheduledReportRunResult = {
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
    /** Reports halted by a validation gate. Distinct from `failed` (delivery errors). */
    blocked: number;
    failures: Array<{ id: string; message: string }>;
    validationFailures: Array<{ id: string; window: string; messages: string[] }>;
};

/**
 * True when the email transport is configured (AWS SES SMTP).
 * Delivery itself goes through services/mailer.ts, which throws on failure.
 */
const isMailConfigured = (): boolean => getMailProvider() !== 'none';

const startOfDay = (date: Date): Date => {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
};

const addDays = (date: Date, days: number): Date => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const getRecipients = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];

    return Array.from(
        new Set(
            value
                .filter((entry): entry is string => typeof entry === 'string')
                .map((entry) => entry.trim().toLowerCase())
                .filter(Boolean),
        ),
    );
};

/**
 * Resolve the export window for a report.
 *
 * Weekly reports use the previous *complete* Monday-to-Sunday week in the report's
 * reporting timezone. This replaces the former `[now-6d 00:00, now+1d 00:00)`
 * server-local calculation, which produced a Tuesday-to-Monday window and dropped a
 * working day from every weekly report. See `utils/reportWindow.ts`.
 *
 * `end` is exclusive for query purposes — callers pass it straight to `lt:`.
 */
const buildReportWindow = (
    frequency: string,
    now: Date,
    timeZone: string,
): { start: Date; end: Date; label: string; window: ReportWindow } => {
    // Monthly windows are now timezone-aware too. They previously used
    // `new Date(y, m - 1, 1)` in server-local time, which is the same defect class
    // as the old weekly window: a report configured for Africa/Lagos running on a
    // UTC server placed the month boundary an hour off and mis-assigned entries
    // logged in the first or last hour of the month, while its UI displayed a
    // timezone that was never actually applied.
    const window = frequency === 'monthly'
        ? getPreviousCompleteMonth(now, timeZone)
        : getPreviousCompleteWeek(now, timeZone);

    return { start: window.start, end: window.endExclusive, label: window.label, window };
};

const resolveTimeZone = (value: unknown): string => {
    if (typeof value === 'string' && isValidTimeZone(value)) return value.trim();
    if (value) {
        console.warn(`[ReporterService] Invalid reporting timezone "${String(value)}". Falling back to ${DEFAULT_REPORTING_TIMEZONE}.`);
    }
    return DEFAULT_REPORTING_TIMEZONE;
};

const resolveGateConfig = (report: ScheduledReportRecord): ValidationGateConfig => ({
    enabled: report.validation_gates_enabled ?? DEFAULT_VALIDATION_GATE_CONFIG.enabled,
    zeroEntries: report.validation_gate_zero_entries ?? DEFAULT_VALIDATION_GATE_CONFIG.zeroEntries,
    windowIntegrity: report.validation_gate_window_integrity ?? DEFAULT_VALIDATION_GATE_CONFIG.windowIntegrity,
    requiredDays: normalizeRequiredDays(report.validation_gate_required_days),
});

/**
 * Resolve the administrators who should receive internal operational alerts.
 *
 * Deliberately NOT the report's delivery recipients. A scheduled report may be
 * addressed to clients, payroll contacts, or other external stakeholders; sending
 * them a gate-failure notice would leak internal diagnostics (report IDs, per-day
 * entry counts, window internals) outside the organisation while potentially
 * alerting no administrator at all.
 */
const resolveOrganizationAdmins = async (organizationId?: string): Promise<string[]> => {
    if (!organizationId) return [];

    try {
        const admins = await prisma.user.findMany({
            where: {
                organization_id: organizationId,
                is_active: true,
                role: { name: 'Admin' },
            },
            select: { email: true },
        });

        return Array.from(new Set(
            admins
                .map((admin) => admin.email?.trim().toLowerCase())
                .filter((email): email is string => Boolean(email)),
        ));
    } catch (error) {
        console.error(`[ReporterService] Failed to resolve admins for organization ${organizationId}:`, error);
        return [];
    }
};

/**
 * Alerts administrators that a report was suppressed by a validation gate.
 *
 * Best-effort by design: a failure to send the alert must not mask the original
 * validation failure, which is already in the run result and the logs. It does,
 * however, report whether it succeeded, so the caller only records the alert as
 * delivered when it actually was — otherwise the de-duplication marker would
 * suppress every retry and the blocked report would lose its only notification.
 */
const notifyAdminsOfValidationFailure = async ({
    reportId,
    adminRecipients,
    window,
    outcome,
}: {
    reportId: string;
    adminRecipients: string[];
    window: ReportWindow;
    outcome: ValidationOutcome;
}): Promise<boolean> => {
    const mailConfigured = isMailConfigured();
    if (!mailConfigured || adminRecipients.length === 0) {
        console.error(
            `[ReporterService] Report ${reportId} was blocked by a validation gate but NO ADMIN ALERT COULD BE SENT `
            + `(${!mailConfigured ? 'no email provider configured — set AWS_SES_SMTP_ENDPOINT/AWS_SMTP_USERNAME/AWS_SMTP_PASSWORD' : 'no active Admin users found for the organization'}). `
            + 'The failure is recorded in the logs and the cron run result only.',
        );
        return false;
    }

    const rows = outcome.results
        .map((result) => `<li><strong>${result.gate}</strong>: ${result.passed ? 'PASS' : `FAIL — ${escapeHtml(result.message ?? '')}`}<br/><code>${escapeHtml(JSON.stringify(result.details))}</code></li>`)
        .join('');

    try {
        // sendMail throws on failure. That matters here: without it, a blocked report
        // would be recorded as alerted while nobody was actually told.
        await sendMail({
            to: adminRecipients,
            subject: `[Action required] Scheduled report blocked — ${window.label}`,
            html: `
                <p>A scheduled report was <strong>not generated</strong> because one or more validation gates failed.</p>
                <p><strong>Report ID:</strong> ${escapeHtml(reportId)}<br/>
                   <strong>Export window:</strong> ${escapeHtml(window.label)} (${escapeHtml(window.timeZone)})<br/>
                   <strong>Window UTC range:</strong> ${window.start.toISOString()} to ${window.end.toISOString()}</p>
                <ul>${rows}</ul>
                <p>No report was sent, and no report recipient has been notified. Resolve the underlying data
                   issue and the report will send on the next hourly tick, or adjust the report's validation
                   gate configuration if the window is legitimately empty on those days.</p>
                <p>Troubleshooting: <code>docs/scheduled-report-windows.md</code></p>
            `,
        });

        console.log(`[ReporterService] Validation-failure alert sent for report ${reportId} to ${adminRecipients.length} admin(s).`);
        return true;
    } catch (error) {
        console.error(`[ReporterService] Failed to send validation-failure alert for report ${reportId}:`, error);
        return false;
    }
};

const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const getReportTitle = (frequency: string, reportType: string, label: string): string => {
    const normalizedType = reportType === 'billable' ? 'Billable hours' : reportType === 'detailed' ? 'Detailed' : 'Summary';
    const normalizedFrequency = frequency === 'monthly' ? 'Monthly' : 'Weekly';
    return `${normalizedFrequency} ${normalizedType} Report - ${label}`;
};

const generateReportPdf = (title: string, entries: ReportEntry[], defaulters: DefaulterUser[] = []): ArrayBuffer => {
    if (env.executiveReportTemplateEnabled) {
        return generateExecutiveReportPdf(title, entries, defaulters);
    }

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(title, 14, 22);

    const tableData = entries.map((entry) => [
        entry.user.email,
        entry.project?.name || 'Unassigned',
        entry.task_description,
        (entry.duration / 3600).toFixed(2),
        new Date(entry.start_time).toLocaleString(),
        entry.status,
    ]);

    defaulters.forEach((defaulter) => {
        tableData.push([defaulter.email, '-', 'No time logged this period', '0.00', '-', 'DEFAULTER']);
    });

    autoTable(doc, {
        startY: 30,
        head: [['Engineer', 'Project', 'Task', 'Hours', 'Start Time', 'Status']],
        body: tableData.length > 0 ? tableData : [['No time entries found for this report window.', '', '', '', '', '']],
    });

    return doc.output('arraybuffer');
};

const sendPdfReport = async ({
    to,
    subject,
    html,
    filename,
    pdfBuffer,
    allowMissingProvider,
}: {
    to: string[];
    subject: string;
    html: string;
    filename: string;
    pdfBuffer: ArrayBuffer;
    allowMissingProvider: boolean;
}): Promise<boolean> => {
    if (!isMailConfigured()) {
        const message = '[ReporterService] No email provider configured. Skipping report email dispatch.';
        if (allowMissingProvider) {
            console.warn(message);
            return false;
        }
        throw new Error(
            'No email provider is configured; scheduled report email was not sent. '
            + 'Set AWS_SES_SMTP_ENDPOINT, AWS_SMTP_USERNAME and AWS_SMTP_PASSWORD.',
        );
    }

    // Throws on failure for both transports — see services/mailer.ts.
    await sendMail({
        to,
        subject,
        html,
        attachments: [{ filename, content: Buffer.from(pdfBuffer) }],
    });

    return true;
};

const fetchReportEntries = async (
    start: Date,
    end: Date,
    reportType: string,
    organizationId?: string,
): Promise<ReportEntry[]> => {
    return prisma.timeEntry.findMany({
        where: {
            start_time: { gte: start, lt: end },
            ...(reportType === 'billable' ? { is_billable: true } : {}),
            ...(organizationId ? { organization_id: organizationId } : {}),
        },
        include: { user: true, project: true },
        orderBy: { start_time: 'asc' },
    }) as Promise<ReportEntry[]>;
};

// Defaulter status is "did this active user log any time at all in the
// window" — deliberately independent of a report's own display filter (e.g.
// report_type='billable'). A user who only logged non-billable hours is not
// a defaulter, even though a billable report's own entries table won't show
// their work, so this queries the window fresh rather than reusing
// fetchReportEntries' (possibly type-filtered) result.
const fetchDefaulters = async (
    start: Date,
    end: Date,
    organizationId?: string,
): Promise<DefaulterUser[]> => {
    const [activeUsers, loggedEntries] = await Promise.all([
        prisma.user.findMany({
            where: {
                is_active: true,
                ...(organizationId ? { organization_id: organizationId } : {}),
            },
            select: { email: true, first_name: true, last_name: true },
        }),
        prisma.timeEntry.findMany({
            where: {
                start_time: { gte: start, lt: end },
                ...(organizationId ? { organization_id: organizationId } : {}),
            },
            select: { user: { select: { email: true } } },
        }),
    ]);

    const loggedEmails = new Set(loggedEntries.map((entry) => entry.user.email.toLowerCase()));
    return activeUsers.filter((user) => !loggedEmails.has(user.email.toLowerCase()));
};

// Falls back to this address for any organization that hasn't configured its
// own recipient yet under Organization.settings.daily_report_recipient.
const DEFAULT_DAILY_REPORT_RECIPIENT = 'admin@webforxtech.com';

const resolveDailyReportRecipient = (settings: unknown): string => {
    const raw = (settings as { daily_report_recipient?: unknown } | null | undefined)?.daily_report_recipient;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : DEFAULT_DAILY_REPORT_RECIPIENT;
};

export const generateAndEmailDailyReport = async (): Promise<void> => {
    console.log('[ReporterService] Fetching timesheets for daily summary...');
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);

    const organizations = await prisma.organization.findMany({
        where: { status: 'active' },
        select: { id: true, name: true, settings: true },
    });

    for (const org of organizations) {
        const recipient = resolveDailyReportRecipient(org.settings);
        try {
            const [entries, defaulters] = await Promise.all([
                fetchReportEntries(today, tomorrow, 'summary', org.id),
                fetchDefaulters(today, tomorrow, org.id),
            ]);
            const title = `Daily Autonomous Time Report - ${today.toLocaleDateString()}`;
            const pdfBuffer = generateReportPdf(title, entries, defaulters);

            console.log(`[ReporterService] Sending daily report for ${org.name} to ${recipient}...`);
            const sent = await sendPdfReport({
                to: [recipient],
                subject: `Daily Hours Report - ${today.toLocaleDateString()}`,
                html: `<p>Hello,</p><p>Please find attached the automated daily timesheet summary for ${org.name}.</p>`,
                filename: `Report-${formatDate(today)}.pdf`,
                pdfBuffer,
                allowMissingProvider: true,
            });

            if (sent) {
                console.log(`[ReporterService] Successfully dispatched daily report email for ${org.name}.`);
            }
        } catch (error) {
            console.error(`[ReporterService] Daily report failed for organization ${org.id} (${org.name}):`, error);
        }
    }
};

export const processDueScheduledReports = async (now = new Date()): Promise<ScheduledReportRunResult> => {

    // Due-ness is no longer filtered in SQL for either frequency. Weekly reports used
    // to be matched on `day_of_week` and monthly ones on a server-local
    // `now.getDate() === 1`; both are wrong once each report carries its own
    // reporting timezone, because a report on Pacific/Auckland and one on
    // America/Chicago become due at different UTC instants. The old server-local
    // `last_sent_at < startOfDay(now)` guard had the same flaw and double-sent for
    // zones far from UTC.
    //
    // Candidates are therefore fetched broadly and filtered per report below, using
    // the reporting timezone for due-ness and the resolved window for
    // de-duplication — exact, because each window is a distinct calendar period.
    const reports = await prisma.scheduledReport.findMany({
        where: {
            is_active: true,
            AND: [{ OR: [{ frequency: 'weekly' }, { frequency: 'monthly' }] }],
        },
        orderBy: { created_at: 'asc' },
    }) as ScheduledReportRecord[];

    const result: ScheduledReportRunResult = {
        processed: reports.length,
        sent: 0,
        failed: 0,
        skipped: 0,
        blocked: 0,
        failures: [],
        validationFailures: [],
    };

    for (const report of reports) {
        const timeZone = resolveTimeZone(report.reporting_timezone);
        const generationTime = report.schedule_generation_time?.trim() || DEFAULT_GENERATION_TIME;

        // Weekly reports run on Monday at the configured local time, never on the
        // window's closing Sunday. Monthly reports run on the 1st of the month at the
        // same local slot. Both are evaluated in the reporting timezone; anything not
        // yet at its slot is left for a later tick rather than being generated against
        // an incomplete window.
        const due = report.frequency === 'monthly'
            ? isMonthlyGenerationDue(now, timeZone, generationTime)
            : isGenerationDue(now, timeZone, generationTime);
        if (!due) {
            result.skipped += 1;
            continue;
        }

        const window = buildReportWindow(report.frequency, now, timeZone);

        // Idempotency, compared against the window itself rather than a server-local
        // "start of today": once `last_sent_at` is at or after the window's exclusive
        // end, that period's report has already gone out, whatever timezone the
        // scheduler ticked in.
        const lastSentAt = report.last_sent_at ? new Date(report.last_sent_at) : null;
        if (lastSentAt && lastSentAt.getTime() >= window.window.endExclusive.getTime()) {
            result.skipped += 1;
            continue;
        }

        const recipients = getRecipients(report.recipients);
        if (recipients.length === 0) {
            result.skipped += 1;
            console.warn(`[ReporterService] Scheduled report ${report.id} has no valid recipients. Skipping.`);
            continue;
        }

        try {
            // Gates run before any data is rendered. A report that would be built on an
            // incomplete window is suppressed and alerted on, never sent — the report is
            // a compliance artefact and wrong data is worse than no data.
            const gateConfig = resolveGateConfig(report);
            const outcome = await runValidationGates({
                window: window.window,
                config: {
                    ...gateConfig,
                    // The window-integrity gate asserts "exactly 7 days ending Sunday",
                    // which is meaningless for a calendar month. Monthly reports still
                    // get the zero-entry gate.
                    windowIntegrity: gateConfig.windowIntegrity && report.frequency !== 'monthly',
                },
                organizationId: report.organization_id,
                reportId: report.id,
            });

            if (!outcome.passed) {
                // One alert per blocked window, not one per tick. The endpoint is polled
                // hourly and a blocked report stays due for the rest of its generation
                // day, so without this an admin would receive ~18 identical emails for a
                // single missing day of data.
                const alreadyAlerted = report.last_validation_alert_window
                    && new Date(report.last_validation_alert_window).getTime() === window.window.start.getTime();

                if (alreadyAlerted) {
                    console.log(`[ReporterService] Report ${report.id} still blocked for window ${window.label}; admins already alerted, suppressing duplicate.`);
                } else {
                    const adminRecipients = await resolveOrganizationAdmins(report.organization_id);
                    const alerted = await notifyAdminsOfValidationFailure({
                        reportId: report.id,
                        adminRecipients,
                        window: window.window,
                        outcome,
                    });

                    // Only record the marker when the alert actually went out. Recording
                    // it on failure would suppress every retry and the blocked report
                    // would lose its only notification entirely.
                    if (alerted) {
                        await prisma.scheduledReport.update({
                            where: { id: report.id },
                            data: { last_validation_alert_window: window.window.start },
                        });
                    }
                }

                throw new ValidationGateError(outcome.failures.join(' '), outcome, window.window);
            }

            const [entries, defaulters] = await Promise.all([
                fetchReportEntries(window.start, window.end, report.report_type, report.organization_id),
                fetchDefaulters(window.start, window.end, report.organization_id),
            ]);
            const title = getReportTitle(report.frequency, report.report_type, window.label);
            const pdfBuffer = generateReportPdf(title, entries, defaulters);

            await sendPdfReport({
                to: recipients,
                subject: title,
                html: `<p>Hello,</p><p>Please find attached your ${report.frequency} ${report.report_type} time report for ${window.label} (${timeZone}).</p>`,
                filename: `${report.frequency}-${report.report_type}-report-${formatDate(now)}.pdf`,
                pdfBuffer,
                allowMissingProvider: false,
            });

            await prisma.scheduledReport.update({
                where: { id: report.id },
                // Clearing the alert marker on success means a future block on a later
                // window alerts again immediately, rather than being suppressed by a
                // stale marker from a previously resolved failure.
                data: { last_sent_at: now, last_validation_alert_window: null },
            });

            result.sent += 1;
            console.log(`[ReporterService] Sent scheduled report ${report.id} (${window.label}, ${timeZone}) to ${recipients.join(', ')}.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown scheduled report delivery error';

            if (error instanceof ValidationGateError) {
                // Validation failures are counted separately from delivery failures:
                // "blocked" means the system correctly refused to send, which is a
                // successful outcome for the gate even though no report went out.
                result.blocked += 1;
                result.validationFailures.push({
                    id: report.id,
                    window: error.window.label,
                    messages: error.outcome.failures,
                });
                console.error(`[ReporterService] Scheduled report ${report.id} BLOCKED by validation gates: ${message}`);
                continue;
            }

            result.failed += 1;
            result.failures.push({ id: report.id, message });
            console.error(`[ReporterService] Scheduled report ${report.id} failed:`, error);
        }
    }

    return result;
};
