import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { Resend } from 'resend';
import prisma from '../config/db';
import { env } from '../config/env';
import { generateExecutiveReportPdf } from './executiveReportTemplate';

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
};

export type ScheduledReportRunResult = {
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
    failures: Array<{ id: string; message: string }>;
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

const buildReportWindow = (frequency: string, now: Date): { start: Date; end: Date; label: string } => {
    if (frequency === 'monthly') {
        const start = startOfPreviousMonth(now);
        const end = startOfCurrentMonth(now);
        return { start, end, label: `${formatDate(start)} to ${formatDate(addDays(end, -1))}` };
    }

    const end = startOfDay(addDays(now, 1));
    const start = addDays(end, -7);
    return { start, end, label: `${formatDate(start)} to ${formatDate(addDays(end, -1))}` };
};

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

const fetchDefaulters = async (
    entries: ReportEntry[],
    organizationId?: string,
): Promise<DefaulterUser[]> => {
    const activeUsers = await prisma.user.findMany({
        where: {
            is_active: true,
            ...(organizationId ? { organization_id: organizationId } : {}),
        },
        select: { email: true, first_name: true, last_name: true },
    });

    const loggedEmails = new Set(entries.map((entry) => entry.user.email.toLowerCase()));
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
            const entries = await fetchReportEntries(today, tomorrow, 'summary', org.id);
            const defaulters = await fetchDefaulters(entries, org.id);
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
    const dayOfWeek = now.getDay();
    const dayOfMonth = now.getDate();
    const dueFrequencyClauses = [
        { frequency: 'weekly', day_of_week: dayOfWeek },
        ...(dayOfMonth === 1 ? [{ frequency: 'monthly' }] : []),
    ];

    const reports = await prisma.scheduledReport.findMany({
        where: {
            is_active: true,
            AND: [
                { OR: dueFrequencyClauses },
                { OR: [{ last_sent_at: null }, { last_sent_at: { lt: today } }] },
            ],
        },
        orderBy: { created_at: 'asc' },
    }) as ScheduledReportRecord[];

    const result: ScheduledReportRunResult = {
        processed: reports.length,
        sent: 0,
        failed: 0,
        skipped: 0,
        failures: [],
    };

    for (const report of reports) {
        const recipients = getRecipients(report.recipients);
        if (recipients.length === 0) {
            result.skipped += 1;
            console.warn(`[ReporterService] Scheduled report ${report.id} has no valid recipients. Skipping.`);
            continue;
        }

        try {
            const window = buildReportWindow(report.frequency, now);
            const entries = await fetchReportEntries(window.start, window.end, report.report_type, report.organization_id);
            const defaulters = await fetchDefaulters(entries, report.organization_id);
            const title = getReportTitle(report.frequency, report.report_type, window.label);
            const pdfBuffer = generateReportPdf(title, entries, defaulters);

            await sendPdfReport({
                to: recipients,
                subject: title,
                html: `<p>Hello,</p><p>Please find attached your ${report.frequency} ${report.report_type} time report for ${window.label}.</p>`,
                filename: `${report.frequency}-${report.report_type}-report-${formatDate(now)}.pdf`,
                pdfBuffer,
                allowMissingProvider: false,
            });

            await prisma.scheduledReport.update({
                where: { id: report.id },
                data: { last_sent_at: now },
            });

            result.sent += 1;
            console.log(`[ReporterService] Sent scheduled report ${report.id} to ${recipients.join(', ')}.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown scheduled report delivery error';
            result.failed += 1;
            result.failures.push({ id: report.id, message });
            console.error(`[ReporterService] Scheduled report ${report.id} failed:`, error);
        }
    }

    return result;
};
