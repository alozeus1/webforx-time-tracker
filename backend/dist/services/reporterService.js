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
exports.generateAndEmailDailyReport = void 0;
const jspdf_1 = require("jspdf");
require("jspdf-autotable");
const resend_1 = require("resend");
const db_1 = __importDefault(require("../config/db"));
const resend = new resend_1.Resend(process.env.RESEND_API_KEY || 're_dummy_fallback');
const generateAndEmailDailyReport = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('[ReporterService] Fetching timesheets for daily summary...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const entries = yield db_1.default.timeEntry.findMany({
        where: { start_time: { gte: today } },
        include: { user: true, project: true }
    });
    // 1. Generate PDF
    const doc = new jspdf_1.jsPDF();
    doc.setFontSize(18);
    doc.text(`Daily Autonomous Time Report - ${today.toLocaleDateString()}`, 14, 22);
    const tableData = entries.map(entry => {
        var _a;
        return [
            entry.user.email,
            ((_a = entry.project) === null || _a === void 0 ? void 0 : _a.name) || 'Unassigned',
            entry.task_description,
            (entry.duration / 3600).toFixed(2),
            new Date(entry.start_time).toLocaleTimeString(),
            entry.status
        ];
    });
    doc.autoTable({
        startY: 30,
        head: [['Engineer', 'Project', 'Task', 'Hours', 'Start Time', 'Status']],
        body: tableData
    });
    const pdfBuffer = doc.output('arraybuffer');
    // 2. Send via Resend Email API
    console.log('[ReporterService] Sending PDF via Resend to admin@webforxtech.com...');
    // In local dev without RESEND_API_KEY, we skip actual dispatch:
    if (!process.env.RESEND_API_KEY) {
        console.warn('[ReporterService] RESEND_API_KEY missing. Skipping actual email dispatch.');
        return;
    }
    try {
        yield resend.emails.send({
            from: 'Time Tracker Bot <reports@webforxtech.com>',
            to: ['admin@webforxtech.com'],
            subject: `Daily Hours Report - ${today.toLocaleDateString()}`,
            html: '<p>Hello Admin,</p><p>Please find attached the automated daily timesheet summary for all engineers.</p>',
            attachments: [
                {
                    filename: `Report-${today.toISOString().split('T')[0]}.pdf`,
                    content: Buffer.from(pdfBuffer),
                }
            ]
        });
        console.log('[ReporterService] Successfully dispatched daily report email.');
    }
    catch (error) {
        console.error('[ReporterService] Email sending failed:', error);
    }
});
exports.generateAndEmailDailyReport = generateAndEmailDailyReport;
