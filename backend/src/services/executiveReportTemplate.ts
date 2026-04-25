import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { env } from '../config/env';

export type ExecutiveReportEntry = {
    user: {
        email: string;
        first_name?: string | null;
        last_name?: string | null;
    };
    project: { name: string } | null;
    task_description: string;
    duration: number;
    start_time: Date;
    status: string;
};

type StatusKey = 'approved' | 'rejected' | 'pending';

type DetailEntry = {
    date: string;
    employee: string;
    email: string;
    project: string;
    task: string;
    hours: number;
    status: StatusKey;
};

type GroupSummary = {
    key: string;
    label: string;
    approvedHours: number;
    rejectedHours: number;
    pendingHours: number;
    totalHours: number;
    entries: DetailEntry[];
};

export type ExecutiveReportModel = {
    title: string;
    displayTitle: string;
    reportId: string;
    periodLabel: string;
    generatedAt: Date;
    entries: DetailEntry[];
    zeroHourEntries: number;
    totals: {
        totalHours: number;
        approvedHours: number;
        rejectedHours: number;
        pendingHours: number;
        contributors: number;
        projects: number;
        entries: number;
    };
    statusCounts: Record<StatusKey, number>;
    employees: GroupSummary[];
    projects: GroupSummary[];
    topContributors: Array<{ label: string; value: number }>;
    hoursByProject: Array<{ label: string; value: number }>;
};

const COLORS = {
    navy: '#0F172A',
    blue: '#1D4ED8',
    cyan: '#06B6D4',
    orange: '#F97316',
    light: '#F8FAFC',
    text: '#111827',
    muted: '#64748B',
    border: '#CBD5E1',
    green: '#16A34A',
    red: '#DC2626',
    amber: '#D97706',
    white: '#FFFFFF',
};

const PAGE = {
    marginX: 36,
    headerY: 24,
    footerY: 570,
    width: 792,
    height: 612,
};

const statusColor = (status: StatusKey): string => {
    if (status === 'approved') return COLORS.green;
    if (status === 'rejected') return COLORS.red;
    return COLORS.amber;
};

const roundHours = (value: number): number => Number(value.toFixed(2));

const secondsToHours = (seconds: number): number => roundHours(Math.max(0, seconds) / 3600);

const normalizeStatus = (status: string): StatusKey => {
    const normalized = status.toLowerCase().trim();
    if (normalized === 'approved' || normalized === 'rejected') return normalized;
    return 'pending';
};

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const formatDateTime = (date: Date): string => date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

const employeeName = (entry: ExecutiveReportEntry): string => {
    const name = [entry.user.first_name, entry.user.last_name].filter(Boolean).join(' ').trim();
    return name || entry.user.email;
};

const displayProject = (entry: ExecutiveReportEntry): string => entry.project?.name?.trim() || 'Unassigned';

const buildReportId = (periodLabel: string, generatedAt: Date): string => {
    const seed = `${periodLabel}-${generatedAt.toISOString()}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 18).toUpperCase();
    return `WFT-${seed}`;
};

const parsePeriodFromTitle = (title: string): string => {
    const match = title.match(/\s-\s(.+)$/);
    return match?.[1]?.trim() || 'Current reporting period';
};

const buildDisplayTitle = (title: string): string => {
    const base = title.replace(/\s-\s.+$/, '').trim();
    if (/daily/i.test(base)) return 'Daily Timesheet Executive Report';
    if (/monthly/i.test(base)) return 'Monthly Timesheet Executive Report';
    return 'Weekly Timesheet Executive Report';
};

const sumByStatus = (entries: DetailEntry[], status: StatusKey): number => {
    return roundHours(entries.filter((entry) => entry.status === status).reduce((sum, entry) => sum + entry.hours, 0));
};

const sortByHoursThenLabel = <T extends { label: string; value: number }>(items: T[]): T[] => {
    return [...items].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
};

const createGroups = (entries: DetailEntry[], getKey: (entry: DetailEntry) => string, getLabel: (entry: DetailEntry) => string): GroupSummary[] => {
    const groups = new Map<string, GroupSummary>();

    entries.forEach((entry) => {
        const key = getKey(entry);
        const existing = groups.get(key) || {
            key,
            label: getLabel(entry),
            approvedHours: 0,
            rejectedHours: 0,
            pendingHours: 0,
            totalHours: 0,
            entries: [],
        };

        existing.entries.push(entry);
        existing.totalHours = roundHours(existing.totalHours + entry.hours);
        if (entry.status === 'approved') existing.approvedHours = roundHours(existing.approvedHours + entry.hours);
        if (entry.status === 'rejected') existing.rejectedHours = roundHours(existing.rejectedHours + entry.hours);
        if (entry.status === 'pending') existing.pendingHours = roundHours(existing.pendingHours + entry.hours);
        groups.set(key, existing);
    });

    return [...groups.values()].sort((a, b) => b.approvedHours - a.approvedHours || a.label.localeCompare(b.label));
};

export const buildExecutiveReportModel = (title: string, rawEntries: ExecutiveReportEntry[], generatedAt = new Date()): ExecutiveReportModel => {
    const periodLabel = parsePeriodFromTitle(title);
    const detailEntries = rawEntries
        .map((entry) => ({
            date: formatDate(new Date(entry.start_time)),
            employee: employeeName(entry),
            email: entry.user.email,
            project: displayProject(entry),
            task: entry.task_description?.trim() || 'No task description provided',
            hours: secondsToHours(entry.duration),
            status: normalizeStatus(entry.status),
        }))
        .sort((a, b) => a.employee.localeCompare(b.employee) || a.date.localeCompare(b.date) || a.project.localeCompare(b.project));

    const nonZeroEntries = detailEntries.filter((entry) => entry.hours > 0);
    const employees = createGroups(nonZeroEntries, (entry) => entry.email, (entry) => `${entry.employee} <${entry.email}>`);
    const projects = createGroups(nonZeroEntries, (entry) => entry.project, (entry) => entry.project);
    const approvedEntries = nonZeroEntries.filter((entry) => entry.status === 'approved');
    const contributorSet = new Set(nonZeroEntries.map((entry) => entry.email));
    const projectSet = new Set(nonZeroEntries.map((entry) => entry.project));

    return {
        title,
        displayTitle: buildDisplayTitle(title),
        reportId: buildReportId(periodLabel, generatedAt),
        periodLabel,
        generatedAt,
        entries: nonZeroEntries,
        zeroHourEntries: detailEntries.length - nonZeroEntries.length,
        totals: {
            totalHours: roundHours(nonZeroEntries.reduce((sum, entry) => sum + entry.hours, 0)),
            approvedHours: sumByStatus(nonZeroEntries, 'approved'),
            rejectedHours: sumByStatus(nonZeroEntries, 'rejected'),
            pendingHours: sumByStatus(nonZeroEntries, 'pending'),
            contributors: contributorSet.size,
            projects: projectSet.size,
            entries: nonZeroEntries.length,
        },
        statusCounts: {
            approved: approvedEntries.length,
            rejected: nonZeroEntries.filter((entry) => entry.status === 'rejected').length,
            pending: nonZeroEntries.filter((entry) => entry.status === 'pending').length,
        },
        employees,
        projects,
        topContributors: sortByHoursThenLabel(employees
            .map((employee) => ({
                label: employee.label.replace(/ <.+>$/, ''),
                value: employee.approvedHours,
            }))
            .filter((employee) => employee.value > 0)).slice(0, 8),
        hoursByProject: sortByHoursThenLabel(projects
            .map((project) => ({
                label: project.label,
                value: project.approvedHours,
            }))
            .filter((project) => project.value > 0)).slice(0, 8),
    };
};

const resolvePath = (configuredPath: string, fallbackPath: string): string => {
    if (configuredPath && fs.existsSync(configuredPath)) return configuredPath;
    return fallbackPath;
};

const loadImage = (filePath: string): { data: string; format: 'PNG' | 'JPEG' } | null => {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const ext = path.extname(filePath).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) return null;
    return {
        data: fs.readFileSync(filePath).toString('base64'),
        format: ext === '.png' ? 'PNG' : 'JPEG',
    };
};

export const getReportLogoAssets = (overrides?: {
    companyLogoPath?: string;
    appLogoPath?: string;
    disableFallback?: boolean;
}): { companyLogo: ReturnType<typeof loadImage>; appLogo: ReturnType<typeof loadImage> } => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const companyFallback = overrides?.disableFallback ? '' : path.join(repoRoot, 'frontend', 'public', 'webforx-logo.png');
    const appFallback = overrides?.disableFallback ? '' : path.join(repoRoot, 'frontend', 'public', 'favicon.png');
    const configuredCompanyLogoPath = overrides?.companyLogoPath ?? process.env.REPORT_COMPANY_LOGO_PATH?.trim() ?? env.reportCompanyLogoPath;
    const configuredAppLogoPath = overrides?.appLogoPath ?? process.env.REPORT_TIMER_APP_LOGO_PATH?.trim() ?? env.reportTimerAppLogoPath;
    const companyLogoPath = resolvePath(
        configuredCompanyLogoPath,
        companyFallback,
    );
    const appLogoPath = resolvePath(
        configuredAppLogoPath,
        appFallback,
    );

    return {
        companyLogo: loadImage(companyLogoPath),
        appLogo: loadImage(appLogoPath),
    };
};

const setFill = (doc: jsPDF, color: string): void => {
    doc.setFillColor(color);
};

const setDraw = (doc: jsPDF, color: string): void => {
    doc.setDrawColor(color);
};

const setText = (doc: jsPDF, color: string): void => {
    doc.setTextColor(color);
};

const drawHeader = (doc: jsPDF, model: ExecutiveReportModel, logos: ReturnType<typeof getReportLogoAssets>): void => {
    setFill(doc, COLORS.white);
    doc.rect(0, 0, PAGE.width, 58, 'F');
    setDraw(doc, COLORS.border);
    doc.line(PAGE.marginX, 56, PAGE.width - PAGE.marginX, 56);

    if (logos.companyLogo) {
        doc.addImage(logos.companyLogo.data, logos.companyLogo.format, PAGE.marginX, 16, 92, 24, undefined, 'FAST');
    } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        setText(doc, COLORS.navy);
        doc.text('Web Forx Technology Limited', PAGE.marginX, 32);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setText(doc, COLORS.muted);
    doc.text(model.reportId, PAGE.width / 2, 24, { align: 'center' });
    doc.setFontSize(8);
    doc.text(model.periodLabel, PAGE.width / 2, 38, { align: 'center' });

    if (logos.appLogo) {
        doc.addImage(logos.appLogo.data, logos.appLogo.format, PAGE.width - PAGE.marginX - 28, 15, 28, 28, undefined, 'FAST');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setText(doc, COLORS.navy);
        doc.text('Time Tracker', PAGE.width - PAGE.marginX - 34, 50, { align: 'right' });
    } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        setText(doc, COLORS.navy);
        doc.text('Time Tracker', PAGE.width - PAGE.marginX, 32, { align: 'right' });
    }
};

const drawFooter = (doc: jsPDF, model: ExecutiveReportModel, pageNumber: number, pageCount: number): void => {
    setDraw(doc, COLORS.border);
    doc.line(PAGE.marginX, PAGE.footerY - 12, PAGE.width - PAGE.marginX, PAGE.footerY - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(doc, COLORS.muted);
    doc.text(`Generated ${formatDateTime(model.generatedAt)} | ${model.reportId}`, PAGE.marginX, PAGE.footerY);
    doc.text(`Page ${pageNumber} of ${pageCount}`, PAGE.width - PAGE.marginX, PAGE.footerY, { align: 'right' });
};

const addPage = (doc: jsPDF, model: ExecutiveReportModel, logos: ReturnType<typeof getReportLogoAssets>): void => {
    doc.addPage('letter', 'landscape');
    drawHeader(doc, model, logos);
};

const drawPill = (doc: jsPDF, text: string, x: number, y: number, color: string, width = 54): void => {
    setFill(doc, color);
    doc.roundedRect(x, y - 11, width, 16, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setText(doc, COLORS.white);
    doc.text(text.toUpperCase(), x + width / 2, y, { align: 'center' });
};

const drawKpiCard = (doc: jsPDF, label: string, value: string, x: number, y: number, w: number, accent: string): void => {
    setFill(doc, COLORS.white);
    setDraw(doc, '#E2E8F0');
    doc.roundedRect(x, y, w, 58, 6, 6, 'FD');
    setFill(doc, accent);
    doc.rect(x, y, 5, 58, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    setText(doc, COLORS.text);
    doc.text(value, x + 18, y + 26);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(doc, COLORS.muted);
    doc.text(label.toUpperCase(), x + 18, y + 44);
};

const drawBarChart = (doc: jsPDF, title: string, data: Array<{ label: string; value: number }>, x: number, y: number, w: number, h: number, color: string): void => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setText(doc, COLORS.navy);
    doc.text(title, x, y);
    setFill(doc, COLORS.white);
    setDraw(doc, '#E2E8F0');
    doc.roundedRect(x, y + 10, w, h, 6, 6, 'FD');

    const max = Math.max(...data.map((item) => item.value), 1);
    const rowH = Math.min(24, (h - 24) / Math.max(data.length, 1));
    data.forEach((item, index) => {
        const rowY = y + 26 + index * rowH;
        const label = item.label.length > 26 ? `${item.label.slice(0, 23)}...` : item.label;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        setText(doc, COLORS.text);
        doc.text(label, x + 12, rowY);
        setFill(doc, '#DBEAFE');
        doc.roundedRect(x + 140, rowY - 8, w - 195, 9, 2, 2, 'F');
        setFill(doc, color);
        doc.roundedRect(x + 140, rowY - 8, Math.max(2, ((w - 195) * item.value) / max), 9, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        setText(doc, COLORS.navy);
        doc.text(`${item.value.toFixed(2)}h`, x + w - 12, rowY, { align: 'right' });
    });

    if (data.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        setText(doc, COLORS.muted);
        doc.text('No approved hours in this reporting window.', x + 12, y + 42);
    }
};

const drawStatusChart = (doc: jsPDF, model: ExecutiveReportModel, x: number, y: number, w: number, h: number): void => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setText(doc, COLORS.navy);
    doc.text('Status Distribution', x, y);
    setFill(doc, COLORS.white);
    setDraw(doc, '#E2E8F0');
    doc.roundedRect(x, y + 10, w, h, 6, 6, 'FD');

    const statuses: StatusKey[] = ['approved', 'pending', 'rejected'];
    const total = Math.max(statuses.reduce((sum, status) => sum + model.statusCounts[status], 0), 1);
    let currentY = y + 34;
    statuses.forEach((status) => {
        const count = model.statusCounts[status];
        const pct = Math.round((count / total) * 100);
        setFill(doc, statusColor(status));
        doc.circle(x + 20, currentY - 4, 5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setText(doc, COLORS.text);
        doc.text(status[0].toUpperCase() + status.slice(1), x + 34, currentY);
        doc.text(`${count} entries`, x + w - 88, currentY);
        doc.text(`${pct}%`, x + w - 18, currentY, { align: 'right' });
        currentY += 28;
    });
};

const renderExecutiveSummary = (doc: jsPDF, model: ExecutiveReportModel, logos: ReturnType<typeof getReportLogoAssets>): void => {
    drawHeader(doc, model, logos);

    setFill(doc, COLORS.light);
    doc.rect(0, 58, PAGE.width, PAGE.height - 58, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(27);
    setText(doc, COLORS.navy);
    doc.text(model.displayTitle, PAGE.marginX, 104);
    doc.setFontSize(12);
    setText(doc, COLORS.muted);
    doc.text('Web Forx Technology Limited', PAGE.marginX, 126);
    doc.text(`Reporting period: ${model.periodLabel}`, PAGE.marginX, 144);
    doc.text(`Generated: ${formatDateTime(model.generatedAt)}`, PAGE.marginX, 162);

    drawKpiCard(doc, 'Total hours', `${model.totals.totalHours.toFixed(2)}h`, 36, 198, 155, COLORS.navy);
    drawKpiCard(doc, 'Approved hours', `${model.totals.approvedHours.toFixed(2)}h`, 207, 198, 155, COLORS.green);
    drawKpiCard(doc, 'Pending hours', `${model.totals.pendingHours.toFixed(2)}h`, 378, 198, 155, COLORS.amber);
    drawKpiCard(doc, 'Rejected hours', `${model.totals.rejectedHours.toFixed(2)}h`, 549, 198, 155, COLORS.red);
    drawKpiCard(doc, 'Contributors', String(model.totals.contributors), 36, 276, 155, COLORS.blue);
    drawKpiCard(doc, 'Projects', String(model.totals.projects), 207, 276, 155, COLORS.cyan);
    drawKpiCard(doc, 'Entries reviewed', String(model.totals.entries), 378, 276, 155, COLORS.orange);
    drawKpiCard(doc, 'Zero-hour items', String(model.zeroHourEntries), 549, 276, 155, COLORS.muted);

    setFill(doc, COLORS.white);
    setDraw(doc, '#E2E8F0');
    doc.roundedRect(36, 372, 668, 96, 6, 6, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setText(doc, COLORS.navy);
    doc.text('Executive Summary', 56, 398);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setText(doc, COLORS.text);
    const summary = [
        `Approved work accounts for ${model.totals.approvedHours.toFixed(2)} hours across ${model.totals.contributors} contributors and ${model.totals.projects} projects.`,
        `${model.totals.pendingHours.toFixed(2)} pending hours require review and ${model.totals.rejectedHours.toFixed(2)} rejected hours are separated as exceptions.`,
        model.projects.some((project) => project.label === 'Unassigned')
            ? 'Unassigned project time appears in this report and should be treated as an operational cleanup item.'
            : 'No unassigned project time was detected in the included detail rows.',
    ].join(' ');
    doc.text(doc.splitTextToSize(summary, 620), 56, 424);
};

const renderVisualOverview = (doc: jsPDF, model: ExecutiveReportModel, logos: ReturnType<typeof getReportLogoAssets>): void => {
    addPage(doc, model, logos);
    setFill(doc, COLORS.light);
    doc.rect(0, 58, PAGE.width, PAGE.height - 58, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(21);
    setText(doc, COLORS.navy);
    doc.text('Visual Overview', PAGE.marginX, 90);

    drawBarChart(doc, 'Top Contributors by Approved Hours', model.topContributors, 36, 116, 340, 188, COLORS.blue);
    drawBarChart(doc, 'Hours by Project', model.hoursByProject, 416, 116, 340, 188, COLORS.cyan);
    drawStatusChart(doc, model, 36, 338, 340, 118);

    setFill(doc, COLORS.white);
    setDraw(doc, '#E2E8F0');
    doc.roundedRect(416, 348, 340, 108, 6, 6, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setText(doc, COLORS.navy);
    doc.text('Operational Notes', 432, 376);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(doc, COLORS.text);
    const notes = [
        `Approved hours are emphasized for executive rollups; pending and rejected hours remain visible for review control.`,
        model.zeroHourEntries > 0 ? `${model.zeroHourEntries} zero-hour entries were omitted from detail tables and summarized on the cover.` : 'No zero-hour entries were present.',
    ];
    doc.text(doc.splitTextToSize(notes.join(' '), 300), 432, 400);
};

const tableStartY = (doc: jsPDF, requestedY: number): number => Math.max(requestedY, 96);

const lastTableY = (doc: jsPDF): number => {
    const tableDoc = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    return tableDoc.lastAutoTable?.finalY || 96;
};

const ensureDetailSpace = (doc: jsPDF, model: ExecutiveReportModel, logos: ReturnType<typeof getReportLogoAssets>, y: number, minimum = 120): number => {
    if (y + minimum <= PAGE.footerY - 18) return y;
    addPage(doc, model, logos);
    return 86;
};

const renderGroupTable = (
    doc: jsPDF,
    model: ExecutiveReportModel,
    logos: ReturnType<typeof getReportLogoAssets>,
    group: GroupSummary,
    mode: 'employee' | 'project',
    y: number,
): number => {
    y = ensureDetailSpace(doc, model, logos, y, 130);
    const cleanLabel = mode === 'employee' ? group.label : group.label;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setText(doc, COLORS.navy);
    doc.text(cleanLabel, PAGE.marginX, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(doc, COLORS.muted);
    const metadata = mode === 'employee'
        ? `Approved ${group.approvedHours.toFixed(2)}h | Rejected ${group.rejectedHours.toFixed(2)}h | Pending ${group.pendingHours.toFixed(2)}h | Projects ${new Set(group.entries.map((entry) => entry.project)).size}`
        : `Approved ${group.approvedHours.toFixed(2)}h | Contributors ${new Set(group.entries.map((entry) => entry.email)).size} | Pending ${group.pendingHours.toFixed(2)}h | Rejected ${group.rejectedHours.toFixed(2)}h`;
    doc.text(metadata, PAGE.marginX, y + 14);
    if (mode === 'project' && group.label === 'Unassigned') {
        drawPill(doc, 'cleanup', PAGE.width - PAGE.marginX - 70, y + 6, COLORS.orange, 60);
    }

    const rows = group.entries.map((entry) => {
        const person = mode === 'employee' ? entry.project : entry.employee;
        return [entry.date, person, entry.task, `${entry.hours.toFixed(2)}h`, entry.status.toUpperCase()];
    });

    autoTable(doc, {
        startY: tableStartY(doc, y + 24),
        margin: { left: PAGE.marginX, right: PAGE.marginX, top: 72, bottom: 56 },
        head: [[mode === 'employee' ? 'Date' : 'Date', mode === 'employee' ? 'Project' : 'Employee', 'Task', 'Hours', 'Status']],
        body: rows,
        theme: 'grid',
        tableWidth: 'wrap',
        styles: {
            font: 'helvetica',
            fontSize: 8,
            cellPadding: 5,
            overflow: 'linebreak',
            valign: 'top',
            minCellWidth: 0,
            minCellHeight: 18,
            textColor: COLORS.text,
            lineColor: '#E2E8F0',
            lineWidth: 0.4,
        },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontStyle: 'bold',
            fontSize: 8,
            halign: 'left',
            cellPadding: 5,
        },
        alternateRowStyles: { fillColor: COLORS.light },
        columnStyles: {
            0: { cellWidth: 68 },
            1: { cellWidth: 124 },
            2: { cellWidth: 328 },
            3: { cellWidth: 58, halign: 'right' },
            4: { cellWidth: 68, halign: 'center' },
        },
        didDrawPage: () => drawHeader(doc, model, logos),
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 4) {
                const status = String(data.cell.raw).toLowerCase() as StatusKey;
                data.cell.styles.fillColor = statusColor(status);
                data.cell.styles.textColor = COLORS.white;
                data.cell.styles.fontStyle = 'bold';
            }
        },
    });

    const subtotalY = ensureDetailSpace(doc, model, logos, lastTableY(doc) + 16, 40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setText(doc, COLORS.navy);
    doc.text(`Subtotal: ${group.totalHours.toFixed(2)}h total | ${group.approvedHours.toFixed(2)}h approved`, PAGE.width - PAGE.marginX, subtotalY, { align: 'right' });
    return subtotalY + 28;
};

const renderDetailSection = (
    doc: jsPDF,
    model: ExecutiveReportModel,
    logos: ReturnType<typeof getReportLogoAssets>,
    title: string,
    groups: GroupSummary[],
    mode: 'employee' | 'project',
): void => {
    addPage(doc, model, logos);
    setFill(doc, COLORS.white);
    doc.rect(0, 58, PAGE.width, PAGE.height - 58, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    setText(doc, COLORS.navy);
    doc.text(title, PAGE.marginX, 92);
    let y = 122;

    if (groups.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        setText(doc, COLORS.muted);
        doc.text('No non-zero time entries found for this reporting window.', PAGE.marginX, y);
        return;
    }

    groups.forEach((group) => {
        y = renderGroupTable(doc, model, logos, group, mode, y);
    });
};

const renderApprovalPage = (doc: jsPDF, model: ExecutiveReportModel, logos: ReturnType<typeof getReportLogoAssets>): void => {
    addPage(doc, model, logos);
    setFill(doc, COLORS.light);
    doc.rect(0, 58, PAGE.width, PAGE.height - 58, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    setText(doc, COLORS.navy);
    doc.text('Approval & Sign-off', PAGE.marginX, 98);

    const fields = [
        ['Prepared by', ''],
        ['Reviewed by', ''],
        ['Approved by', ''],
    ];

    let y = 150;
    fields.forEach(([label]) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        setText(doc, COLORS.text);
        doc.text(label, PAGE.marginX, y);
        setDraw(doc, COLORS.border);
        doc.line(PAGE.marginX + 110, y, PAGE.marginX + 420, y);
        doc.text('Date', PAGE.marginX + 460, y);
        doc.line(PAGE.marginX + 500, y, PAGE.marginX + 670, y);
        y += 58;
    });

    setFill(doc, COLORS.white);
    setDraw(doc, '#E2E8F0');
    doc.roundedRect(PAGE.marginX, y + 12, 670, 92, 6, 6, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setText(doc, COLORS.navy);
    doc.text('Report Metadata', PAGE.marginX + 18, y + 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(doc, COLORS.text);
    doc.text(`Report ID: ${model.reportId}`, PAGE.marginX + 18, y + 62);
    doc.text(`Generated timestamp: ${formatDateTime(model.generatedAt)}`, PAGE.marginX + 18, y + 80);
    doc.text(`Workflow: Prepared -> Reviewed -> Approved`, PAGE.marginX + 330, y + 62);
};

export const generateExecutiveReportPdf = (title: string, entries: ExecutiveReportEntry[]): ArrayBuffer => {
    const model = buildExecutiveReportModel(title, entries);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const logos = getReportLogoAssets();

    renderExecutiveSummary(doc, model, logos);
    renderVisualOverview(doc, model, logos);
    renderDetailSection(doc, model, logos, 'Detailed Breakdown by Employee', model.employees, 'employee');
    renderDetailSection(doc, model, logos, 'Detailed Breakdown by Project', model.projects, 'project');
    renderApprovalPage(doc, model, logos);

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        drawFooter(doc, model, page, pageCount);
    }

    return doc.output('arraybuffer');
};
