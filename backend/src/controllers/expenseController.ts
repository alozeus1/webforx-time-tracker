import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import {
    createReceiptObjectKey,
    isExpenseReceiptStorageConfigured,
    signReceiptDownload,
    signReceiptUpload,
    validateReceiptMetadata,
} from '../services/expenseReceiptService';

const CATEGORIES = new Set(['travel', 'meals', 'supplies', 'software', 'equipment', 'other']);
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

const canReview = (req: AuthRequest) => req.user?.role === 'Manager' || req.user?.role === 'Admin';

const expenseInclude = {
    owner: { select: { id: true, first_name: true, last_name: true, email: true } },
    project: { select: { id: true, name: true } },
    attachments: { select: { id: true, file_name: true, content_type: true, size_bytes: true, created_at: true } },
    invoice_line_item: { select: { id: true, invoice_id: true } },
} as const;

const normalizeExpense = (body: Record<string, unknown>) => {
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const category = typeof body.category === 'string' ? body.category.toLowerCase() : '';
    const amount = Number(body.amount);
    const currency = typeof body.currency === 'string' ? body.currency.toUpperCase() : 'USD';
    const incurredOn = new Date(typeof body.incurred_on === 'string' ? body.incurred_on : '');
    const projectId = typeof body.project_id === 'string' && body.project_id.trim() ? body.project_id.trim() : null;
    const isBillable = body.is_billable === true;
    if (!description || !CATEGORIES.has(category) || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;
    if (!CURRENCY_PATTERN.test(currency) || Number.isNaN(incurredOn.getTime())) return null;
    return { description, category, amount, currency, incurredOn, projectId, isBillable };
};

const projectExists = async (organizationId: string, projectId: string | null) => {
    if (!projectId) return true;
    return Boolean(await prisma.project.findFirst({
        where: { id: projectId, organization_id: organizationId, is_active: true },
        select: { id: true },
    }));
};

export const getExpenseUploadCapability = (_req: AuthRequest, res: Response): void => {
    res.status(200).json({ configured: isExpenseReceiptStorageConfigured(), max_file_bytes: 10 * 1024 * 1024 });
};

export const signExpenseReceiptUpload = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (!isExpenseReceiptStorageConfigured()) {
            res.status(503).json({ message: 'Receipt storage is not configured for this environment.' });
            return;
        }
        const fileName = typeof req.body?.file_name === 'string' ? req.body.file_name.trim() : '';
        const contentType = typeof req.body?.content_type === 'string' ? req.body.content_type : '';
        const sizeBytes = Number(req.body?.size_bytes);
        if (!fileName || !validateReceiptMetadata(contentType, sizeBytes)) {
            res.status(400).json({ message: 'Receipt must be a JPEG, PNG, WebP, or PDF no larger than 10 MB.' });
            return;
        }
        const objectKey = createReceiptObjectKey(req.user!.organization_id, req.user!.userId, fileName);
        const uploadUrl = await signReceiptUpload(objectKey, contentType);
        res.status(200).json({ upload_url: uploadUrl, object_key: objectKey, method: 'PUT', headers: { 'Content-Type': contentType, 'x-amz-server-side-encryption': 'AES256' } });
    } catch (error) {
        console.error('Failed to sign expense receipt upload:', error);
        res.status(500).json({ message: 'Unable to prepare receipt upload.' });
    }
};

export const listExpenses = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const where: Record<string, unknown> = { organization_id: req.user!.organization_id };
        if (!canReview(req)) where.user_id = req.user!.userId;
        if (typeof req.query.status === 'string' && ['pending', 'approved', 'rejected'].includes(req.query.status)) where.status = req.query.status;
        if (typeof req.query.project_id === 'string' && req.query.project_id) where.project_id = req.query.project_id;
        if (req.query.billable === 'true') where.is_billable = true;
        if (req.query.uninvoiced === 'true') where.invoice_line_item = null;

        const expenses = await prisma.expense.findMany({ where, include: expenseInclude, orderBy: { incurred_on: 'desc' } });
        res.status(200).json({ expenses, receipt_upload_configured: isExpenseReceiptStorageConfigured() });
    } catch (error) {
        console.error('Failed to list expenses:', error);
        res.status(500).json({ message: 'Internal server error while loading expenses.' });
    }
};

export const createExpense = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const payload = normalizeExpense(req.body ?? {});
        if (!payload) {
            res.status(400).json({ message: 'Valid description, category, amount, currency, and incurred date are required.' });
            return;
        }
        if (!await projectExists(req.user!.organization_id, payload.projectId)) {
            res.status(404).json({ message: 'Project not found.' });
            return;
        }

        const rawAttachments: Array<Record<string, unknown>> = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
        const prefix = `expenses/${req.user!.organization_id}/${req.user!.userId}/`;
        const attachments = rawAttachments.map((item: Record<string, unknown>) => ({
            object_key: typeof item?.object_key === 'string' ? item.object_key : '',
            file_name: typeof item?.file_name === 'string' ? item.file_name.trim() : '',
            content_type: typeof item?.content_type === 'string' ? item.content_type : '',
            size_bytes: Number(item?.size_bytes),
        }));
        if (attachments.some((item) => !item.object_key.startsWith(prefix) || !item.file_name || !validateReceiptMetadata(item.content_type, item.size_bytes))) {
            res.status(400).json({ message: 'One or more receipt attachments are invalid.' });
            return;
        }

        const expense = await prisma.expense.create({
            data: {
                organization_id: req.user!.organization_id,
                user_id: req.user!.userId,
                project_id: payload.projectId,
                description: payload.description,
                category: payload.category,
                amount: payload.amount,
                currency: payload.currency,
                incurred_on: payload.incurredOn,
                is_billable: payload.isBillable,
                attachments: attachments.length ? {
                    create: attachments.map((item) => ({ ...item, organization_id: req.user!.organization_id })),
                } : undefined,
            },
            include: expenseInclude,
        });
        res.status(201).json(expense);
    } catch (error) {
        console.error('Failed to create expense:', error);
        res.status(500).json({ message: 'Internal server error while creating the expense.' });
    }
};

export const updateExpense = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
        const existing = await prisma.expense.findFirst({ where: { id: expenseId, organization_id: req.user!.organization_id } });
        if (!existing) { res.status(404).json({ message: 'Expense not found.' }); return; }
        if (!canReview(req) && existing.user_id !== req.user!.userId) { res.status(403).json({ message: 'Forbidden.' }); return; }
        if (existing.status !== 'pending' || existing.user_id !== req.user!.userId) {
            res.status(409).json({ message: 'Only the owner can edit a pending expense.' });
            return;
        }
        const payload = normalizeExpense({
            description: req.body?.description ?? existing.description,
            category: req.body?.category ?? existing.category,
            amount: req.body?.amount ?? existing.amount.toString(),
            currency: req.body?.currency ?? existing.currency,
            incurred_on: req.body?.incurred_on ?? existing.incurred_on.toISOString(),
            project_id: req.body?.project_id === undefined ? existing.project_id : req.body.project_id,
            is_billable: req.body?.is_billable ?? existing.is_billable,
        });
        if (!payload || !await projectExists(req.user!.organization_id, payload.projectId)) {
            res.status(400).json({ message: 'The updated expense is invalid.' });
            return;
        }
        const expense = await prisma.expense.update({
            where: { id: existing.id },
            data: { description: payload.description, category: payload.category, amount: payload.amount, currency: payload.currency, incurred_on: payload.incurredOn, project_id: payload.projectId, is_billable: payload.isBillable },
            include: expenseInclude,
        });
        res.status(200).json(expense);
    } catch (error) {
        console.error('Failed to update expense:', error);
        res.status(500).json({ message: 'Internal server error while updating the expense.' });
    }
};

export const reviewExpense = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
        const status = req.body?.status;
        if (!['approved', 'rejected'].includes(status)) { res.status(400).json({ message: 'Status must be approved or rejected.' }); return; }
        const existing = await prisma.expense.findFirst({ where: { id: expenseId, organization_id: req.user!.organization_id } });
        if (!existing) { res.status(404).json({ message: 'Expense not found.' }); return; }
        if (existing.status !== 'pending') { res.status(409).json({ message: 'Expense has already been reviewed.' }); return; }
        const expense = await prisma.expense.update({
            where: { id: existing.id },
            data: { status, reviewed_by: req.user!.userId, reviewed_at: new Date(), reviewer_note: typeof req.body?.reviewer_note === 'string' && req.body.reviewer_note.trim() ? req.body.reviewer_note.trim() : null },
            include: expenseInclude,
        });
        res.status(200).json(expense);
    } catch (error) {
        console.error('Failed to review expense:', error);
        res.status(500).json({ message: 'Internal server error while reviewing the expense.' });
    }
};

export const deleteExpense = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
        const existing = await prisma.expense.findFirst({ where: { id: expenseId, organization_id: req.user!.organization_id }, include: { invoice_line_item: true } });
        if (!existing) { res.status(404).json({ message: 'Expense not found.' }); return; }
        if (!canReview(req) && existing.user_id !== req.user!.userId) { res.status(403).json({ message: 'Forbidden.' }); return; }
        if (existing.invoice_line_item || (!canReview(req) && existing.status !== 'pending')) {
            res.status(409).json({ message: 'Invoiced or reviewed expenses cannot be deleted.' });
            return;
        }
        await prisma.expense.delete({ where: { id: existing.id } });
        res.status(204).send();
    } catch (error) {
        console.error('Failed to delete expense:', error);
        res.status(500).json({ message: 'Internal server error while deleting the expense.' });
    }
};

export const getExpenseReceiptUrl = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
        const attachmentId = Array.isArray(req.params.attachmentId) ? req.params.attachmentId[0] : req.params.attachmentId;
        const attachment = await prisma.expenseAttachment.findFirst({
            where: { id: attachmentId, expense_id: expenseId, organization_id: req.user!.organization_id },
            include: { expense: { select: { user_id: true } } },
        });
        if (!attachment) { res.status(404).json({ message: 'Receipt not found.' }); return; }
        if (!canReview(req) && attachment.expense.user_id !== req.user!.userId) { res.status(403).json({ message: 'Forbidden.' }); return; }
        const url = await signReceiptDownload(attachment.object_key);
        res.status(200).json({ url, expires_in_seconds: 300 });
    } catch (error) {
        console.error('Failed to sign expense receipt download:', error);
        res.status(503).json({ message: 'Receipt storage is unavailable.' });
    }
};
