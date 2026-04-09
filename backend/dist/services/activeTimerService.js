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
exports.stopActiveTimerWithReason = void 0;
const db_1 = __importDefault(require("../config/db"));
const stopActiveTimerWithReason = (_a) => __awaiter(void 0, [_a], void 0, function* ({ userId, reason, triggeredAt = new Date(), }) {
    var _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const activeTimer = yield db_1.default.activeTimer.findUnique({ where: { user_id: userId } });
    if (!activeTimer) {
        return null;
    }
    const startTime = new Date(activeTimer.start_time);
    const endTime = triggeredAt > startTime ? triggeredAt : new Date(startTime.getTime() + 1000);
    const duration = Math.max(Math.floor((endTime.getTime() - startTime.getTime()) / 1000), 1);
    const persistedState = activeTimer.persisted_state || {};
    const isBillable = persistedState.is_billable !== false;
    const existingNotes = typeof persistedState.notes === 'string' ? persistedState.notes.trim() : '';
    const reasonNote = `Automatically stopped due to ${reason.replace(/_/g, ' ')}.`;
    const notes = existingNotes ? `${existingNotes}\n\n${reasonNote}` : reasonNote;
    const timeEntry = yield db_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        const entry = yield tx.timeEntry.create({
            data: {
                user_id: userId,
                project_id: activeTimer.project_id,
                task_description: activeTimer.task_description,
                start_time: activeTimer.start_time,
                end_time: endTime,
                duration,
                entry_type: 'timer',
                notes,
                is_billable: isBillable,
                auto_stopped: true,
                stop_reason: reason,
            },
        });
        if (Array.isArray(persistedState.tag_ids) && persistedState.tag_ids.length > 0) {
            yield tx.timeEntryTag.createMany({
                data: persistedState.tag_ids.map((tagId) => ({
                    time_entry_id: entry.id,
                    tag_id: tagId,
                })),
                skipDuplicates: true,
            });
        }
        yield tx.activeTimer.delete({ where: { user_id: userId } });
        return entry;
    }));
    try {
        yield db_1.default.auditLog.create({
            data: {
                user_id: userId,
                action: 'timer_auto_stopped',
                resource: 'time_entry',
                metadata: {
                    reason,
                    time_entry_id: timeEntry.id,
                    active_timer_id: activeTimer.id,
                    triggered_at: triggeredAt.toISOString(),
                    last_active_ping: (_d = (_c = (_b = activeTimer.last_active_ping) === null || _b === void 0 ? void 0 : _b.toISOString) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _d !== void 0 ? _d : activeTimer.last_active_ping,
                    last_heartbeat_at: (_g = (_f = (_e = activeTimer.last_heartbeat_at) === null || _e === void 0 ? void 0 : _e.toISOString) === null || _f === void 0 ? void 0 : _f.call(_e)) !== null && _g !== void 0 ? _g : activeTimer.last_heartbeat_at,
                    last_client_activity_at: (_k = (_j = (_h = activeTimer.last_client_activity_at) === null || _h === void 0 ? void 0 : _h.toISOString) === null || _j === void 0 ? void 0 : _j.call(_h)) !== null && _k !== void 0 ? _k : activeTimer.last_client_activity_at,
                    client_visibility: activeTimer.client_visibility,
                    client_has_focus: activeTimer.client_has_focus,
                },
            },
        });
    }
    catch (error) {
        console.error('Failed to write timer auto-stop audit log:', error);
    }
    try {
        yield db_1.default.notification.create({
            data: {
                user_id: userId,
                message: `Your timer for "${activeTimer.task_description}" was stopped automatically because ${reason.replace(/_/g, ' ')} was detected.`,
                type: 'timer_auto_stopped',
            },
        });
    }
    catch (error) {
        console.error('Failed to create timer auto-stop notification:', error);
    }
    return timeEntry;
});
exports.stopActiveTimerWithReason = stopActiveTimerWithReason;
