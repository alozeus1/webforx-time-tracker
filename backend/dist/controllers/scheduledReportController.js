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
exports.deleteScheduledReport = exports.updateScheduledReport = exports.createScheduledReport = exports.listScheduledReports = void 0;
const db_1 = __importDefault(require("../config/db"));
const http_1 = require("../utils/http");
const normalizeRecipients = (value) => {
    if (!Array.isArray(value)) {
        return null;
    }
    const emails = value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
    if (emails.length === 0) {
        return null;
    }
    return Array.from(new Set(emails));
};
const listScheduledReports = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        const canViewAll = role === 'Manager' || role === 'Admin';
        const reports = yield db_1.default.scheduledReport.findMany({
            where: canViewAll ? undefined : { user_id: userId },
            orderBy: { created_at: 'desc' },
            include: { user: { select: { first_name: true, last_name: true, email: true } } },
        });
        res.status(200).json({ reports });
    }
    catch (error) {
        console.error('Failed to list scheduled reports:', error);
        (0, http_1.sendApiError)(res, 500, 'SCHEDULED_REPORT_LIST_FAILED', 'Internal server error');
    }
});
exports.listScheduledReports = listScheduledReports;
const createScheduledReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            (0, http_1.sendApiError)(res, 401, 'AUTH_REQUIRED', 'Authenticated user required');
            return;
        }
        const { frequency, day_of_week, recipients, report_type } = (_b = req.body) !== null && _b !== void 0 ? _b : {};
        if (!['weekly', 'monthly'].includes(frequency)) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'Frequency must be weekly or monthly');
            return;
        }
        const parsedDayOfWeek = day_of_week !== undefined ? Number(day_of_week) : null;
        if (frequency === 'weekly') {
            if (parsedDayOfWeek === null
                || !Number.isInteger(parsedDayOfWeek)
                || parsedDayOfWeek < 0
                || parsedDayOfWeek > 6) {
                (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'day_of_week must be between 0 and 6 for weekly reports');
                return;
            }
        }
        const normalizedRecipients = normalizeRecipients(recipients);
        if (!normalizedRecipients) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'At least one recipient email is required');
            return;
        }
        const report = yield db_1.default.scheduledReport.create({
            data: {
                user_id: userId,
                frequency,
                day_of_week: frequency === 'weekly' ? parsedDayOfWeek : null,
                recipients: normalizedRecipients,
                report_type: typeof report_type === 'string' && report_type.trim() ? report_type.trim() : 'summary',
            },
        });
        res.status(201).json(report);
    }
    catch (error) {
        console.error('Failed to create scheduled report:', error);
        (0, http_1.sendApiError)(res, 500, 'SCHEDULED_REPORT_CREATE_FAILED', 'Internal server error');
    }
});
exports.createScheduledReport = createScheduledReport;
const updateScheduledReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = {};
        if (req.body.frequency) {
            if (!['weekly', 'monthly'].includes(req.body.frequency)) {
                (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'Frequency must be weekly or monthly');
                return;
            }
            data.frequency = req.body.frequency;
        }
        if (req.body.day_of_week !== undefined) {
            const day = Number(req.body.day_of_week);
            if (!Number.isInteger(day) || day < 0 || day > 6) {
                (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'day_of_week must be between 0 and 6');
                return;
            }
            data.day_of_week = day;
        }
        if (req.body.recipients !== undefined) {
            const normalizedRecipients = normalizeRecipients(req.body.recipients);
            if (!normalizedRecipients) {
                (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'At least one recipient email is required');
                return;
            }
            data.recipients = normalizedRecipients;
        }
        if (req.body.report_type)
            data.report_type = req.body.report_type;
        if (typeof req.body.is_active === 'boolean')
            data.is_active = req.body.is_active;
        if (Object.keys(data).length === 0) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'No valid fields provided');
            return;
        }
        const reportId = req.params.id;
        const report = yield db_1.default.scheduledReport.update({
            where: { id: reportId },
            data,
        });
        res.status(200).json(report);
    }
    catch (error) {
        if (error.code === 'P2025') {
            (0, http_1.sendApiError)(res, 404, 'SCHEDULED_REPORT_NOT_FOUND', 'Scheduled report not found');
            return;
        }
        console.error('Failed to update scheduled report:', error);
        (0, http_1.sendApiError)(res, 500, 'SCHEDULED_REPORT_UPDATE_FAILED', 'Internal server error');
    }
});
exports.updateScheduledReport = updateScheduledReport;
const deleteScheduledReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const reportId = req.params.id;
        yield db_1.default.scheduledReport.delete({ where: { id: reportId } });
        res.status(200).json({ message: 'Scheduled report deleted' });
    }
    catch (error) {
        if (error.code === 'P2025') {
            (0, http_1.sendApiError)(res, 404, 'SCHEDULED_REPORT_NOT_FOUND', 'Scheduled report not found');
            return;
        }
        console.error('Failed to delete scheduled report:', error);
        (0, http_1.sendApiError)(res, 500, 'SCHEDULED_REPORT_DELETE_FAILED', 'Internal server error');
    }
});
exports.deleteScheduledReport = deleteScheduledReport;
