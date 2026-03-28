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
exports.deleteInvoice = exports.updateInvoiceStatus = exports.getInvoice = exports.createInvoice = exports.listInvoices = void 0;
const db_1 = __importDefault(require("../config/db"));
const http_1 = require("../utils/http");
const parseNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};
const parseTaxRate = (value) => {
    const parsed = parseNumber(value);
    if (parsed === null) {
        return 0;
    }
    return Math.max(0, Math.min(parsed, 100));
};
const normalizeManualLineItems = (value) => {
    if (!Array.isArray(value) || value.length === 0) {
        return null;
    }
    const normalized = [];
    for (const item of value) {
        if (typeof item !== 'object' || item === null) {
            return null;
        }
        const raw = item;
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
const buildLineItemsFromEntries = (timeEntryIds) => __awaiter(void 0, void 0, void 0, function* () {
    if (timeEntryIds.length === 0) {
        return null;
    }
    const entries = yield db_1.default.timeEntry.findMany({
        where: { id: { in: timeEntryIds }, is_billable: true },
        include: { user: { select: { hourly_rate: true } } },
    });
    if (entries.length === 0) {
        return null;
    }
    return entries.map((entry) => {
        var _a;
        const hours = Number((entry.duration / 3600).toFixed(2));
        const rate = Number.parseFloat(((_a = entry.user.hourly_rate) === null || _a === void 0 ? void 0 : _a.toString()) || '0');
        return {
            time_entry_id: entry.id,
            description: entry.task_description,
            hours,
            rate,
            amount: Number((hours * rate).toFixed(2)),
        };
    });
});
const listInvoices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        const canViewAll = role === 'Manager' || role === 'Admin';
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : undefined;
        const where = {};
        if (!canViewAll)
            where.user_id = userId;
        if (status)
            where.status = status;
        if (projectId)
            where.project_id = projectId;
        const invoices = yield db_1.default.invoice.findMany({
            where,
            include: {
                project: { select: { name: true } },
                creator: { select: { first_name: true, last_name: true } },
                line_items: true,
            },
            orderBy: { created_at: 'desc' },
        });
        res.status(200).json({ invoices });
    }
    catch (error) {
        console.error('Failed to list invoices:', error);
        (0, http_1.sendApiError)(res, 500, 'INVOICE_LIST_FAILED', 'Internal server error');
    }
});
exports.listInvoices = listInvoices;
const createInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            (0, http_1.sendApiError)(res, 401, 'AUTH_REQUIRED', 'Authenticated user required');
            return;
        }
        const { client_name, client_email, project_id, notes, due_date, tax_rate, time_entry_ids, line_items, } = (_b = req.body) !== null && _b !== void 0 ? _b : {};
        const clientName = typeof client_name === 'string' ? client_name.trim() : '';
        if (!clientName) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'client_name is required');
            return;
        }
        const dueDate = typeof due_date === 'string' && due_date.trim() ? new Date(due_date) : null;
        if (dueDate && Number.isNaN(dueDate.getTime())) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'due_date must be a valid date string');
            return;
        }
        let normalizedLineItems = normalizeManualLineItems(line_items);
        if (!normalizedLineItems) {
            const timeEntryIds = Array.isArray(time_entry_ids)
                ? time_entry_ids.filter((id) => typeof id === 'string' && id.trim().length > 0)
                : [];
            normalizedLineItems = yield buildLineItemsFromEntries(timeEntryIds);
        }
        if (!normalizedLineItems || normalizedLineItems.length === 0) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'Provide at least one valid line item or billable time_entry_id');
            return;
        }
        const subtotal = Number(normalizedLineItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
        const taxRateValue = parseTaxRate(tax_rate);
        const total = Number((subtotal * (1 + taxRateValue / 100)).toFixed(2));
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomPart = Math.floor(1000 + Math.random() * 9000);
        const invoiceNumber = `INV-${datePart}-${randomPart}`;
        const invoice = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const createdInvoice = yield tx.invoice.create({
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
            yield tx.invoiceLineItem.createMany({
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
        }));
        const fullInvoice = yield db_1.default.invoice.findUnique({
            where: { id: invoice.id },
            include: { line_items: true, project: { select: { name: true } } },
        });
        res.status(201).json(fullInvoice);
    }
    catch (error) {
        console.error('Failed to create invoice:', error);
        (0, http_1.sendApiError)(res, 500, 'INVOICE_CREATE_FAILED', 'Internal server error');
    }
});
exports.createInvoice = createInvoice;
const getInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const invoiceId = req.params.id;
        const invoice = yield db_1.default.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                project: { select: { name: true } },
                creator: { select: { first_name: true, last_name: true, email: true } },
                line_items: { include: { time_entry: { select: { start_time: true, end_time: true } } } },
            },
        });
        if (!invoice) {
            (0, http_1.sendApiError)(res, 404, 'INVOICE_NOT_FOUND', 'Invoice not found');
            return;
        }
        res.status(200).json(invoice);
    }
    catch (error) {
        console.error('Failed to get invoice:', error);
        (0, http_1.sendApiError)(res, 500, 'INVOICE_READ_FAILED', 'Internal server error');
    }
});
exports.getInvoice = getInvoice;
const updateInvoiceStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const invoiceId = req.params.id;
        const { status } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
        if (!['sent', 'paid'].includes(status)) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'Status must be sent or paid');
            return;
        }
        const data = { status };
        if (status === 'sent')
            data.issued_at = new Date();
        if (status === 'paid')
            data.paid_at = new Date();
        const updated = yield db_1.default.invoice.update({ where: { id: invoiceId }, data });
        res.status(200).json(updated);
    }
    catch (error) {
        if (error.code === 'P2025') {
            (0, http_1.sendApiError)(res, 404, 'INVOICE_NOT_FOUND', 'Invoice not found');
            return;
        }
        console.error('Failed to update invoice status:', error);
        (0, http_1.sendApiError)(res, 500, 'INVOICE_UPDATE_FAILED', 'Internal server error');
    }
});
exports.updateInvoiceStatus = updateInvoiceStatus;
const deleteInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const invoiceId = req.params.id;
        const invoice = yield db_1.default.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) {
            (0, http_1.sendApiError)(res, 404, 'INVOICE_NOT_FOUND', 'Invoice not found');
            return;
        }
        if (invoice.status !== 'draft') {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'Only draft invoices can be deleted');
            return;
        }
        yield db_1.default.invoice.delete({ where: { id: invoiceId } });
        res.status(200).json({ message: 'Invoice deleted' });
    }
    catch (error) {
        console.error('Failed to delete invoice:', error);
        (0, http_1.sendApiError)(res, 500, 'INVOICE_DELETE_FAILED', 'Internal server error');
    }
});
exports.deleteInvoice = deleteInvoice;
