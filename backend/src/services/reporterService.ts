import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { Resend } from 'resend';
import prisma from '../config/db';

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_fallback');

export const generateAndEmailDailyReport = async (): Promise<void> => {
    console.log('[ReporterService] Fetching timesheets for daily summary...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entries = await prisma.timeEntry.findMany({
        where: { start_time: { gte: today } },
        include: { user: true, project: true }
    });

    // 1. Generate PDF
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Daily Autonomous Time Report - ${today.toLocaleDateString()}`, 14, 22);

    const tableData = entries.map(entry => [
        entry.user.email,
        entry.project?.name || 'Unassigned',
        entry.task_description,
        (entry.duration / 3600).toFixed(2),
        new Date(entry.start_time).toLocaleTimeString(),
        entry.status
    ]);

    (doc as any).autoTable({
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
        await resend.emails.send({
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
    } catch (error) {
        console.error('[ReporterService] Email sending failed:', error);
    }
};
