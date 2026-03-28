import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

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
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ message: 'Authenticated user required' }); return; }

        const { client_name, client_email, project_id, notes, due_date, tax_rate, time_entry_ids } = req.body ?? {};

        if (!client_name || !Array.isArray(time_entry_ids) || time_entry_ids.length === 0) {
            res.status(400).json({ message: 'client_name and time_entry_ids are required' });
            return;
        }

        const entries = await prisma.timeEntry.findMany({
            where: { id: { in: time_entry_ids }, is_billable: true },
            include: { user: { select: { hourly_rate: true } } },
        });

        if (entries.length === 0) {
            res.status(400).json({ message: 'No billable entries found for the given IDs' });
            return;
        }

        const lineItems = entries.map(entry => {
            const hours = entry.duration / 3600;
            const rate = parseFloat(entry.user.hourly_rate?.toString() || '0');
            return {
                time_entry_id: entry.id,
                description: entry.task_description,
                hours,
                rate,
                amount: parseFloat((hours * rate).toFixed(2)),
            };
        });

        const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
        const taxRateValue = typeof tax_rate === 'number' ? tax_rate : 0;
        const total = parseFloat((subtotal * (1 + taxRateValue / 100)).toFixed(2));
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomPart = Math.floor(1000 + Math.random() * 9000);
        const invoice_number = `INV-${datePart}-${randomPart}`;

        const invoice = await prisma.$transaction(async (tx) => {
            const inv = await tx.invoice.create({
                data: {
                    invoice_number,
                    client_name,
                    client_email: client_email || null,
                    project_id: project_id || null,
                    user_id: userId,
                    subtotal,
                    tax_rate: taxRateValue || null,
                    total,
                    notes: notes || null,
                    due_date: due_date ? new Date(due_date) : null,
                },
            });

            await tx.invoiceLineItem.createMany({
                data: lineItems.map(li => ({ ...li, invoice_id: inv.id })),
            });

            return inv;
        });

        const full = await prisma.invoice.findUnique({
            where: { id: invoice.id },
            include: { line_items: true, project: { select: { name: true } } },
        });

        res.status(201).json(full);
    } catch (error) {
        console.error('Failed to create invoice:', error);
        res.status(500).json({ message: 'Internal server error' });
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

        if (!invoice) { res.status(404).json({ message: 'Invoice not found' }); return; }
        res.status(200).json(invoice);
    } catch (error) {
        console.error('Failed to get invoice:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateInvoiceStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const invoiceId = req.params.id as string;
        const { status } = req.body ?? {};
        if (!['sent', 'paid'].includes(status)) {
            res.status(400).json({ message: 'Status must be sent or paid' });
            return;
        }

        const data: Record<string, unknown> = { status };
        if (status === 'sent') data.issued_at = new Date();
        if (status === 'paid') data.paid_at = new Date();

        const updated = await prisma.invoice.update({ where: { id: invoiceId }, data });
        res.status(200).json(updated);
    } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
            res.status(404).json({ message: 'Invoice not found' });
            return;
        }
        console.error('Failed to update invoice status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const invoiceId = req.params.id as string;
        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) { res.status(404).json({ message: 'Invoice not found' }); return; }
        if (invoice.status !== 'draft') {
            res.status(400).json({ message: 'Only draft invoices can be deleted' });
            return;
        }
        await prisma.invoice.delete({ where: { id: invoiceId } });
        res.status(200).json({ message: 'Invoice deleted' });
    } catch (error) {
        console.error('Failed to delete invoice:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
