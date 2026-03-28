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
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.listInvoices = listInvoices;
const createInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            res.status(401).json({ message: 'Authenticated user required' });
            return;
        }
        const { client_name, client_email, project_id, notes, due_date, tax_rate, time_entry_ids } = (_b = req.body) !== null && _b !== void 0 ? _b : {};
        if (!client_name || !Array.isArray(time_entry_ids) || time_entry_ids.length === 0) {
            res.status(400).json({ message: 'client_name and time_entry_ids are required' });
            return;
        }
        const entries = yield db_1.default.timeEntry.findMany({
            where: { id: { in: time_entry_ids }, is_billable: true },
            include: { user: { select: { hourly_rate: true } } },
        });
        if (entries.length === 0) {
            res.status(400).json({ message: 'No billable entries found for the given IDs' });
            return;
        }
        const lineItems = entries.map(entry => {
            var _a;
            const hours = entry.duration / 3600;
            const rate = parseFloat(((_a = entry.user.hourly_rate) === null || _a === void 0 ? void 0 : _a.toString()) || '0');
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
        const invoice = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const inv = yield tx.invoice.create({
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
            yield tx.invoiceLineItem.createMany({
                data: lineItems.map(li => (Object.assign(Object.assign({}, li), { invoice_id: inv.id }))),
            });
            return inv;
        }));
        const full = yield db_1.default.invoice.findUnique({
            where: { id: invoice.id },
            include: { line_items: true, project: { select: { name: true } } },
        });
        res.status(201).json(full);
    }
    catch (error) {
        console.error('Failed to create invoice:', error);
        res.status(500).json({ message: 'Internal server error' });
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
            res.status(404).json({ message: 'Invoice not found' });
            return;
        }
        res.status(200).json(invoice);
    }
    catch (error) {
        console.error('Failed to get invoice:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getInvoice = getInvoice;
const updateInvoiceStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const invoiceId = req.params.id;
        const { status } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
        if (!['sent', 'paid'].includes(status)) {
            res.status(400).json({ message: 'Status must be sent or paid' });
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
            res.status(404).json({ message: 'Invoice not found' });
            return;
        }
        console.error('Failed to update invoice status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.updateInvoiceStatus = updateInvoiceStatus;
const deleteInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const invoiceId = req.params.id;
        const invoice = yield db_1.default.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) {
            res.status(404).json({ message: 'Invoice not found' });
            return;
        }
        if (invoice.status !== 'draft') {
            res.status(400).json({ message: 'Only draft invoices can be deleted' });
            return;
        }
        yield db_1.default.invoice.delete({ where: { id: invoiceId } });
        res.status(200).json({ message: 'Invoice deleted' });
    }
    catch (error) {
        console.error('Failed to delete invoice:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.deleteInvoice = deleteInvoice;
