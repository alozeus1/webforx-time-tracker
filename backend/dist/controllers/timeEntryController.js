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
exports.reviewTimesheet = exports.getPendingTimesheets = exports.pingTimer = exports.getMyEntries = exports.manualEntry = exports.stopTimer = exports.startTimer = void 0;
const db_1 = __importDefault(require("../config/db"));
const requireUserId = (req) => {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
        throw new Error('Authenticated user is required');
    }
    return req.user.userId;
};
const startTimer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const project_id = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.project_id) === 'string' && req.body.project_id.trim() ? req.body.project_id : null;
        const task_description = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.task_description) === 'string' ? req.body.task_description.trim() : '';
        const user_id = requireUserId(req);
        if (!task_description) {
            res.status(400).json({ message: 'Task description is required to start a timer' });
            return;
        }
        const existingTimer = yield db_1.default.activeTimer.findUnique({ where: { user_id } });
        if (existingTimer) {
            res.status(400).json({ message: 'A timer is already running for this user' });
            return;
        }
        const newTimer = yield db_1.default.activeTimer.create({
            data: {
                user_id,
                project_id,
                task_description,
                start_time: new Date(),
            },
        });
        res.status(201).json(newTimer);
    }
    catch (error) {
        console.error('Failed to start timer:', error);
        res.status(500).json({ message: 'Internal server error while starting timer' });
    }
});
exports.startTimer = startTimer;
const stopTimer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const user_id = requireUserId(req);
        const notes = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.notes) === 'string' && req.body.notes.trim() ? req.body.notes.trim() : null;
        const activeTimer = yield db_1.default.activeTimer.findUnique({ where: { user_id } });
        if (!activeTimer) {
            res.status(404).json({ message: 'No active timer found' });
            return;
        }
        const end_time = new Date();
        const duration = Math.floor((end_time.getTime() - new Date(activeTimer.start_time).getTime()) / 1000);
        if (duration <= 0) {
            res.status(400).json({ message: 'Timer duration was invalid. Please try again.' });
            return;
        }
        const timeEntry = yield db_1.default.timeEntry.create({
            data: {
                user_id,
                project_id: activeTimer.project_id,
                task_description: activeTimer.task_description,
                start_time: activeTimer.start_time,
                end_time,
                duration,
                entry_type: 'timer',
                notes,
            },
        });
        yield db_1.default.activeTimer.delete({ where: { user_id } });
        res.status(200).json(timeEntry);
    }
    catch (error) {
        console.error('Failed to stop timer:', error);
        res.status(500).json({ message: 'Internal server error while stopping timer' });
    }
});
exports.stopTimer = stopTimer;
const manualEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { project_id, task_description, start_time, end_time, notes, } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
        const user_id = requireUserId(req);
        const start = new Date(start_time);
        const end = new Date(end_time);
        const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || duration <= 0) {
            res.status(400).json({ message: 'Invalid manual time entry window' });
            return;
        }
        if (typeof task_description !== 'string' || !task_description.trim()) {
            res.status(400).json({ message: 'Task description is required for manual entries' });
            return;
        }
        const timeEntry = yield db_1.default.timeEntry.create({
            data: {
                user_id,
                project_id: typeof project_id === 'string' && project_id.trim() ? project_id : null,
                task_description: task_description.trim(),
                start_time: start,
                end_time: end,
                duration,
                entry_type: 'manual',
                notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
            },
        });
        yield db_1.default.auditLog.create({
            data: {
                user_id,
                action: 'manual_time_entry_created',
                resource: 'time_entry',
                metadata: {
                    entry_id: timeEntry.id,
                    project_id,
                    start_time,
                    end_time,
                },
            },
        });
        res.status(201).json(timeEntry);
    }
    catch (error) {
        console.error('Failed to create manual entry:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.manualEntry = manualEntry;
const getMyEntries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user_id = requireUserId(req);
        const entries = yield db_1.default.timeEntry.findMany({
            where: { user_id },
            orderBy: { start_time: 'desc' },
            include: { project: { select: { name: true } } },
        });
        const activeTimer = yield db_1.default.activeTimer.findUnique({
            where: { user_id },
            include: { project: { select: { name: true } } },
        });
        res.status(200).json({ entries, activeTimer });
    }
    catch (error) {
        console.error('Failed to fetch timer entries:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getMyEntries = getMyEntries;
const pingTimer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user_id = requireUserId(req);
        const activeTimer = yield db_1.default.activeTimer.findUnique({
            where: { user_id },
        });
        if (!activeTimer) {
            res.status(404).json({ message: 'No active timer found to ping' });
            return;
        }
        yield db_1.default.activeTimer.update({
            where: { user_id },
            data: { last_active_ping: new Date() }
        });
        res.status(200).json({ message: 'Ping successful' });
    }
    catch (error) {
        console.error('Failed to ping timer:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.pingTimer = pingTimer;
// --- Timesheet Approvals (Managers/Admins) ---
const getPendingTimesheets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Find all time entries with 'pending' status
        const pendingEntries = yield db_1.default.timeEntry.findMany({
            where: { status: 'pending' },
            include: {
                user: { select: { id: true, first_name: true, last_name: true, email: true } },
                project: { select: { name: true } }
            },
            orderBy: { created_at: 'desc' },
        });
        res.status(200).json({ entries: pendingEntries });
    }
    catch (error) {
        console.error('Failed to get pending timesheets:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getPendingTimesheets = getPendingTimesheets;
const reviewTimesheet = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const entryId = req.params.entryId;
        const { action } = req.body; // 'approve' or 'reject'
        if (!['approve', 'reject'].includes(action)) {
            res.status(400).json({ message: 'Invalid action. Must be approve or reject.' });
            return;
        }
        const statusMap = { approve: 'approved', reject: 'rejected' };
        const updatedEntry = yield db_1.default.timeEntry.update({
            where: { id: entryId },
            data: { status: statusMap[action] }
        });
        // Notify the user about the decision
        yield db_1.default.notification.create({
            data: {
                user_id: updatedEntry.user_id,
                message: `Your timesheet for ${updatedEntry.task_description} was ${statusMap[action]} by your manager.`,
                type: 'approval_status'
            }
        });
        res.status(200).json(updatedEntry);
    }
    catch (error) {
        console.error('Failed to review timesheet:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.reviewTimesheet = reviewTimesheet;
