import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { Resend } from 'resend';
import prisma from '../config/db';
import { env } from '../config/env';
import { generateExecutiveReportPdf } from './executiveReportTemplate';
import {
    DEFAULT_GENERATION_TIME,
    DEFAULT_REPORTING_TIMEZONE,
    ReportWindow,
    getPreviousCompleteWeek,
    isGenerationDue,
    isValidTimeZone,
} from '../utils/reportWindow';
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

let resendClient: Resend | null = null;

const getResendClient = (): Resend | null => {
    if (!env.resendApiKey) return null;
    if (!resendClient) {
        resendClient = new Resend(env.resendApiKey);
    }
    return resendClient;
};

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

const startOfPreviousMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth() - 1, 1);
const startOfCurrentMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);
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
): { start: Date; end: Date; label: string; window?: ReportWindow } => {
    if (frequency === 'monthly') {
        const start = startOfPreviousMonth(now);
        const end = startOfCurrentMonth(now);
        return { start, end, label: `${formatDate(start)} to ${formatDate(addDays(end, -1))}` };
    }

    const window = getPreviousCompleteWeek(now, timeZone);
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
 * Alerts administrators that a report was suppressed by a validation gate.
 *
 * Deliberately best-effort: a failure to send the alert must not mask the original
 * validation failure, which is already recorded in the run result and the logs.
 */
const notifyAdminsOfValidationFailure = async ({
    reportId,
    recipients,
    window,
    outcome,
}: {
    reportId: string;
    recipients: string[];
    window: ReportWindow;
    outcome: ValidationOutcome;
}): Promise<void> => {
    const client = getResendClient();
    if (!client || recipients.length === 0) {
        console.warn(`[ReporterService] Cannot alert on validation failure for report ${reportId} (no email provider or recipients).`);
        return;
    }

    const rows = outcome.results
        .map((result) => `<li><strong>${result.gate}</strong>: ${result.passed ? 'PASS' : `FAIL — ${result.message}`}<br/><code>${escapeHtml(JSON.stringify(result.details))}</code></li>`)
        .join('');

    try {
        await client.emails.send({
            from: env.emailFrom,
            to: recipients,
            subject: `[Action required] Scheduled report blocked — ${window.label}`,
            html: `
                <p>A scheduled report was <strong>not generated</strong> because one or more validation gates failed.</p>
                <p><strong>Report ID:</strong> ${escapeHtml(reportId)}<br/>
                   <strong>Export window:</strong> ${escapeHtml(window.label)} (${escapeHtml(window.timeZone)})<br/>
                   <strong>Window UTC range:</strong> ${window.start.toISOString()} to ${window.end.toISOString()}</p>
                <ul>${rows}</ul>
                <p>No report was sent. Resolve the underlying data issue and re-run, or adjust the report's
                   validation gate configuration if the window is legitimately empty on those days.</p>
            `,
        });
        console.log(`[ReporterService] Validation-failure alert sent for report ${reportId}.`);
    } catch (error) {
        console.error(`[ReporterService] Failed to send validation-failure alert for report ${reportId}:`, error);
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
    const client = getResendClient();
    if (!client) {
        const message = '[ReporterService] RESEND_API_KEY missing. Skipping report email dispatch.';
        if (allowMissingProvider) {
            console.warn(message);
            return false;
        }
        throw new Error('RESEND_API_KEY is not configured; scheduled report email was not sent.');
    }

    const { error } = await client.emails.send({
        from: env.emailFrom,
        to,
        subject,
        html,
        attachments: [
            {
                filename,
                content: Buffer.from(pdfBuffer),
            },
        ],
    });

    if (error) {
        throw new Error(`Resend error [${error.name}]: ${error.message}`);
    }

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
    const today = startOfDay(now);
    const dayOfMonth = now.getDate();

    // Weekly candidates are no longer filtered by `day_of_week` or `last_sent_at` in
    // SQL. Both depend on the *reporting timezone* — a report on Pacific/Auckland and
    // one on America/Chicago become due at different UTC instants, and a server-local
    // `last_sent_at < startOfDay(now)` guard double-sends for zones far from UTC.
    // Candidates are fetched broadly and de-duplicated against the resolved window
    // below, which is exact because each window is a distinct calendar week.
    const dueFrequencyClauses = [
        { frequency: 'weekly' },
        ...(dayOfMonth === 1 ? [{ frequency: 'monthly' }] : []),
    ];

    const reports = await prisma.scheduledReport.findMany({
        where: {
            is_active: true,
            AND: [{ OR: dueFrequencyClauses }],
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
        // window's closing Sunday. Anything not yet at its slot is left for a later
        // cron tick rather than being generated against an incomplete window.
        if (report.frequency === 'weekly' && !isGenerationDue(now, timeZone, generationTime)) {
            result.skipped += 1;
            continue;
        }

        // Idempotency. For weekly reports this compares against the window itself:
        // once `last_sent_at` is at or after the window's exclusive end, that week's
        // report has already gone out, whatever timezone the scheduler ticked in.
        const lastSentAt = report.last_sent_at ? new Date(report.last_sent_at) : null;
        if (lastSentAt) {
            const alreadySent = report.frequency === 'weekly'
                ? lastSentAt.getTime() >= getPreviousCompleteWeek(now, timeZone).endExclusive.getTime()
                : lastSentAt.getTime() >= today.getTime();
            if (alreadySent) {
                result.skipped += 1;
                continue;
            }
        }

        const recipients = getRecipients(report.recipients);
        if (recipients.length === 0) {
            result.skipped += 1;
            console.warn(`[ReporterService] Scheduled report ${report.id} has no valid recipients. Skipping.`);
            continue;
        }

        try {
            const window = buildReportWindow(report.frequency, now, timeZone);

            // Gates run before any data is rendered. A report that would be built on an
            // incomplete window is suppressed and alerted on, never sent — the report is
            // a compliance artefact and wrong data is worse than no data.
            if (window.window) {
                const outcome = await runValidationGates({
                    window: window.window,
                    config: resolveGateConfig(report),
                    organizationId: report.organization_id,
                    reportId: report.id,
                });

                if (!outcome.passed) {
                    await notifyAdminsOfValidationFailure({
                        reportId: report.id,
                        recipients,
                        window: window.window,
                        outcome,
                    });
                    throw new ValidationGateError(outcome.failures.join(' '), outcome, window.window);
                }
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
                data: { last_sent_at: now },
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
