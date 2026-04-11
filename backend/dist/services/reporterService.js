"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processDueScheduledReports = exports.generateAndEmailDailyReport = void 0;
const jspdf_1 = require("jspdf");
const jspdf_autotable_1 = require("jspdf-autotable");
const resend_1 = require("resend");
const db_1 = __importDefault(require("../config/db"));
const env_1 = require("../config/env");
let resendClient = null;
const getResendClient = () => {
    if (!env_1.env.resendApiKey)
        return null;
    if (!resendClient) {
        resendClient = new resend_1.Resend(env_1.env.resendApiKey);
    }
    return resendClient;
};
const startOfDay = (date) => {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
};
const addDays = (date, days) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};
const startOfPreviousMonth = (date) => new Date(date.getFullYear(), date.getMonth() - 1, 1);
const startOfCurrentMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const formatDate = (date) => date.toISOString().slice(0, 10);
const getRecipients = (value) => {
    if (!Array.isArray(value))
        return [];
    return Array.from(new Set(value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)));
};
const buildReportWindow = (frequency, now) => {
    if (frequency === 'monthly') {
        const start = startOfPreviousMonth(now);
        const end = startOfCurrentMonth(now);
        return { start, end, label: `${formatDate(start)} to ${formatDate(addDays(end, -1))}` };
    }
    const end = startOfDay(addDays(now, 1));
    const start = addDays(end, -7);
    return { start, end, label: `${formatDate(start)} to ${formatDate(addDays(end, -1))}` };
};
const getReportTitle = (frequency, reportType, label) => {
    const normalizedType = reportType === 'billable' ? 'Billable hours' : reportType === 'detailed' ? 'Detailed' : 'Summary';
    const normalizedFrequency = frequency === 'monthly' ? 'Monthly' : 'Weekly';
    return `${normalizedFrequency} ${normalizedType} Report - ${label}`;
};
const generateReportPdf = (title, entries) => {
    const doc = new jspdf_1.jsPDF();
    doc.setFontSize(18);
    doc.text(title, 14, 22);
    const tableData = entries.map((entry) => {
        var _a;
        return [
            entry.user.email,
            ((_a = entry.project) === null || _a === void 0 ? void 0 : _a.name) || 'Unassigned',
            entry.task_description,
            (entry.duration / 3600).toFixed(2),
            new Date(entry.start_time).toLocaleString(),
            entry.status,
        ];
    });
    (0, jspdf_autotable_1.autoTable)(doc, {
        startY: 30,
        head: [['Engineer', 'Project', 'Task', 'Hours', 'Start Time', 'Status']],
        body: tableData.length > 0 ? tableData : [['No time entries found for this report window.', '', '', '', '', '']],
    });
    return doc.output('arraybuffer');
};
const sendPdfReport = (_a) => __awaiter(void 0, [_a], void 0, function* ({ to, subject, html, filename, pdfBuffer, allowMissingProvider, }) {
    const client = getResendClient();
    if (!client) {
        const message = '[ReporterService] RESEND_API_KEY missing. Skipping report email dispatch.';
        if (allowMissingProvider) {
            console.warn(message);
            return false;
        }
        throw new Error('RESEND_API_KEY is not configured; scheduled report email was not sent.');
    }
    const { error } = yield client.emails.send({
        from: env_1.env.emailFrom,
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
});
const fetchReportEntries = (start, end, reportType) => __awaiter(void 0, void 0, void 0, function* () {
    return db_1.default.timeEntry.findMany({
        where: Object.assign({ start_time: { gte: start, lt: end } }, (reportType === 'billable' ? { is_billable: true } : {})),
        include: { user: true, project: true },
        orderBy: { start_time: 'asc' },
    });
});
const generateAndEmailDailyReport = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('[ReporterService] Fetching timesheets for daily summary...');
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const entries = yield fetchReportEntries(today, tomorrow, 'summary');
    const title = `Daily Autonomous Time Report - ${today.toLocaleDateString()}`;
    const pdfBuffer = generateReportPdf(title, entries);
    console.log('[ReporterService] Sending PDF via Resend to admin@webforxtech.com...');
    const sent = yield sendPdfReport({
        to: ['admin@webforxtech.com'],
        subject: `Daily Hours Report - ${today.toLocaleDateString()}`,
        html: '<p>Hello Admin,</p><p>Please find attached the automated daily timesheet summary for all engineers.</p>',
        filename: `Report-${formatDate(today)}.pdf`,
        pdfBuffer,
        allowMissingProvider: true,
    });
    if (sent) {
        console.log('[ReporterService] Successfully dispatched daily report email.');
    }
});
exports.generateAndEmailDailyReport = generateAndEmailDailyReport;
const processDueScheduledReports = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (now = new Date()) {
    const today = startOfDay(now);
    const dayOfWeek = now.getDay();
    const dayOfMonth = now.getDate();
    const dueFrequencyClauses = [
        { frequency: 'weekly', day_of_week: dayOfWeek },
        ...(dayOfMonth === 1 ? [{ frequency: 'monthly' }] : []),
    ];
    const reports = yield db_1.default.scheduledReport.findMany({
        where: {
            is_active: true,
            AND: [
                { OR: dueFrequencyClauses },
                { OR: [{ last_sent_at: null }, { last_sent_at: { lt: today } }] },
            ],
        },
        orderBy: { created_at: 'asc' },
    });
    const result = {
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
            const entries = yield fetchReportEntries(window.start, window.end, report.report_type);
            const title = getReportTitle(report.frequency, report.report_type, window.label);
            const pdfBuffer = generateReportPdf(title, entries);
            yield sendPdfReport({
                to: recipients,
                subject: title,
                html: `<p>Hello,</p><p>Please find attached your ${report.frequency} ${report.report_type} time report for ${window.label}.</p>`,
                filename: `${report.frequency}-${report.report_type}-report-${formatDate(now)}.pdf`,
                pdfBuffer,
                allowMissingProvider: false,
            });
            yield db_1.default.scheduledReport.update({
                where: { id: report.id },
                data: { last_sent_at: now },
            });
            result.sent += 1;
            console.log(`[ReporterService] Sent scheduled report ${report.id} to ${recipients.join(', ')}.`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown scheduled report delivery error';
            result.failed += 1;
            result.failures.push({ id: report.id, message });
            console.error(`[ReporterService] Scheduled report ${report.id} failed:`, error);
        }
    }
    return result;
});
exports.processDueScheduledReports = processDueScheduledReports;
