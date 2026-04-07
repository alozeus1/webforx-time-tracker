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
exports.logAuthEvent = void 0;
const db_1 = __importDefault(require("../config/db"));
const getClientIp = (req) => {
    var _a, _b;
    const forwardedFor = req.headers['x-forwarded-for'];
    if (Array.isArray(forwardedFor) && forwardedFor[0]) {
        return ((_a = forwardedFor[0].split(',')[0]) === null || _a === void 0 ? void 0 : _a.trim()) || null;
    }
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return ((_b = forwardedFor.split(',')[0]) === null || _b === void 0 ? void 0 : _b.trim()) || null;
    }
    return req.ip || null;
};
const getUserAgent = (req) => {
    var _a;
    const userAgent = req.headers['user-agent'];
    if (Array.isArray(userAgent)) {
        return ((_a = userAgent[0]) === null || _a === void 0 ? void 0 : _a.trim()) || null;
    }
    return typeof userAgent === 'string' && userAgent.trim() ? userAgent.trim() : null;
};
const logAuthEvent = (req, input) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        yield db_1.default.authEvent.create({
            data: {
                user_id: (_a = input.userId) !== null && _a !== void 0 ? _a : null,
                email: ((_b = input.email) === null || _b === void 0 ? void 0 : _b.trim().toLowerCase()) || null,
                event_type: input.eventType,
                outcome: input.outcome,
                reason: (_c = input.reason) !== null && _c !== void 0 ? _c : null,
                ip_address: getClientIp(req),
                user_agent: getUserAgent(req),
                metadata: (_d = input.metadata) !== null && _d !== void 0 ? _d : {},
            },
        });
    }
    catch (error) {
        console.error('Failed to write auth event:', error);
    }
});
exports.logAuthEvent = logAuthEvent;
