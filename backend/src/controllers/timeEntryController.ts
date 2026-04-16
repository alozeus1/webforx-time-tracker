import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { env } from '../config/env';
import { AuthRequest } from '../types/auth';
import { emitWebhookEvent } from '../services/webhookService';
import { scoreTimeEntryRisk } from '../services/opsInsightsService';
import { pauseActiveTimer, resumeActiveTimer, stopActiveTimerWithReason } from '../services/activeTimerService';

type GuardrailActiveTimer = {
    id: string;
    user_id: string;
    start_time: Date;
    last_active_ping: Date | null;
    last_heartbeat_at: Date | null;
    last_client_activity_at: Date | null;
    client_visibility: string | null;
    client_has_focus: boolean | null;
    is_paused: boolean;
    paused_at: Date | null;
};

const requireUserId = (req: AuthRequest): string => {
    if (!req.user?.userId) {
        throw new Error('Authenticated user is required');
    }

    return req.user.userId;
};

const getTimerGuardrailThresholds = () => {
    const staleThresholdMs = env.heartbeatStaleMinutes * 60_000;
    return {
        staleThresholdMs,
        autoStopThresholdMs: staleThresholdMs + (env.autoStopGraceMinutes * 60_000),
        pingFrequencyThresholdMs: env.heartbeatIntervalMinutes * 2 * 60_000,
        maxPauseMs: env.maxPauseHours * 60 * 60 * 1000,
    };
};

const resolveInactivitySource = ({
    timer,
    visibilityState,
    hasFocus,
}: {
    timer: GuardrailActiveTimer;
    visibilityState?: string | null;
    hasFocus?: boolean | null;
}) => {
    const effectiveVisibility = visibilityState ?? timer.client_visibility;
    const effectiveHasFocus = typeof hasFocus === 'boolean' ? hasFocus : timer.client_has_focus;
    return { effectiveVisibility, effectiveHasFocus };
};

const enforceTimerGuardrails = async ({
    timer,
    now,
    visibilityState,
    hasFocus,
    lastClientActivityAtOverride,
}: {
    timer: GuardrailActiveTimer;
    now?: Date;
    visibilityState?: string | null;
    hasFocus?: boolean | null;
    lastClientActivityAtOverride?: Date | null;
}): Promise<'none' | 'paused' | 'stopped'> => {
    const checkTime = now ?? new Date();
    const thresholds = getTimerGuardrailThresholds();

    if (timer.is_paused) {
        if (timer.paused_at) {
            const pausedForMs = checkTime.getTime() - new Date(timer.paused_at).getTime();
            if (pausedForMs >= thresholds.maxPauseMs) {
                await stopActiveTimerWithReason({
                    userId: timer.user_id,
                    reason: 'pause_expired',
                    triggeredAt: checkTime,
                });
                return 'stopped';
            }
        }
        return 'none';
    }

    const lastHeartbeat = timer.last_heartbeat_at
        ? new Date(timer.last_heartbeat_at)
        : (timer.last_active_ping ? new Date(timer.last_active_ping) : new Date(timer.start_time));
    
    const baseActivityTime = timer.last_client_activity_at
        ? new Date(timer.last_client_activity_at)
        : new Date(timer.start_time);

    const lastClientActivity = lastClientActivityAtOverride ?? baseActivityTime;

    const heartbeatAgeMs = checkTime.getTime() - lastHeartbeat.getTime();
    const clientActivityAgeMs = checkTime.getTime() - lastClientActivity.getTime();
    const pingIsTooOld = heartbeatAgeMs >= thresholds.pingFrequencyThresholdMs;
    const { effectiveVisibility, effectiveHasFocus } = resolveInactivitySource({ timer, visibilityState, hasFocus });
    const browserExplicitlyInactive = effectiveVisibility === 'hidden' || effectiveHasFocus === false;

    if (clientActivityAgeMs >= thresholds.autoStopThresholdMs || heartbeatAgeMs >= thresholds.autoStopThresholdMs) {
        // We always soft-pause instead of hard-stopping when inactivity/sleep is detected.
        // This grants the user the opportunity to recover the session ("ResumeConfirmDialog")
        // when they return, unless the maxPauseMs (12h) expires.
        const reason = clientActivityAgeMs >= thresholds.autoStopThresholdMs ? 'idle_timeout' : 'heartbeat_missing';
        await pauseActiveTimer(timer.user_id, reason);
        return 'paused';
    }

    return 'none';
};

export const startTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const project_id = typeof req.body?.project_id === 'string' && req.body.project_id.trim() ? req.body.project_id : null;
        const task_description = typeof req.body?.task_description === 'string' ? req.body.task_description.trim() : '';
        const is_billable = req.body?.is_billable !== false;
        const tag_ids = Array.isArray(req.body?.tag_ids) ? req.body.tag_ids : [];
        const user_id = requireUserId(req);

        if (!task_description) {
            res.status(400).json({ message: 'Task description is required to start a timer' });
            return;
        }

        const existingTimer = await prisma.activeTimer.findUnique({ where: { user_id } });
        if (existingTimer) {
            res.status(400).json({ message: 'A timer is already running for this user' });
            return;
        }

        const newTimer = await prisma.activeTimer.create({
            data: {
                user_id,
                project_id,
                task_description,
                start_time: new Date(),
                persisted_state: { is_billable, tag_ids },
            },
        });

        try {
            await prisma.auditLog.create({
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
        } catch (error) {
            console.error('Failed to write timer start audit log:', error);
        }

        res.status(201).json(newTimer);
    } catch (error) {
        console.error('Failed to start timer:', error);
        res.status(500).json({ message: 'Internal server error while starting timer' });
    }
};

export const stopTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const notes = typeof req.body?.notes === 'string' && req.body.notes.trim() ? req.body.notes.trim() : null;

        const activeTimer = await prisma.activeTimer.findUnique({ where: { user_id } });
        if (!activeTimer) {
            res.status(404).json({ message: 'No active timer found' });
            return;
        }

        const end_time = new Date();
        const rawDuration = Math.floor((end_time.getTime() - new Date(activeTimer.start_time).getTime()) / 1000);
        const pausedSeconds = activeTimer.paused_duration_seconds ?? 0;
        const duration = Math.max(rawDuration - pausedSeconds, 1);

        if (rawDuration <= 0) {
            res.status(400).json({ message: 'Timer duration was invalid. Please try again.' });
            return;
        }

        const persistedState = (activeTimer.persisted_state as Record<string, unknown>) || {};
        const is_billable = persistedState.is_billable !== false;

        const timeEntry = await prisma.$transaction(async (tx) => {
            const entry = await tx.timeEntry.create({
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

            await tx.activeTimer.delete({ where: { user_id } });

            if (Array.isArray(persistedState.tag_ids)) {
                const tagLinks = (persistedState.tag_ids as string[]).map((tag_id: string) => ({
                    time_entry_id: entry.id,
                    tag_id,
                }));
                await tx.timeEntryTag.createMany({ data: tagLinks, skipDuplicates: true });
            }

            return entry;
        });

        try {
            await prisma.auditLog.create({
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
        } catch (error) {
            console.error('Failed to write timer stop audit log:', error);
        }

        res.status(200).json(timeEntry);

        // Fire-and-forget: webhook + overtime check
        emitWebhookEvent('timer.stopped', {
            time_entry_id: timeEntry.id, user_id, duration: timeEntry.duration, project_id: timeEntry.project_id,
        }).catch(() => {});

        // Overtime weekly limit check
        try {
            const user = await prisma.user.findUnique({ where: { id: user_id }, select: { weekly_hour_limit: true } });
            if (user?.weekly_hour_limit) {
                const now = new Date();
                const dayOfWeek = now.getDay();
                const monday = new Date(now);
                monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
                monday.setHours(0, 0, 0, 0);

                const weekEntries = await prisma.timeEntry.findMany({
                    where: { user_id, start_time: { gte: monday } },
                    select: { duration: true },
                });
                const totalWeekHours = weekEntries.reduce((s, e) => s + e.duration, 0) / 3600;

                if (totalWeekHours > user.weekly_hour_limit) {
                    await prisma.notification.create({
                        data: {
                            user_id,
                            message: `You have logged ${totalWeekHours.toFixed(1)}h this week, exceeding your ${user.weekly_hour_limit}h weekly limit.`,
                            type: 'overtime_alert',
                        },
                    });
                }
            }
        } catch (err) {
            console.error('Overtime check failed:', err);
        }
    } catch (error) {
        console.error('Failed to stop timer:', error);
        res.status(500).json({ message: 'Internal server error while stopping timer' });
    }
};

export const pauseTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    const user_id = requireUserId(req);

    try {
        const timer = await prisma.activeTimer.findUnique({ where: { user_id } });
        if (!timer) { res.status(404).json({ message: 'No active timer found.' }); return; }
        if (timer.is_paused) { res.status(200).json({ ok: true, message: 'Timer already paused.', pausedAt: timer.paused_at }); return; }

        await pauseActiveTimer(user_id, 'user_requested');
        res.status(200).json({ ok: true, pausedAt: new Date().toISOString() });
    } catch (error) {
        console.error('[pauseTimer]', error);
        res.status(500).json({ message: 'Failed to pause timer.' });
    }
};

export const resumeTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    const user_id = requireUserId(req);

    try {
        const timer = await prisma.activeTimer.findUnique({ where: { user_id } });
        if (!timer) { res.status(404).json({ message: 'No active timer found.' }); return; }
        if (!timer.is_paused) { res.status(200).json({ ok: true, message: 'Timer is not paused.' }); return; }

        const totalPausedSeconds = await resumeActiveTimer(user_id);
        res.status(200).json({ ok: true, resumedAt: new Date().toISOString(), pausedDurationSeconds: totalPausedSeconds });
    } catch (error) {
        console.error('[resumeTimer]', error);
        res.status(500).json({ message: 'Failed to resume timer.' });
    }
};

export const manualEntry = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const {
            project_id,
            task_description,
            start_time,
            end_time,
            notes,
        } = req.body ?? {};
        const user_id = requireUserId(req);
        const is_billable = req.body?.is_billable !== false;
        const tag_ids = Array.isArray(req.body?.tag_ids) ? req.body.tag_ids : [];

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

        const timeEntry = await prisma.timeEntry.create({
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

        await prisma.auditLog.create({
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
            const tagLinks = tag_ids.map((tag_id: string) => ({
                time_entry_id: timeEntry.id,
                tag_id,
            }));
            await prisma.timeEntryTag.createMany({ data: tagLinks, skipDuplicates: true });
        }

        res.status(201).json(timeEntry);
    } catch (error) {
        console.error('Failed to create manual entry:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getMyEntries = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const page = Math.max(parseInt(req.query.page as string) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
        const skip = (page - 1) * limit;

        let activeTimer = await prisma.activeTimer.findUnique({
            where: { user_id },
            include: { project: { select: { id: true, name: true } } },
        });

        if (activeTimer) {
            const guardrailResult = await enforceTimerGuardrails({
                timer: activeTimer,
                now: new Date(),
            });

            if (guardrailResult !== 'none') {
                activeTimer = await prisma.activeTimer.findUnique({
                    where: { user_id },
                    include: { project: { select: { id: true, name: true } } },
                });
            }
        }

        const [entries, total] = await Promise.all([
            prisma.timeEntry.findMany({
                where: { user_id },
                orderBy: { start_time: 'desc' },
                include: {
                    project: { select: { id: true, name: true } },
                    tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
                },
                skip,
                take: limit,
            }),
            prisma.timeEntry.count({ where: { user_id } }),
        ]);

        res.status(200).json({
            entries,
            activeTimer,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Failed to fetch timer entries:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const pingTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const lastClientActivityAtRaw = req.body?.last_activity_at;
        const activeTimerId = typeof req.body?.active_timer_id === 'string' ? req.body.active_timer_id : null;
        const visibilityState = typeof req.body?.visibility_state === 'string' ? req.body.visibility_state : null;
        const hasFocus = typeof req.body?.has_focus === 'boolean' ? req.body.has_focus : null;

        const activeTimer = await prisma.activeTimer.findUnique({
            where: { user_id },
        });

        if (!activeTimer) {
            res.status(404).json({ message: 'No active timer found to ping' });
            return;
        }

        if (activeTimerId && activeTimer.id !== activeTimerId) {
            res.status(409).json({ message: 'Heartbeat did not match the active timer' });
            return;
        }

        const requestReceivedAt = new Date();
        const lastClientActivityAt = typeof lastClientActivityAtRaw === 'string'
            ? new Date(lastClientActivityAtRaw)
            : null;

        // Validate recency: reject timestamps older than 2× heartbeat interval or in the future (clock skew).
        // Prevents clients from sending stale or forged activity timestamps.
        const heartbeatIntervalMs = env.heartbeatIntervalMinutes * 60_000;
        const MAX_ACTIVITY_AGE_MS = 2 * heartbeatIntervalMs;
        let validLastClientActivityAt: Date | null =
            lastClientActivityAt && !Number.isNaN(lastClientActivityAt.getTime())
                ? lastClientActivityAt
                : null;
        if (validLastClientActivityAt) {
            const ageMs = Date.now() - validLastClientActivityAt.getTime();
            if (ageMs > MAX_ACTIVITY_AGE_MS || ageMs < -60_000) {
                validLastClientActivityAt = null;
            }
        }

        const guardrailOutcome = await enforceTimerGuardrails({
            timer: activeTimer,
            now: requestReceivedAt,
            visibilityState,
            hasFocus,
            lastClientActivityAtOverride: validLastClientActivityAt,
        });

        if (guardrailOutcome === 'stopped') {
            res.status(404).json({ message: 'No active timer found to ping' });
            return;
        }

        await prisma.activeTimer.update({
            where: { user_id },
            data: {
                last_active_ping: requestReceivedAt,
                last_heartbeat_at: requestReceivedAt,
                last_client_activity_at: validLastClientActivityAt,
                client_visibility: visibilityState,
                client_has_focus: hasFocus,
                heartbeat_state: {
                    ...(activeTimer.heartbeat_state as Record<string, unknown> || {}),
                    last_activity_at: validLastClientActivityAt?.toISOString() ?? null,
                    visibility_state: visibilityState,
                    has_focus: hasFocus,
                    active_timer_id: activeTimer.id,
                    received_at: requestReceivedAt.toISOString(),
                },
            },
        });

        await prisma.auditLog.create({
            data: {
                user_id,
                action: 'timer_heartbeat_received',
                resource: 'active_timer',
                metadata: {
                    active_timer_id: activeTimer.id,
                    last_activity_at: validLastClientActivityAt?.toISOString() ?? null,
                    visibility_state: visibilityState,
                    has_focus: hasFocus,
                },
            },
        });

        res.status(200).json({
            message: guardrailOutcome === 'paused' ? 'Ping successful, timer paused for inactivity' : 'Ping successful',
            state: guardrailOutcome === 'paused' ? 'paused' : 'running',
        });
    } catch (error) {
        console.error('Failed to ping timer:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// --- pauseBeacon ---
// Called by navigator.sendBeacon on tab/window close. Cannot use Authorization header,
// so the JWT is passed in the request body. Always returns 200 — beacon doesn't retry.
export const pauseBeacon = async (req: Request, res: Response): Promise<void> => {
    try {
        const rawToken = req.body?.token;
        if (!rawToken || typeof rawToken !== 'string') {
            res.status(200).end();
            return;
        }

        let userId: string;
        try {
            const payload = jwt.verify(rawToken, env.jwtSecret) as { userId: string };
            userId = payload.userId;
            if (!userId) throw new Error('No userId in token');
        } catch {
            res.status(200).end();
            return;
        }

        await pauseActiveTimer(userId, 'tab_closed');
    } catch (error) {
        console.error('[pauseBeacon] error:', error);
    }
    res.status(200).end();
};

// --- Timesheet Approvals (Managers/Admins) ---
export const getPendingTimesheets = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Only return valid pending entries with positive duration windows.
        const pendingEntries = await prisma.timeEntry.findMany({
            where: {
                status: 'pending',
                duration: { gt: 0 },
                end_time: { gt: new Date('1970-01-01') },
            },
            include: {
                user: { select: { id: true, first_name: true, last_name: true, email: true } },
                project: { select: { name: true } }
            },
            orderBy: { created_at: 'desc' },
        });

        const saneEntries = pendingEntries.filter((entry) => new Date(entry.end_time).getTime() > new Date(entry.start_time).getTime());

        res.status(200).json({
            entries: saneEntries.map((entry) => ({
                ...entry,
                intelligence: scoreTimeEntryRisk(entry),
            })),
        });
    } catch (error) {
        console.error('Failed to get pending timesheets:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const reviewTimesheet = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const reviewerId = requireUserId(req);
        const entryId = req.params.entryId as string;
        const { action } = req.body; // 'approve' or 'reject'

        if (!['approve', 'reject'].includes(action)) {
            res.status(400).json({ message: 'Invalid action. Must be approve or reject.' });
            return;
        }

        const statusMap = { approve: 'approved', reject: 'rejected' };

        const updatedEntry = await prisma.timeEntry.update({
            where: { id: entryId },
            data: { status: statusMap[action as keyof typeof statusMap] }
        });

        // Notify the user about the decision
        await prisma.notification.create({
            data: {
                user_id: updatedEntry.user_id,
                message: `Your timesheet for ${updatedEntry.task_description} was ${statusMap[action as keyof typeof statusMap]} by your manager.`,
                type: 'approval_status'
            }
        });

        try {
            await prisma.auditLog.create({
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
        } catch (error) {
            console.error('Failed to write timesheet review audit log:', error);
        }

        res.status(200).json(updatedEntry);
    } catch (error) {
        console.error('Failed to review timesheet:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateEntry = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const role = req.user?.role;
        const entryId = req.params.id as string;

        const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
        if (!entry) { res.status(404).json({ message: 'Time entry not found' }); return; }
        if (entry.user_id !== user_id && role !== 'Admin' && role !== 'Manager') {
            res.status(403).json({ message: 'Not authorized to edit this entry' }); return;
        }

        const data: Record<string, unknown> = {};
        const { task_description, project_id, start_time, end_time, notes, is_billable, tag_ids } = req.body ?? {};

        if (typeof task_description === 'string' && task_description.trim()) data.task_description = task_description.trim();
        if (project_id !== undefined) data.project_id = project_id || null;
        if (typeof notes === 'string') data.notes = notes.trim() || null;
        if (typeof is_billable === 'boolean') data.is_billable = is_billable;

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

        const updated = await prisma.$transaction(async (tx) => {
            const result = await tx.timeEntry.update({ where: { id: entryId }, data });

            if (Array.isArray(tag_ids)) {
                await tx.timeEntryTag.deleteMany({ where: { time_entry_id: entryId } });
                if (tag_ids.length > 0) {
                    await tx.timeEntryTag.createMany({
                        data: tag_ids.map((tag_id: string) => ({ time_entry_id: entryId, tag_id })),
                        skipDuplicates: true,
                    });
                }
            }

            return result;
        });

        res.status(200).json(updated);
    } catch (error) {
        console.error('Failed to update entry:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteEntry = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const role = req.user?.role;
        const entryId = req.params.id as string;

        const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
        if (!entry) { res.status(404).json({ message: 'Time entry not found' }); return; }
        if (entry.user_id !== user_id && role !== 'Admin') {
            res.status(403).json({ message: 'Not authorized to delete this entry' }); return;
        }

        await prisma.timeEntry.delete({ where: { id: entryId } });
        res.status(200).json({ message: 'Time entry deleted' });
    } catch (error) {
        console.error('Failed to delete entry:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const duplicateEntry = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const entryId = req.params.id as string;

        const entry = await prisma.timeEntry.findUnique({
            where: { id: entryId },
            include: { tags: { select: { tag_id: true } } },
        });
        if (!entry) { res.status(404).json({ message: 'Time entry not found' }); return; }

        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(9, 0, 0, 0);
        const endTime = new Date(startOfDay.getTime() + entry.duration * 1000);

        const newEntry = await prisma.$transaction(async (tx) => {
            const created = await tx.timeEntry.create({
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
                await tx.timeEntryTag.createMany({
                    data: entry.tags.map(t => ({ time_entry_id: created.id, tag_id: t.tag_id })),
                    skipDuplicates: true,
                });
            }

            return created;
        });

        res.status(201).json(newEntry);
    } catch (error) {
        console.error('Failed to duplicate entry:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
