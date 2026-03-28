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
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.listScheduledReports = listScheduledReports;
const createScheduledReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            res.status(401).json({ message: 'Authenticated user required' });
            return;
        }
        const { frequency, day_of_week, recipients, report_type } = (_b = req.body) !== null && _b !== void 0 ? _b : {};
        if (!['weekly', 'monthly'].includes(frequency)) {
            res.status(400).json({ message: 'Frequency must be weekly or monthly' });
            return;
        }
        const report = yield db_1.default.scheduledReport.create({
            data: {
                user_id: userId,
                frequency,
                day_of_week: typeof day_of_week === 'number' ? day_of_week : null,
                recipients: Array.isArray(recipients) ? recipients : [],
                report_type: report_type || 'summary',
            },
        });
        res.status(201).json(report);
    }
    catch (error) {
        console.error('Failed to create scheduled report:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.createScheduledReport = createScheduledReport;
const updateScheduledReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = {};
        if (req.body.frequency)
            data.frequency = req.body.frequency;
        if (req.body.day_of_week !== undefined)
            data.day_of_week = req.body.day_of_week;
        if (req.body.recipients)
            data.recipients = req.body.recipients;
        if (req.body.report_type)
            data.report_type = req.body.report_type;
        if (typeof req.body.is_active === 'boolean')
            data.is_active = req.body.is_active;
        const reportId = req.params.id;
        const report = yield db_1.default.scheduledReport.update({
            where: { id: reportId },
            data,
        });
        res.status(200).json(report);
    }
    catch (error) {
        if (error.code === 'P2025') {
            res.status(404).json({ message: 'Scheduled report not found' });
            return;
        }
        console.error('Failed to update scheduled report:', error);
        res.status(500).json({ message: 'Internal server error' });
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
            res.status(404).json({ message: 'Scheduled report not found' });
            return;
        }
        console.error('Failed to delete scheduled report:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.deleteScheduledReport = deleteScheduledReport;
