import { Prisma } from '@prisma/client';
import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { sendApiError } from '../utils/http';

interface NormalizedLineItem {
    time_entry_id?: string;
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

const buildLineItemsFromEntries = async (timeEntryIds: string[]): Promise<NormalizedLineItem[] | null> => {
    if (timeEntryIds.length === 0) {
        return null;
    }

    const entries = await prisma.timeEntry.findMany({
        where: { id: { in: timeEntryIds }, is_billable: true },
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

        const where: Record<string, unknown> = {};
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

        let normalizedLineItems = normalizeManualLineItems(line_items);
        if (!normalizedLineItems) {
            const timeEntryIds = Array.isArray(time_entry_ids)
                ? time_entry_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
                : [];

            normalizedLineItems = await buildLineItemsFromEntries(timeEntryIds);
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
                    project_id: typeof project_id === 'string' && project_id.trim() ? project_id.trim() : null,
                    user_id: userId,
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
                    description: lineItem.description,
                    hours: lineItem.hours,
                    rate: lineItem.rate,
                    amount: lineItem.amount,
                })),
            });

            return createdInvoice;
        });

        const fullInvoice = await prisma.invoice.findUnique({
            where: { id: invoice.id },
            include: { line_items: true, project: { select: { name: true } } },
        });

        res.status(201).json(fullInvoice);
    } catch (error) {
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
        };

        if (projectId) {
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

        const fullInvoice = await prisma.invoice.findUnique({
            where: { id: invoice.id },
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
        console.error('Failed to create autopilot invoice:', error);
        sendApiError(res, 500, 'INVOICE_AUTOPILOT_FAILED', 'Internal server error');
    }
};

export const getInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const invoiceId = req.params.id as string;
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
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

        const updated = await prisma.invoice.update({ where: { id: invoiceId }, data });
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
        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) {
            sendApiError(res, 404, 'INVOICE_NOT_FOUND', 'Invoice not found');
            return;
        }
        if (invoice.status !== 'draft') {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'Only draft invoices can be deleted');
            return;
        }
        await prisma.invoice.delete({ where: { id: invoiceId } });
        res.status(200).json({ message: 'Invoice deleted' });
    } catch (error) {
        console.error('Failed to delete invoice:', error);
        sendApiError(res, 500, 'INVOICE_DELETE_FAILED', 'Internal server error');
    }
};
