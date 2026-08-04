import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { sendApiError } from '../utils/http';
import {
    DEFAULT_GENERATION_TIME,
    DEFAULT_REPORTING_TIMEZONE,
    EXPORT_WINDOW_END,
    EXPORT_WINDOW_START,
    SUNDAY,
    getNextGenerationRun,
    getPreviousCompleteWeek,
    isValidTimeZone,
    parseGenerationTime,
} from '../utils/reportWindow';
import { ALL_WEEK_DAYS, normalizeRequiredDays } from '../services/reportValidationService';

/**
 * Weekly export windows always close on a Sunday, so a Sunday generation time would
 * run the report before its own window had finished — the exact class of bug this
 * feature exists to prevent. Weekly reports are pinned to Monday.
 */
const WEEKLY_GENERATION_DAY = 1; // Monday

/**
 * Validate a requested weekly generation day.
 *
 * Previously any 1-6 value was silently rewritten to Monday, so a caller who asked
 * for Wednesday received a 201 describing a schedule they had not requested. Silent
 * normalisation of a value the client explicitly set is worse than a clear
 * rejection: it makes the API's response a lie. `undefined`/`null` is still
 * accepted and defaulted, since that is the caller expressing no preference.
 *
 * Returns an error message when the value must be rejected, otherwise null.
 */
const rejectNonMondayGenerationDay = (day: number | null): string | null => {
    if (day === null || Number.isNaN(day)) return null;

    if (!Number.isInteger(day) || day < 0 || day > 6) {
        return 'day_of_week must be an integer between 0 (Sunday) and 6 (Saturday)';
    }
    if (day === SUNDAY) {
        return 'Weekly reports cannot be generated on Sunday — Sunday is the closing day of the export window, so the week would not be complete at generation time. Weekly reports run on Monday (day_of_week = 1).';
    }
    if (day !== WEEKLY_GENERATION_DAY) {
        return `Weekly reports are generated on Monday (day_of_week = 1) because the export window is a fixed Monday-to-Sunday week. Received ${day}. Omit day_of_week to accept the default.`;
    }
    return null;
};

type WindowConfig = {
    reporting_timezone: string;
    export_window_start: string;
    export_window_end: string;
    schedule_generation_time: string;
    validation_gates_enabled: boolean;
    validation_gate_zero_entries: boolean;
    validation_gate_window_integrity: boolean;
    validation_gate_required_days: number[];
};

/**
 * Validates the window/gate portion of a create or update payload.
 * Returns either the fields to persist, or a user-facing validation message.
 */
const parseWindowConfig = (
    body: Record<string, unknown>,
    { partial }: { partial: boolean },
): { data: Partial<WindowConfig> } | { error: string } => {
    const data: Partial<WindowConfig> = {};

    const rawTimezone = body.reporting_timezone;
    if (rawTimezone !== undefined) {
        if (!isValidTimeZone(rawTimezone)) {
            return {
                error: 'reporting_timezone must be a canonical IANA timezone identifier in Area/Location form '
                    + '(e.g. "America/Chicago", "Africa/Lagos"), or "UTC". Abbreviations such as "EST", "CST" '
                    + 'and "MST" are rejected: they resolve to fixed-offset zones that do not observe daylight '
                    + 'saving (EST resolves to America/Panama), which would silently shift every window boundary '
                    + 'by an hour for part of the year.',
            };
        }
        data.reporting_timezone = String(rawTimezone).trim();
    } else if (!partial) {
        data.reporting_timezone = DEFAULT_REPORTING_TIMEZONE;
    }

    const rawGenerationTime = body.schedule_generation_time;
    if (rawGenerationTime !== undefined) {
        const parsed = parseGenerationTime(rawGenerationTime);
        if (!parsed) {
            return { error: 'schedule_generation_time must be a 24-hour "HH:mm" value (e.g. "06:00")' };
        }
        data.schedule_generation_time = `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`;
    } else if (!partial) {
        data.schedule_generation_time = DEFAULT_GENERATION_TIME;
    }

    // Window boundaries are fixed for now; reject attempts to set anything else
    // rather than silently ignoring them, so a caller never believes a custom
    // window was accepted.
    for (const [key, expected] of [
        ['export_window_start', EXPORT_WINDOW_START],
        ['export_window_end', EXPORT_WINDOW_END],
    ] as const) {
        const raw = body[key];
        if (raw !== undefined) {
            if (typeof raw !== 'string' || raw.trim().toLowerCase() !== expected) {
                return { error: `${key} must be "${expected}". Export windows are fixed to a full Monday-to-Sunday week.` };
            }
            data[key] = expected;
        } else if (!partial) {
            data[key] = expected;
        }
    }

    for (const key of ['validation_gates_enabled', 'validation_gate_zero_entries', 'validation_gate_window_integrity'] as const) {
        const raw = body[key];
        if (raw !== undefined) {
            if (typeof raw !== 'boolean') return { error: `${key} must be a boolean` };
            data[key] = raw;
        } else if (!partial) {
            data[key] = true;
        }
    }

    const rawRequiredDays = body.validation_gate_required_days;
    if (rawRequiredDays !== undefined) {
        if (!Array.isArray(rawRequiredDays)) {
            return { error: 'validation_gate_required_days must be an array of weekday numbers (0 = Sunday .. 6 = Saturday)' };
        }
        const invalid = rawRequiredDays.filter(
            (entry) => !Number.isInteger(Number(entry)) || Number(entry) < 0 || Number(entry) > 6,
        );
        if (invalid.length > 0) {
            return { error: 'validation_gate_required_days entries must be integers between 0 (Sunday) and 6 (Saturday)' };
        }
        data.validation_gate_required_days = normalizeRequiredDays(rawRequiredDays);
    } else if (!partial) {
        data.validation_gate_required_days = [...ALL_WEEK_DAYS];
    }

    return { data };
};

/** Preview fields so the UI can show exactly what a schedule will do before saving. */
const describeSchedule = (report: {
    frequency: string;
    reporting_timezone?: string | null;
    schedule_generation_time?: string | null;
}) => {
    const timeZone = isValidTimeZone(report.reporting_timezone) ? String(report.reporting_timezone).trim() : DEFAULT_REPORTING_TIMEZONE;
    const generationTime = report.schedule_generation_time?.trim() || DEFAULT_GENERATION_TIME;

    if (report.frequency !== 'weekly') return null;

    const now = new Date();
    const nextRun = getNextGenerationRun(now, timeZone, generationTime);
    const window = getPreviousCompleteWeek(nextRun, timeZone);

    return {
        timeZone,
        generationTime,
        generationDay: 'Monday',
        nextRunUtc: nextRun.toISOString(),
        nextWindowLabel: window.label,
        nextWindowStartUtc: window.start.toISOString(),
        nextWindowEndUtc: window.end.toISOString(),
    };
};

const normalizeRecipients = (value: unknown): string[] | null => {
    if (!Array.isArray(value)) {
        return null;
    }

    const emails = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);

    if (emails.length === 0) {
        return null;
    }

    return Array.from(new Set(emails));
};

export const listScheduledReports = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const role = req.user?.role;
        const canViewAll = role === 'Manager' || role === 'Admin';

        const reports = await prisma.scheduledReport.findMany({
            where: canViewAll ? { organization_id: req.user!.organization_id } : { user_id: userId, organization_id: req.user!.organization_id },
            orderBy: { created_at: 'desc' },
            include: { user: { select: { first_name: true, last_name: true, email: true } } },
        });

        res.status(200).json({
            reports: reports.map((report) => ({ ...report, schedule_preview: describeSchedule(report) })),
        });
    } catch (error) {
        console.error('Failed to list scheduled reports:', error);
        sendApiError(res, 500, 'SCHEDULED_REPORT_LIST_FAILED', 'Internal server error');
    }
};

export const createScheduledReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            sendApiError(res, 401, 'AUTH_REQUIRED', 'Authenticated user required');
            return;
        }

        const { frequency, day_of_week, recipients, report_type } = req.body ?? {};

        if (!['weekly', 'monthly'].includes(frequency)) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'Frequency must be weekly or monthly');
            return;
        }

        let parsedDayOfWeek = day_of_week !== undefined ? Number(day_of_week) : null;
        if (frequency === 'weekly') {
            const rejection = rejectNonMondayGenerationDay(parsedDayOfWeek);
            if (rejection) {
                sendApiError(res, 400, 'VALIDATION_ERROR', rejection);
                return;
            }
            parsedDayOfWeek = WEEKLY_GENERATION_DAY;
        }

        const normalizedRecipients = normalizeRecipients(recipients);
        if (!normalizedRecipients) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'At least one recipient email is required');
            return;
        }

        const windowConfig = parseWindowConfig(req.body ?? {}, { partial: false });
        if ('error' in windowConfig) {
            sendApiError(res, 400, 'VALIDATION_ERROR', windowConfig.error);
            return;
        }

        const report = await prisma.scheduledReport.create({
            data: {
                user_id: userId,
                frequency,
                day_of_week: frequency === 'weekly' ? parsedDayOfWeek : null,
                recipients: normalizedRecipients,
                report_type: typeof report_type === 'string' && report_type.trim() ? report_type.trim() : 'summary',
                organization_id: req.user!.organization_id,
                ...windowConfig.data,
            },
        });

        res.status(201).json({ ...report, schedule_preview: describeSchedule(report) });
    } catch (error) {
        console.error('Failed to create scheduled report:', error);
        sendApiError(res, 500, 'SCHEDULED_REPORT_CREATE_FAILED', 'Internal server error');
    }
};

export const updateScheduledReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const data: Record<string, unknown> = {};
        if (req.body.frequency) {
            if (!['weekly', 'monthly'].includes(req.body.frequency)) {
                sendApiError(res, 400, 'VALIDATION_ERROR', 'Frequency must be weekly or monthly');
                return;
            }
            data.frequency = req.body.frequency;
        }
        if (req.body.day_of_week !== undefined) {
            const rejection = rejectNonMondayGenerationDay(Number(req.body.day_of_week));
            if (rejection) {
                sendApiError(res, 400, 'VALIDATION_ERROR', rejection);
                return;
            }
            data.day_of_week = WEEKLY_GENERATION_DAY;
        }
        if (req.body.recipients !== undefined) {
            const normalizedRecipients = normalizeRecipients(req.body.recipients);
            if (!normalizedRecipients) {
                sendApiError(res, 400, 'VALIDATION_ERROR', 'At least one recipient email is required');
                return;
            }
            data.recipients = normalizedRecipients;
        }
        if (req.body.report_type) data.report_type = req.body.report_type;
        if (typeof req.body.is_active === 'boolean') data.is_active = req.body.is_active;

        const windowConfig = parseWindowConfig(req.body ?? {}, { partial: true });
        if ('error' in windowConfig) {
            sendApiError(res, 400, 'VALIDATION_ERROR', windowConfig.error);
            return;
        }
        Object.assign(data, windowConfig.data);

        if (Object.keys(data).length === 0) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'No valid fields provided');
            return;
        }

        const reportId = req.params.id as string;
        const report = await prisma.scheduledReport.update({
            where: { id: reportId, organization_id: req.user!.organization_id },
            data,
        });

        res.status(200).json({ ...report, schedule_preview: describeSchedule(report) });
    } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
            sendApiError(res, 404, 'SCHEDULED_REPORT_NOT_FOUND', 'Scheduled report not found');
            return;
        }
        console.error('Failed to update scheduled report:', error);
        sendApiError(res, 500, 'SCHEDULED_REPORT_UPDATE_FAILED', 'Internal server error');
    }
};

export const deleteScheduledReport = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const reportId = req.params.id as string;
        await prisma.scheduledReport.delete({ where: { id: reportId, organization_id: req.user!.organization_id } });
        res.status(200).json({ message: 'Scheduled report deleted' });
    } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
            sendApiError(res, 404, 'SCHEDULED_REPORT_NOT_FOUND', 'Scheduled report not found');
            return;
        }
        console.error('Failed to delete scheduled report:', error);
        sendApiError(res, 500, 'SCHEDULED_REPORT_DELETE_FAILED', 'Internal server error');
    }
};
