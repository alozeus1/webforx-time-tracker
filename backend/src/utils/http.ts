import { Response } from 'express';

interface ApiErrorPayload {
    code: string;
    message: string;
    details?: unknown;
}

export const sendApiError = (
    res: Response,
    status: number,
    code: string,
    message: string,
    details?: unknown,
): void => {
    const payload: ApiErrorPayload = { code, message };
    if (details !== undefined) {
        payload.details = details;
    }

    res.status(status).json({
        message,
        error: payload,
    });
};
