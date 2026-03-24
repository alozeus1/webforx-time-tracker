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
exports.getSystemNotifications = exports.getAuditLogs = void 0;
const db_1 = __importDefault(require("../config/db"));
const getAuditLogs = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const logs = yield db_1.default.auditLog.findMany({
            orderBy: { created_at: 'desc' },
            take: 100,
            include: {
                user: { select: { email: true, first_name: true, last_name: true } }
            }
        });
        res.status(200).json({ logs });
    }
    catch (error) {
        console.error('Failed to get audit logs:', error);
        res.status(500).json({ message: 'Internal server error while loading audit logs' });
    }
});
exports.getAuditLogs = getAuditLogs;
const getSystemNotifications = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const notifications = yield db_1.default.notification.findMany({
            orderBy: { created_at: 'desc' },
            take: 100,
            include: {
                user: { select: { email: true, first_name: true, last_name: true } }
            }
        });
        res.status(200).json({ notifications });
    }
    catch (error) {
        console.error('Failed to get system notifications:', error);
        res.status(500).json({ message: 'Internal server error while loading system notifications' });
    }
});
exports.getSystemNotifications = getSystemNotifications;
