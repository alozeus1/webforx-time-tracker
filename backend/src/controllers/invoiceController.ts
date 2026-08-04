import { Prisma } from '@prisma/client/index';
import { Response } from 'express';
import PDFDocument from 'pdfkit';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { sendApiError } from '../utils/http';
import { assertProjectBelongsToOrganization } from '../services/tenantOwnershipService';

interface NormalizedLineItem {
    time_entry_id?: string;
    expense_id?: string;
    description: string;
    hours: number;
    rate: number;
    amount: number;
}

const parseNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim()) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
};

const buildLineItemsFromExpenses = async (expenseIds: string[], organizationId: string): Promise<NormalizedLineItem[] | null> => {
    if (expenseIds.length === 0) return [];
    const uniqueIds = Array.from(new Set(expenseIds));
    const expenses = await prisma.expense.findMany({
        where: {
            id: { in: uniqueIds },
            organization_id: organizationId,
            status: 'approved',
            is_billable: true,
            invoice_line_item: null,
        },
    });
    if (expenses.length !== uniqueIds.length) return null;
    return expenses.map((expense) => {
        const amount = Number(expense.amount.toString());
        return {
            expense_id: expense.id,
            description: `Expense: ${expense.description}`,
            hours: 1,
            rate: amount,
            amount,
        };
    });
};

const sendTenantOwnershipError = (res: Response, error: unknown): boolean => {
    if ((error as NodeJS.ErrnoException)?.code === 'TENANT_PROJECT_NOT_FOUND') {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found');
        return true;
    }
    return false;
};

const parseTaxRate = (value: unknown): number => {
    const parsed = parseNumber(value);
    if (parsed === null) {
        return 0;
    }

    return Math.max(0, Math.min(parsed, 100));
};

const normalizeManualLineItems = (value: unknown): NormalizedLineItem[] | null => {
    if (!Array.isArray(value) || value.length === 0) {
        return null;
    }

    const normalized: NormalizedLineItem[] = [];

    for (const item of value) {
        if (typeof item !== 'object' || item === null) {
            return null;
        }

        const raw = item as Record<string, unknown>;
        const description = typeof raw.description === 'string' ? raw.description.trim() : '';
        const hours = parseNumber(raw.hours);
        const rate = parseNumber(raw.rate);

        if (!description || hours === null || rate === null || hours <= 0 || rate < 0) {
            return null;
        }

        normalized.push({
            description,
            hours,
            rate,
            amount: Number((hours * rate).toFixed(2)),
        });
    }

    return normalized;
};

const buildLineItemsFromEntries = async (timeEntryIds: string[], organizationId: string): Promise<NormalizedLineItem[] | null> => {
    if (timeEntryIds.length === 0) {
        return null;
    }

    const entries = await prisma.timeEntry.findMany({
        where: { id: { in: timeEntryIds }, is_billable: true, organization_id: organizationId },
        include: { user: { select: { hourly_rate: true } } },
    });

    if (entries.length === 0) {
        return null;
    }

    return entries.map((entry) => {
        const hours = Number((entry.duration / 3600).toFixed(2));
        const rate = Number.parseFloat(entry.user.hourly_rate?.toString() || '0');

        return {
            time_entry_id: entry.id,
            description: entry.task_description,
            hours,
            rate,
            amount: Number((hours * rate).toFixed(2)),
        };
    });
};

export const listInvoices = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const role = req.user?.role;
        const canViewAll = role === 'Manager' || role === 'Admin';
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : undefined;

        const where: Record<string, unknown> = { organization_id: req.user!.organization_id };
        if (!canViewAll) where.user_id = userId;
        if (status) where.status = status;
        if (projectId) where.project_id = projectId;

        const invoices = await prisma.invoice.findMany({
            where,
            include: {
                project: { select: { name: true } },
                creator: { select: { first_name: true, last_name: true } },
                line_items: true,
            },
            orderBy: { created_at: 'desc' },
        });

        res.status(200).json({ invoices });
    } catch (error) {
        console.error('Failed to list invoices:', error);
        sendApiError(res, 500, 'INVOICE_LIST_FAILED', 'Internal server error');
    }
};

export const createInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            sendApiError(res, 401, 'AUTH_REQUIRED', 'Authenticated user required');
            return;
        }

        const {
            client_name,
            client_email,
            project_id,
            notes,
            due_date,
            tax_rate,
            time_entry_ids,
            expense_ids,
            line_items,
        } = req.body ?? {};

        const clientName = typeof client_name === 'string' ? client_name.trim() : '';
        if (!clientName) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'client_name is required');
            return;
        }

        const dueDate = typeof due_date === 'string' && due_date.trim() ? new Date(due_date) : null;
        if (dueDate && Number.isNaN(dueDate.getTime())) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'due_date must be a valid date string');
            return;
        }

        const normalizedLineItems = normalizeManualLineItems(line_items) || [];
        const timeEntryIds = Array.isArray(time_entry_ids)
            ? time_entry_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            : [];
        const expenseIds = Array.isArray(expense_ids)
            ? expense_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            : [];

        if (timeEntryIds.length > 0) {
            const timeItems = await buildLineItemsFromEntries(timeEntryIds, req.user!.organization_id);
            if (!timeItems || timeItems.length !== new Set(timeEntryIds).size) {
                sendApiError(res, 400, 'VALIDATION_ERROR', 'One or more billable time entries are invalid');
                return;
            }
            normalizedLineItems.push(...timeItems);
        }
        if (expenseIds.length > 0) {
            const expenseItems = await buildLineItemsFromExpenses(expenseIds, req.user!.organization_id);
            if (!expenseItems) {
                sendApiError(res, 400, 'VALIDATION_ERROR', 'Expenses must be approved, billable, uninvoiced, and belong to this organization');
                return;
            }
            normalizedLineItems.push(...expenseItems);
        }

        if (!normalizedLineItems || normalizedLineItems.length === 0) {
            sendApiError(
                res,
                400,
                'VALIDATION_ERROR',
                'Provide at least one valid line item or billable time_entry_id',
            );
            return;
        }

        const normalizedProjectId = typeof project_id === 'string' && project_id.trim() ? project_id.trim() : null;
        await assertProjectBelongsToOrganization(normalizedProjectId, req.user!.organization_id);

        const subtotal = Number(
            normalizedLineItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2),
        );
        const taxRateValue = parseTaxRate(tax_rate);
        const total = Number((subtotal * (1 + taxRateValue / 100)).toFixed(2));
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomPart = Math.floor(1000 + Math.random() * 9000);
        const invoiceNumber = `INV-${datePart}-${randomPart}`;

        const invoice = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const createdInvoice = await tx.invoice.create({
                data: {
                    invoice_number: invoiceNumber,
                    client_name: clientName,
                    client_email: typeof client_email === 'string' && client_email.trim() ? client_email.trim() : null,
                    project_id: normalizedProjectId,
                    user_id: userId,
                    organization_id: req.user!.organization_id,
                    subtotal,
                    tax_rate: taxRateValue,
                    total,
                    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
                    due_date: dueDate,
                },
            });

            await tx.invoiceLineItem.createMany({
                data: normalizedLineItems.map((lineItem) => ({
                    invoice_id: createdInvoice.id,
                    time_entry_id: lineItem.time_entry_id,
                    expense_id: lineItem.expense_id,
                    description: lineItem.description,
                    hours: lineItem.hours,
                    rate: lineItem.rate,
                    amount: lineItem.amount,
                })),
            });

            return createdInvoice;
        });

        const fullInvoice = await prisma.invoice.findFirst({
            where: { id: invoice.id, organization_id: req.user!.organization_id },
            include: { line_items: true, project: { select: { name: true } } },
        });

        res.status(201).json(fullInvoice);
    } catch (error) {
        if (sendTenantOwnershipError(res, error)) return;
        console.error('Failed to create invoice:', error);
        sendApiError(res, 500, 'INVOICE_CREATE_FAILED', 'Internal server error');
    }
};

export const createAutopilotInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            sendApiError(res, 401, 'AUTH_REQUIRED', 'Authenticated user required');
            return;
        }

        const projectId = typeof req.body?.project_id === 'string' && req.body.project_id.trim()
            ? req.body.project_id.trim()
            : null;
        const clientName = typeof req.body?.client_name === 'string' && req.body.client_name.trim()
            ? req.body.client_name.trim()
            : null;
        const taxRateValue = parseTaxRate(req.body?.tax_rate);

        const where: Prisma.TimeEntryWhereInput = {
            status: 'approved',
            is_billable: true,
            invoice_line_items: { none: {} },
            organization_id: req.user!.organization_id,
        };

        if (projectId) {
            await assertProjectBelongsToOrganization(projectId, req.user!.organization_id);
            where.project_id = projectId;
        }

        const entries = await prisma.timeEntry.findMany({
            where,
            include: {
                project: { select: { id: true, name: true } },
                user: { select: { hourly_rate: true, first_name: true, last_name: true } },
            },
            orderBy: { start_time: 'asc' },
        });

        if (entries.length === 0) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'No approved billable entries are available for autopilot invoicing');
            return;
        }

        const resolvedProjectId = projectId || entries[0].project?.id || null;
        const resolvedClientName = clientName || entries[0].project?.name || 'Web Forx Client';

        const lineItems: NormalizedLineItem[] = entries.map((entry) => {
            const hours = Number((entry.duration / 3600).toFixed(2));
            const rate = Number.parseFloat(entry.user.hourly_rate?.toString() || '0');
            const actorName = `${entry.user.first_name} ${entry.user.last_name}`.trim();

            return {
                time_entry_id: entry.id,
                description: `${entry.task_description} (${actorName})`,
                hours,
                rate,
                amount: Number((hours * rate).toFixed(2)),
            };
        });

        const subtotal = Number(lineItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
        const total = Number((subtotal * (1 + taxRateValue / 100)).toFixed(2));
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomPart = Math.floor(1000 + Math.random() * 9000);
        const invoiceNumber = `INV-${datePart}-${randomPart}`;

        const invoice = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const createdInvoice = await tx.invoice.create({
                data: {
                    invoice_number: invoiceNumber,
                    client_name: resolvedClientName,
                    project_id: resolvedProjectId,
                    user_id: userId,
                    organization_id: req.user!.organization_id,
                    subtotal,
                    tax_rate: taxRateValue,
                    total,
                    notes: 'Generated by billing autopilot from approved billable time entries.',
                },
            });

            await tx.invoiceLineItem.createMany({
                data: lineItems.map((lineItem) => ({
                    invoice_id: createdInvoice.id,
                    time_entry_id: lineItem.time_entry_id,
                    description: lineItem.description,
                    hours: lineItem.hours,
                    rate: lineItem.rate,
                    amount: lineItem.amount,
                })),
            });

            return createdInvoice;
        });

        const fullInvoice = await prisma.invoice.findFirst({
            where: { id: invoice.id, organization_id: req.user!.organization_id },
            include: {
                project: { select: { name: true } },
                line_items: true,
            },
        });

        res.status(201).json({
            message: `Billing autopilot created ${lineItems.length} line items from approved billable work.`,
            invoice: fullInvoice,
        });
    } catch (error) {
        if (sendTenantOwnershipError(res, error)) return;
        console.error('Failed to create autopilot invoice:', error);
        sendApiError(res, 500, 'INVOICE_AUTOPILOT_FAILED', 'Internal server error');
    }
};

export const getInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const invoiceId = req.params.id as string;
        const invoice = await prisma.invoice.findFirst({
            where: { id: invoiceId, organization_id: req.user!.organization_id },
            include: {
                project: { select: { name: true } },
                creator: { select: { first_name: true, last_name: true, email: true } },
                line_items: { include: { time_entry: { select: { start_time: true, end_time: true } } } },
            },
        });

        if (!invoice) {
            sendApiError(res, 404, 'INVOICE_NOT_FOUND', 'Invoice not found');
            return;
        }

        res.status(200).json(invoice);
    } catch (error) {
        console.error('Failed to get invoice:', error);
        sendApiError(res, 500, 'INVOICE_READ_FAILED', 'Internal server error');
    }
};

export const updateInvoiceStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const invoiceId = req.params.id as string;
        const { status } = req.body ?? {};
        if (!['sent', 'paid'].includes(status)) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'Status must be sent or paid');
            return;
        }

        const data: Record<string, unknown> = { status };
        if (status === 'sent') data.issued_at = new Date();
        if (status === 'paid') data.paid_at = new Date();

        const updated = await prisma.invoice.update({ where: { id: invoiceId, organization_id: req.user!.organization_id }, data });
        res.status(200).json(updated);
    } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
            sendApiError(res, 404, 'INVOICE_NOT_FOUND', 'Invoice not found');
            return;
        }
        console.error('Failed to update invoice status:', error);
        sendApiError(res, 500, 'INVOICE_UPDATE_FAILED', 'Internal server error');
    }
};

export const deleteInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const invoiceId = req.params.id as string;
        const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organization_id: req.user!.organization_id } });
        if (!invoice) {
            sendApiError(res, 404, 'INVOICE_NOT_FOUND', 'Invoice not found');
            return;
        }
        if (invoice.status !== 'draft') {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'Only draft invoices can be deleted');
            return;
        }
        await prisma.invoice.delete({ where: { id: invoiceId, organization_id: req.user!.organization_id } });
        res.status(200).json({ message: 'Invoice deleted' });
    } catch (error) {
        console.error('Failed to delete invoice:', error);
        sendApiError(res, 500, 'INVOICE_DELETE_FAILED', 'Internal server error');
    }
};

/**
 * GET /invoices/:id/pdf
 * Streams a PDF version of the invoice to the client.
 */
export const downloadInvoicePdf = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const invoiceId = req.params.id as string;
        const invoice = await prisma.invoice.findFirst({
            where: { id: invoiceId, organization_id: req.user!.organization_id },
            include: {
                project: { select: { name: true } },
                creator: { select: { first_name: true, last_name: true, email: true } },
                line_items: true,
            },
        });

        if (!invoice) {
            sendApiError(res, 404, 'INVOICE_NOT_FOUND', 'Invoice not found');
            return;
        }

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const filename = `invoice-${invoice.invoice_number}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        doc.pipe(res);

        // ── Header ───────────────────────────────────────────────────────────
        doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', 50, 50);
        doc.fontSize(10).font('Helvetica').fillColor('#64748b')
            .text(`Invoice #${invoice.invoice_number}`, 50, 82)
            .text(`Issued: ${invoice.issued_at ? new Date(invoice.issued_at).toLocaleDateString() : new Date(invoice.created_at).toLocaleDateString()}`, 50, 96)
            .text(`Due: ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'On receipt'}`, 50, 110);

        // Status badge
        const statusColor = invoice.status === 'paid' ? '#16a34a' : invoice.status === 'sent' ? '#2563eb' : '#92400e';
        doc.roundedRect(400, 50, 140, 26, 4).fill(statusColor);
        doc.fillColor('white').fontSize(11).font('Helvetica-Bold')
            .text(invoice.status.toUpperCase(), 400, 57, { width: 140, align: 'center' });

        // ── Bill To ──────────────────────────────────────────────────────────
        doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text('BILL TO', 50, 150);
        doc.font('Helvetica').fillColor('#334155')
            .text(invoice.client_name, 50, 165)
            .text(invoice.client_email ?? '', 50, 179);

        // Project
        if (invoice.project?.name) {
            doc.fillColor('#64748b').text(`Project: ${invoice.project.name}`, 50, 196);
        }

        // ── From ─────────────────────────────────────────────────────────────
        doc.fillColor('#0f172a').font('Helvetica-Bold').text('FROM', 350, 150);
        doc.font('Helvetica').fillColor('#334155')
            .text(`${invoice.creator.first_name} ${invoice.creator.last_name}`, 350, 165)
            .text(invoice.creator.email, 350, 179);

        // ── Line items table ─────────────────────────────────────────────────
        const tableTop = 240;
        doc.fillColor('#f1f5f9').rect(50, tableTop, 495, 22).fill();
        doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold')
            .text('DESCRIPTION', 58, tableTop + 6)
            .text('HRS', 330, tableTop + 6, { width: 50, align: 'right' })
            .text('RATE', 388, tableTop + 6, { width: 60, align: 'right' })
            .text('AMOUNT', 455, tableTop + 6, { width: 85, align: 'right' });

        let y = tableTop + 30;
        for (const item of invoice.line_items) {
            doc.fillColor('#0f172a').font('Helvetica').fontSize(9)
                .text(item.description, 58, y, { width: 265 })
                .text(Number(item.hours).toFixed(2), 330, y, { width: 50, align: 'right' })
                .text(`$${Number(item.rate).toFixed(2)}`, 388, y, { width: 60, align: 'right' })
                .text(`$${Number(item.amount).toFixed(2)}`, 455, y, { width: 85, align: 'right' });
            y += 18;
            doc.fillColor('#f8fafc').rect(50, y - 1, 495, 1).fill();
        }

        // ── Totals ───────────────────────────────────────────────────────────
        y += 10;
        doc.fillColor('#64748b').font('Helvetica').fontSize(9)
            .text('Subtotal', 370, y, { width: 85 })
            .text(`$${Number(invoice.subtotal).toFixed(2)}`, 455, y, { width: 85, align: 'right' });
        y += 16;
        if (invoice.tax_rate && Number(invoice.tax_rate) > 0) {
            const tax = Number(invoice.subtotal) * (Number(invoice.tax_rate) / 100);
            doc.text(`Tax (${Number(invoice.tax_rate)}%)`, 370, y, { width: 85 })
                .text(`$${tax.toFixed(2)}`, 455, y, { width: 85, align: 'right' });
            y += 16;
        }
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11)
            .text('Total', 370, y, { width: 85 })
            .text(`$${Number(invoice.total).toFixed(2)}`, 455, y, { width: 85, align: 'right' });

        // ── Notes ────────────────────────────────────────────────────────────
        if (invoice.notes) {
            y += 40;
            doc.fillColor('#64748b').font('Helvetica').fontSize(9)
                .text('Notes', 50, y).moveDown(0.3)
                .fillColor('#334155').text(invoice.notes, 50, undefined, { width: 495 });
        }

        // ── Footer ───────────────────────────────────────────────────────────
        doc.fontSize(8).fillColor('#94a3b8')
            .text('Generated by Web Forx Time Tracker', 50, 780, { align: 'center', width: 495 });

        doc.end();
    } catch (error) {
        console.error('Failed to generate invoice PDF:', error);
        sendApiError(res, 500, 'PDF_FAILED', 'Failed to generate PDF');
    }
};
