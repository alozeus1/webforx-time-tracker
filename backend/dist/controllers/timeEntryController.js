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
exports.duplicateEntry = exports.deleteEntry = exports.updateEntry = exports.reviewTimesheet = exports.getPendingTimesheets = exports.pingTimer = exports.getMyEntries = exports.manualEntry = exports.stopTimer = exports.startTimer = void 0;
const db_1 = __importDefault(require("../config/db"));
const webhookService_1 = require("../services/webhookService");
const requireUserId = (req) => {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
        throw new Error('Authenticated user is required');
    }
    return req.user.userId;
};
const startTimer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const project_id = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.project_id) === 'string' && req.body.project_id.trim() ? req.body.project_id : null;
        const task_description = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.task_description) === 'string' ? req.body.task_description.trim() : '';
        const is_billable = ((_c = req.body) === null || _c === void 0 ? void 0 : _c.is_billable) !== false;
        const tag_ids = Array.isArray((_d = req.body) === null || _d === void 0 ? void 0 : _d.tag_ids) ? req.body.tag_ids : [];
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
                persisted_state: { is_billable, tag_ids },
            },
        });
        try {
            yield db_1.default.auditLog.create({
                data: {
                    user_id,
                    action: 'timer_started',
                    resource: 'active_timer',
                    metadata: {
                        active_timer_id: newTimer.id,
                        project_id: newTimer.project_id,
                        task_description: newTimer.task_description,
                    },
                },
            });
        }
        catch (error) {
            console.error('Failed to write timer start audit log:', error);
        }
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
        const persistedState = activeTimer.persisted_state || {};
        const is_billable = persistedState.is_billable !== false;
        const timeEntry = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const entry = yield tx.timeEntry.create({
                data: {
                    user_id,
                    project_id: activeTimer.project_id,
                    task_description: activeTimer.task_description,
                    start_time: activeTimer.start_time,
                    end_time,
                    duration,
                    entry_type: 'timer',
                    notes,
                    is_billable,
                },
            });
            yield tx.activeTimer.delete({ where: { user_id } });
            if (Array.isArray(persistedState.tag_ids)) {
                const tagLinks = persistedState.tag_ids.map((tag_id) => ({
                    time_entry_id: entry.id,
                    tag_id,
                }));
                yield tx.timeEntryTag.createMany({ data: tagLinks, skipDuplicates: true });
            }
            return entry;
        }));
        try {
            yield db_1.default.auditLog.create({
                data: {
                    user_id,
                    action: 'timer_stopped',
                    resource: 'time_entry',
                    metadata: {
                        time_entry_id: timeEntry.id,
                        project_id: timeEntry.project_id,
                        duration_seconds: timeEntry.duration,
                    },
                },
            });
        }
        catch (error) {
            console.error('Failed to write timer stop audit log:', error);
        }
        res.status(200).json(timeEntry);
        // Fire-and-forget: webhook + overtime check
        (0, webhookService_1.emitWebhookEvent)('timer.stopped', {
            time_entry_id: timeEntry.id, user_id, duration: timeEntry.duration, project_id: timeEntry.project_id,
        }).catch(() => { });
        // Overtime weekly limit check
        try {
            const user = yield db_1.default.user.findUnique({ where: { id: user_id }, select: { weekly_hour_limit: true } });
            if (user === null || user === void 0 ? void 0 : user.weekly_hour_limit) {
                const now = new Date();
                const dayOfWeek = now.getDay();
                const monday = new Date(now);
                monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
                monday.setHours(0, 0, 0, 0);
                const weekEntries = yield db_1.default.timeEntry.findMany({
                    where: { user_id, start_time: { gte: monday } },
                    select: { duration: true },
                });
                const totalWeekHours = weekEntries.reduce((s, e) => s + e.duration, 0) / 3600;
                if (totalWeekHours > user.weekly_hour_limit) {
                    yield db_1.default.notification.create({
                        data: {
                            user_id,
                            message: `You have logged ${totalWeekHours.toFixed(1)}h this week, exceeding your ${user.weekly_hour_limit}h weekly limit.`,
                            type: 'overtime_alert',
                        },
                    });
                }
            }
        }
        catch (err) {
            console.error('Overtime check failed:', err);
        }
    }
    catch (error) {
        console.error('Failed to stop timer:', error);
        res.status(500).json({ message: 'Internal server error while stopping timer' });
    }
});
exports.stopTimer = stopTimer;
const manualEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { project_id, task_description, start_time, end_time, notes, } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
        const user_id = requireUserId(req);
        const is_billable = ((_b = req.body) === null || _b === void 0 ? void 0 : _b.is_billable) !== false;
        const tag_ids = Array.isArray((_c = req.body) === null || _c === void 0 ? void 0 : _c.tag_ids) ? req.body.tag_ids : [];
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
                is_billable,
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
        if (tag_ids.length > 0) {
            const tagLinks = tag_ids.map((tag_id) => ({
                time_entry_id: timeEntry.id,
                tag_id,
            }));
            yield db_1.default.timeEntryTag.createMany({ data: tagLinks, skipDuplicates: true });
        }
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
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
        const skip = (page - 1) * limit;
        const [entries, total, activeTimer] = yield Promise.all([
            db_1.default.timeEntry.findMany({
                where: { user_id },
                orderBy: { start_time: 'desc' },
                include: {
                    project: { select: { name: true } },
                    tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
                },
                skip,
                take: limit,
            }),
            db_1.default.timeEntry.count({ where: { user_id } }),
            db_1.default.activeTimer.findUnique({
                where: { user_id },
                include: { project: { select: { name: true } } },
            }),
        ]);
        res.status(200).json({
            entries,
            activeTimer,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
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
        const reviewerId = requireUserId(req);
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
        try {
            yield db_1.default.auditLog.create({
                data: {
                    user_id: reviewerId,
                    action: `timesheet_${action}`,
                    resource: 'time_entry',
                    metadata: {
                        entry_id: updatedEntry.id,
                        target_user_id: updatedEntry.user_id,
                    },
                },
            });
        }
        catch (error) {
            console.error('Failed to write timesheet review audit log:', error);
        }
        res.status(200).json(updatedEntry);
    }
    catch (error) {
        console.error('Failed to review timesheet:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.reviewTimesheet = reviewTimesheet;
const updateEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const user_id = requireUserId(req);
        const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
        const entryId = req.params.id;
        const entry = yield db_1.default.timeEntry.findUnique({ where: { id: entryId } });
        if (!entry) {
            res.status(404).json({ message: 'Time entry not found' });
            return;
        }
        if (entry.user_id !== user_id && role !== 'Admin' && role !== 'Manager') {
            res.status(403).json({ message: 'Not authorized to edit this entry' });
            return;
        }
        const data = {};
        const { task_description, project_id, start_time, end_time, notes, is_billable, tag_ids } = (_b = req.body) !== null && _b !== void 0 ? _b : {};
        if (typeof task_description === 'string' && task_description.trim())
            data.task_description = task_description.trim();
        if (project_id !== undefined)
            data.project_id = project_id || null;
        if (typeof notes === 'string')
            data.notes = notes.trim() || null;
        if (typeof is_billable === 'boolean')
            data.is_billable = is_billable;
        if (start_time && end_time) {
            const s = new Date(start_time);
            const e = new Date(end_time);
            const dur = Math.floor((e.getTime() - s.getTime()) / 1000);
            if (dur > 0) {
                data.start_time = s;
                data.end_time = e;
                data.duration = dur;
            }
        }
        const updated = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield tx.timeEntry.update({ where: { id: entryId }, data });
            if (Array.isArray(tag_ids)) {
                yield tx.timeEntryTag.deleteMany({ where: { time_entry_id: entryId } });
                if (tag_ids.length > 0) {
                    yield tx.timeEntryTag.createMany({
                        data: tag_ids.map((tag_id) => ({ time_entry_id: entryId, tag_id })),
                        skipDuplicates: true,
                    });
                }
            }
            return result;
        }));
        res.status(200).json(updated);
    }
    catch (error) {
        console.error('Failed to update entry:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.updateEntry = updateEntry;
const deleteEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const user_id = requireUserId(req);
        const role = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
        const entryId = req.params.id;
        const entry = yield db_1.default.timeEntry.findUnique({ where: { id: entryId } });
        if (!entry) {
            res.status(404).json({ message: 'Time entry not found' });
            return;
        }
        if (entry.user_id !== user_id && role !== 'Admin') {
            res.status(403).json({ message: 'Not authorized to delete this entry' });
            return;
        }
        yield db_1.default.timeEntry.delete({ where: { id: entryId } });
        res.status(200).json({ message: 'Time entry deleted' });
    }
    catch (error) {
        console.error('Failed to delete entry:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.deleteEntry = deleteEntry;
const duplicateEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user_id = requireUserId(req);
        const entryId = req.params.id;
        const entry = yield db_1.default.timeEntry.findUnique({
            where: { id: entryId },
            include: { tags: { select: { tag_id: true } } },
        });
        if (!entry) {
            res.status(404).json({ message: 'Time entry not found' });
            return;
        }
        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(9, 0, 0, 0);
        const endTime = new Date(startOfDay.getTime() + entry.duration * 1000);
        const newEntry = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const created = yield tx.timeEntry.create({
                data: {
                    user_id,
                    project_id: entry.project_id,
                    task_description: entry.task_description,
                    start_time: startOfDay,
                    end_time: endTime,
                    duration: entry.duration,
                    entry_type: 'manual',
                    notes: entry.notes,
                    is_billable: entry.is_billable,
                },
            });
            if (entry.tags.length > 0) {
                yield tx.timeEntryTag.createMany({
                    data: entry.tags.map(t => ({ time_entry_id: created.id, tag_id: t.tag_id })),
                    skipDuplicates: true,
                });
            }
            return created;
        }));
        res.status(201).json(newEntry);
    }
    catch (error) {
        console.error('Failed to duplicate entry:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.duplicateEntry = duplicateEntry;
