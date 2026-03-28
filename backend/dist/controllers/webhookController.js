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
exports.deleteWebhook = exports.createWebhook = exports.listWebhooks = void 0;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = __importDefault(require("../config/db"));
const http_1 = require("../utils/http");
const isValidUrl = (value) => {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    }
    catch (_a) {
        return false;
    }
};
const listWebhooks = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const subs = yield db_1.default.webhookSubscription.findMany({ orderBy: { created_at: 'desc' } });
        res.status(200).json({ webhooks: subs });
    }
    catch (error) {
        console.error('Failed to list webhooks:', error);
        (0, http_1.sendApiError)(res, 500, 'WEBHOOK_LIST_FAILED', 'Internal server error');
    }
});
exports.listWebhooks = listWebhooks;
const createWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const url = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.url) === 'string' ? req.body.url.trim() : '';
        const rawEvents = Array.isArray((_b = req.body) === null || _b === void 0 ? void 0 : _b.events) ? req.body.events : [];
        const events = rawEvents
            .filter((event) => typeof event === 'string')
            .map((event) => event.trim())
            .filter((event) => event.length > 0);
        if (!url) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'Webhook URL is required');
            return;
        }
        if (!isValidUrl(url)) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'Webhook URL must be a valid HTTP or HTTPS URL');
            return;
        }
        if (events.length === 0) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'At least one webhook event is required');
            return;
        }
        const secret = crypto_1.default.randomBytes(32).toString('hex');
        const uniqueEvents = Array.from(new Set(events));
        const sub = yield db_1.default.webhookSubscription.create({
            data: {
                url,
                events: uniqueEvents,
                secret,
            },
        });
        res.status(201).json(sub);
    }
    catch (error) {
        console.error('Failed to create webhook:', error);
        (0, http_1.sendApiError)(res, 500, 'WEBHOOK_CREATE_FAILED', 'Internal server error');
    }
});
exports.createWebhook = createWebhook;
const deleteWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const id = req.params.id;
        yield db_1.default.webhookSubscription.delete({ where: { id } });
        res.status(200).json({ message: 'Webhook deleted' });
    }
    catch (error) {
        if (error.code === 'P2025') {
            (0, http_1.sendApiError)(res, 404, 'WEBHOOK_NOT_FOUND', 'Webhook not found');
            return;
        }
        console.error('Failed to delete webhook:', error);
        (0, http_1.sendApiError)(res, 500, 'WEBHOOK_DELETE_FAILED', 'Internal server error');
    }
});
exports.deleteWebhook = deleteWebhook;
