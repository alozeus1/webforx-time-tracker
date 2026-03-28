"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendApiError = void 0;
const sendApiError = (res, status, code, message, details) => {
    const payload = { code, message };
    if (details !== undefined) {
        payload.details = details;
    }
    res.status(status).json({
        message,
        error: payload,
    });
};
exports.sendApiError = sendApiError;
