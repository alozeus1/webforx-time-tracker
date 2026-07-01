import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { env } from '../config/env';
import { AuthRequest } from '../types/auth';
import { emitWebhookEvent } from '../services/webhookService';
import { scoreTimeEntryRisk } from '../services/opsInsightsService';
import { pauseActiveTimer, resumeActiveTimer, stopActiveTimerWithReason } from '../services/activeTimerService';
import { getGlobalTimerPolicy } from '../services/timerPolicyService';
import { assertPeriodNotLocked } from '../services/payrollLockService';
import { assertComplianceAllowsDelete, assertComplianceAllowsEdit, notifyWtdIfNeeded } from '../services/complianceService';
import { applyRounding } from '../services/roundingService';

type GuardrailActiveTimer = {
    id: string;
    user_id: string;
    start_time: Date;
    last_active_ping: Date | null;
    last_heartbeat_at: Date | null;
    last_client_activity_at: Date | null;
    client_visibility: string | null;
    client_has_focus: boolean | null;
    heartbeat_miss_count?: number;
    is_paused: boolean;
    paused_at: Date | null;
};

const requireUserId = (req: AuthRequest): string => {
    if (!req.user?.userId) {
        throw new Error('Authenticated user is required');
    }

    return req.user.userId;
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
    organizationId,
}: {
    timer: GuardrailActiveTimer;
    now?: Date;
    visibilityState?: string | null;
    hasFocus?: boolean | null;
    lastClientActivityAtOverride?: Date | null;
    organizationId: string;
}): Promise<'none' | 'paused' | 'stopped'> => {
    const checkTime = now ?? new Date();
    const policy = await getGlobalTimerPolicy();
    const thresholds = {
        heartbeatIntervalMs: policy.heartbeatIntervalSeconds * 1000,
        idlePauseThresholdMs: policy.idlePauseAfterMinutes * 60_000,
        maxPauseMs: env.maxPauseHours * 60 * 60 * 1000,
        maxActiveTimerMs: policy.maxSessionDurationHours * 60 * 60 * 1000,
    };
    const activeForMs = checkTime.getTime() - new Date(timer.start_time).getTime();

    if (activeForMs >= thresholds.maxActiveTimerMs) {
        await stopActiveTimerWithReason({
            userId: timer.user_id,
            reason: 'active_duration_limit',
            triggeredAt: checkTime,
            organizationId,
        });
        return 'stopped';
    }

    if (timer.is_paused) {
        if (timer.paused_at) {
            const pausedForMs = checkTime.getTime() - new Date(timer.paused_at).getTime();
            if (pausedForMs >= thresholds.maxPauseMs) {
                await stopActiveTimerWithReason({
                    userId: timer.user_id,
                    reason: 'pause_expired',
                    triggeredAt: checkTime,
                    organizationId,
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

    const heartbeatAgeMs = lastClientActivityAtOverride
        ? 0
        : checkTime.getTime() - lastHeartbeat.getTime();
    const clientActivityAgeMs = checkTime.getTime() - lastClientActivity.getTime();
    const missedHeartbeats = Math.max(Math.floor(heartbeatAgeMs / thresholds.heartbeatIntervalMs) - 1, 0);
    const { effectiveVisibility, effectiveHasFocus } = resolveInactivitySource({ timer, visibilityState, hasFocus });
    // In enhanced mode, hidden tabs with fresh heartbeats are 'hidden_connected' — idleTracker.ts
    // has exclusive ownership of their session lifecycle. Setting this false here prevents the
    // inline guardrail from racing against the idleTracker and wrongly pausing active WFH sessions.
    const browserExplicitlyInactive = env.timerEnhancedActivityDetection
        ? false
        : effectiveVisibility === 'hidden' || effectiveHasFocus === false;

    if (
        clientActivityAgeMs >= thresholds.idlePauseThresholdMs ||
        missedHeartbeats >= policy.missedHeartbeatPauseThreshold ||
        browserExplicitlyInactive && clientActivityAgeMs >= policy.idleWarningAfterMinutes * 60_000
    ) {
        const reason = missedHeartbeats >= policy.missedHeartbeatPauseThreshold
            ? 'missed_heartbeat_threshold'
            : browserExplicitlyInactive
                ? 'browser_inactive'
                : 'idle_timeout';
        await pauseActiveTimer(timer.user_id, organizationId, reason);
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

        const existingTimer = await prisma.activeTimer.findFirst({
            where: { user_id, organization_id: req.user!.organization_id },
        });
        if (existingTimer) {
            res.status(400).json({ message: 'A timer is already running for this user' });
            return;
        }

        const newTimer = await prisma.activeTimer.create({
            data: {
                user_id,
                organization_id: req.user!.organization_id,
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
                    organization_id: req.user!.organization_id,
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
        // P2002 = unique constraint violated — concurrent request already created the timer.
        if ((error as { code?: string })?.code === 'P2002') {
            res.status(409).json({ message: 'Timer already running for this user' });
            return;
        }
        console.error('Failed to start timer:', error);
        res.status(500).json({ message: 'Internal server error while starting timer' });
    }
};

export const stopTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const notes = typeof req.body?.notes === 'string' && req.body.notes.trim() ? req.body.notes.trim() : null;

        const activeTimer = await prisma.activeTimer.findFirst({
            where: { user_id, organization_id: req.user!.organization_id },
        });
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
                    organization_id: req.user!.organization_id,
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

            await tx.activeTimer.delete({ where: { id: activeTimer.id } });

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
                    organization_id: req.user!.organization_id,
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

        // Overtime weekly limit check — must run BEFORE res.json so it commits in the
        // same Vercel function invocation. On serverless, anything after res.json is
        // unreliable (the process may be frozen/torn down).
        try {
            const user = await prisma.user.findFirst({
                where: { id: user_id, organization_id: req.user!.organization_id },
                select: { weekly_hour_limit: true },
            });
            if (user?.weekly_hour_limit) {
                const now = new Date();
                const dayOfWeek = now.getDay();
                const monday = new Date(now);
                monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
                monday.setHours(0, 0, 0, 0);

                const weekEntries = await prisma.timeEntry.findMany({
                    where: {
                        organization_id: req.user!.organization_id,
                        user_id,
                        start_time: { gte: monday },
                    },
                    select: { duration: true },
                });
                const totalWeekHours = weekEntries.reduce((s, e) => s + e.duration, 0) / 3600;

                if (totalWeekHours > user.weekly_hour_limit) {
                    await prisma.notification.create({
                        data: {
                            user_id,
                            organization_id: req.user!.organization_id,
                            message: `You have logged ${totalWeekHours.toFixed(1)}h this week, exceeding your ${user.weekly_hour_limit}h weekly limit.`,
                            type: 'overtime_alert',
                        },
                    });
                }
            }
        } catch (err) {
            console.error('Overtime check failed:', err);
        }

        // WTD compliance check — fire-and-forget, non-blocking
        notifyWtdIfNeeded(req.user!.organization_id, user_id).catch(() => {});

        res.status(200).json(timeEntry);

        // Fire-and-forget webhook — runs after response; acceptable if it's occasionally
        // dropped on Vercel (non-critical side effect).
        emitWebhookEvent('timer.stopped', {
            time_entry_id: timeEntry.id, user_id, duration: timeEntry.duration, project_id: timeEntry.project_id,
        }).catch(() => {});
    } catch (error) {
        console.error('Failed to stop timer:', error);
        res.status(500).json({ message: 'Internal server error while stopping timer' });
    }
};

export const pauseTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    const user_id = requireUserId(req);

    try {
        const timer = await prisma.activeTimer.findFirst({
            where: { user_id, organization_id: req.user!.organization_id },
        });
        if (!timer) { res.status(404).json({ message: 'No active timer found.' }); return; }
        if (timer.is_paused) { res.status(200).json({ ok: true, message: 'Timer already paused.', pausedAt: timer.paused_at }); return; }

        await pauseActiveTimer(user_id, req.user!.organization_id, 'user_requested');
        res.status(200).json({ ok: true, pausedAt: new Date().toISOString() });
    } catch (error) {
        console.error('[pauseTimer]', error);
        res.status(500).json({ message: 'Failed to pause timer.' });
    }
};

export const resumeTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    const user_id = requireUserId(req);

    try {
        const timer = await prisma.activeTimer.findFirst({
            where: { user_id, organization_id: req.user!.organization_id },
        });
        if (!timer) { res.status(404).json({ message: 'No active timer found.' }); return; }
        if (!timer.is_paused) { res.status(200).json({ ok: true, message: 'Timer is not paused.' }); return; }

        const totalPausedSeconds = await resumeActiveTimer(user_id, req.user!.organization_id);
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

        // Payroll period lock check
        try {
            await assertPeriodNotLocked(req.user!.organization_id, start);
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'PERIOD_LOCKED') {
                res.status(423).json({ message: (e as Error).message });
                return;
            }
            throw e;
        }

        // Compliance mode checks (DCAA requires project_id on every entry)
        {
            const { getOrgComplianceMode } = await import('../services/complianceService');
            const complianceMode = await getOrgComplianceMode(req.user!.organization_id);
            if (complianceMode === 'dcaa') {
                const resolvedProjectId = typeof project_id === 'string' && project_id.trim() ? project_id : null;
                if (!resolvedProjectId) {
                    res.status(400).json({ message: 'DCAA compliance mode requires a project code on every time entry.' });
                    return;
                }
            }
        }

        // Apply time rounding if org has a rounding rule configured
        const roundedStart = await applyRounding(req.user!.organization_id, start, 'start');
        const roundedEnd = await applyRounding(req.user!.organization_id, end, 'end');
        const roundedDuration = Math.floor((roundedEnd.getTime() - roundedStart.getTime()) / 1000);
        const effectiveStart = roundedDuration > 0 ? roundedStart : start;
        const effectiveEnd = roundedDuration > 0 ? roundedEnd : end;
        const effectiveDuration = roundedDuration > 0 ? roundedDuration : duration;

        // Transaction: if tag linking fails the entry is rolled back — no orphaned entries.
        const timeEntry = await prisma.$transaction(async (tx) => {
            const entry = await tx.timeEntry.create({
                data: {
                    user_id,
                    organization_id: req.user!.organization_id,
                    project_id: typeof project_id === 'string' && project_id.trim() ? project_id : null,
                    task_description: task_description.trim(),
                    start_time: effectiveStart,
                    end_time: effectiveEnd,
                    duration: effectiveDuration,
                    entry_type: 'manual',
                    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
                    is_billable,
                },
            });

            if (tag_ids.length > 0) {
                await tx.timeEntryTag.createMany({
                    data: tag_ids.map((tag_id: string) => ({ time_entry_id: entry.id, tag_id })),
                    skipDuplicates: true,
                });
            }

            return entry;
        });

        // Audit log is best-effort — failure should NOT roll back the time entry.
        try {
            await prisma.auditLog.create({
                data: {
                    user_id,
                    organization_id: req.user!.organization_id,
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
        } catch (auditError) {
            console.error('Failed to write manual entry audit log:', auditError);
        }

        res.status(201).json(timeEntry);
    } catch (error) {
        console.error('Failed to create manual entry:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createCorrectionRequest = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const requestedStartTime = new Date(req.body?.requested_start_time);
        const requestedEndTime = new Date(req.body?.requested_end_time);
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        const workNote = typeof req.body?.work_note === 'string' && req.body.work_note.trim()
            ? req.body.work_note.trim()
            : null;
        const timerSessionId = typeof req.body?.timer_session_id === 'string' && req.body.timer_session_id.trim()
            ? req.body.timer_session_id.trim()
            : null;

        if (
            Number.isNaN(requestedStartTime.getTime()) ||
            Number.isNaN(requestedEndTime.getTime()) ||
            requestedEndTime <= requestedStartTime
        ) {
            res.status(400).json({ message: 'Correction request time range is invalid.' });
            return;
        }

        if (!reason) {
            res.status(400).json({ message: 'Correction reason is required.' });
            return;
        }

        const conflict = await prisma.timeEntry.findFirst({
            where: {
                organization_id: req.user!.organization_id,
                user_id,
                status: 'approved',
                start_time: { lt: requestedEndTime },
                end_time: { gt: requestedStartTime },
            },
        });

        if (conflict) {
            res.status(409).json({ message: 'Correction request overlaps an approved time entry.' });
            return;
        }

        const requestedDurationSeconds = Math.floor((requestedEndTime.getTime() - requestedStartTime.getTime()) / 1000);
        const correction = await prisma.timerCorrectionRequest.create({
            data: {
                user_id,
                organization_id: req.user!.organization_id,
                timer_session_id: timerSessionId,
                requested_start_time: requestedStartTime,
                requested_end_time: requestedEndTime,
                requested_duration_seconds: requestedDurationSeconds,
                reason,
                work_note: workNote,
            },
        });

        await prisma.auditLog.create({
            data: {
                user_id,
                organization_id: req.user!.organization_id,
                action: 'correction_request_created',
                resource: 'timer_correction_request',
                metadata: {
                    correction_request_id: correction.id,
                    timer_session_id: timerSessionId,
                    requested_duration_seconds: requestedDurationSeconds,
                },
            },
        });

        res.status(201).json({ correction });
    } catch (error) {
        console.error('Failed to create correction request:', error);
        res.status(500).json({ message: 'Internal server error while creating correction request' });
    }
};

export const getMyCorrectionRequests = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const corrections = await prisma.timerCorrectionRequest.findMany({
            where: { organization_id: req.user!.organization_id, user_id },
            orderBy: { created_at: 'desc' },
            take: 100,
        });
        res.status(200).json({ corrections });
    } catch (error) {
        console.error('Failed to list correction requests:', error);
        res.status(500).json({ message: 'Internal server error while loading correction requests' });
    }
};

export const getCorrectionRequestsForReview = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const corrections = await prisma.timerCorrectionRequest.findMany({
            where: { organization_id: req.user!.organization_id },
            orderBy: { created_at: 'desc' },
            take: 200,
            include: {
                user: { select: { id: true, email: true, first_name: true, last_name: true } },
            },
        });
        res.status(200).json({ corrections });
    } catch (error) {
        console.error('Failed to list correction requests for review:', error);
        res.status(500).json({ message: 'Internal server error while loading correction requests' });
    }
};

export const reviewCorrectionRequest = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const reviewerId = requireUserId(req);
        const correctionId = String(req.params.correctionId);
        const action = req.body?.action;
        const reviewerNote = typeof req.body?.reviewer_note === 'string' && req.body.reviewer_note.trim()
            ? req.body.reviewer_note.trim()
            : null;

        if (!['approve', 'reject'].includes(action)) {
            res.status(400).json({ message: 'Invalid correction review action.' });
            return;
        }

        const correction = await prisma.timerCorrectionRequest.findFirst({
            where: { id: correctionId, organization_id: req.user!.organization_id },
        });
        if (!correction) {
            res.status(404).json({ message: 'Correction request not found.' });
            return;
        }

        if (correction.status !== 'PENDING') {
            res.status(400).json({ message: 'Correction request has already been reviewed.' });
            return;
        }

        const nextStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
        const updated = await prisma.$transaction(async (tx) => {
            const reviewed = await tx.timerCorrectionRequest.update({
                where: { id: correction.id },
                data: {
                    status: nextStatus,
                    reviewed_by: reviewerId,
                    reviewed_at: new Date(),
                    reviewer_note: reviewerNote,
                },
            });

            if (action === 'approve') {
                const conflict = await tx.timeEntry.findFirst({
                    where: {
                        organization_id: req.user!.organization_id,
                        user_id: correction.user_id,
                        status: 'approved',
                        start_time: { lt: correction.requested_end_time },
                        end_time: { gt: correction.requested_start_time },
                    },
                });

                if (conflict) {
                    throw new Error('Correction request overlaps an approved time entry.');
                }

                await tx.timeEntry.create({
                    data: {
                        user_id: correction.user_id,
                        organization_id: req.user!.organization_id,
                        project_id: null,
                        task_description: 'Approved timer correction',
                        start_time: correction.requested_start_time,
                        end_time: correction.requested_end_time,
                        duration: correction.requested_duration_seconds,
                        entry_type: 'manual',
                        notes: [correction.reason, correction.work_note, reviewerNote].filter(Boolean).join('\n\n') || null,
                        status: 'approved',
                    },
                });
            }

            return reviewed;
        });

        await prisma.auditLog.create({
            data: {
                user_id: reviewerId,
                organization_id: req.user!.organization_id,
                action: action === 'approve' ? 'correction_request_approved' : 'correction_request_rejected',
                resource: 'timer_correction_request',
                metadata: {
                    correction_request_id: correction.id,
                    target_user_id: correction.user_id,
                    reviewer_note: reviewerNote,
                },
            },
        });

        await prisma.notification.create({
            data: {
                user_id: correction.user_id,
                organization_id: req.user!.organization_id,
                message: `Your timer correction request was ${nextStatus.toLowerCase()}.`,
                type: 'correction_request_reviewed',
            },
        });

        res.status(200).json({ correction: updated });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error while reviewing correction request';
        console.error('Failed to review correction request:', error);
        res.status(message.includes('overlaps') ? 409 : 500).json({ message });
    }
};

export const getMyEntries = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const page = Math.max(parseInt(req.query.page as string) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
        const skip = (page - 1) * limit;

        let activeTimer = await prisma.activeTimer.findFirst({
            where: { user_id, organization_id: req.user!.organization_id },
            include: { project: { select: { id: true, name: true } } },
        });

        if (activeTimer) {
            const guardrailResult = await enforceTimerGuardrails({
                timer: activeTimer,
                now: new Date(),
                organizationId: req.user!.organization_id,
            });

            if (guardrailResult !== 'none') {
                activeTimer = await prisma.activeTimer.findFirst({
                    where: { user_id, organization_id: req.user!.organization_id },
                    include: { project: { select: { id: true, name: true } } },
                });
            }
        }

        const [entries, total] = await Promise.all([
            prisma.timeEntry.findMany({
                where: { organization_id: req.user!.organization_id, user_id },
                orderBy: { start_time: 'desc' },
                include: {
                    project: { select: { id: true, name: true } },
                    tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
                },
                skip,
                take: limit,
            }),
            prisma.timeEntry.count({ where: { organization_id: req.user!.organization_id, user_id } }),
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

// Valid browser_activity_state values emitted by the enhanced frontend heartbeat hook.
const VALID_BROWSER_ACTIVITY_STATES = new Set([
    'active',            // Tab visible + recent user input in this session
    'visible_inactive',  // Tab visible + no recent user input (looking but not typing)
    'hidden_connected',  // Tab hidden but heartbeat still arriving (working in another app)
    'idle_candidate',    // Tab hidden + no activity for a while, approaching idle threshold
]);

export const pingTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const lastClientActivityAtRaw = req.body?.last_activity_at;
        const activeTimerId = typeof req.body?.active_timer_id === 'string' ? req.body.active_timer_id : null;
        const visibilityState = typeof req.body?.visibility_state === 'string' ? req.body.visibility_state : null;
        const hasFocus = typeof req.body?.has_focus === 'boolean' ? req.body.has_focus : null;
        // Enhanced activity detection: client-computed activity state (feature-flagged on frontend).
        // Accepted values: active | visible_inactive | hidden_connected | idle_candidate
        const rawBrowserActivityState = typeof req.body?.browser_activity_state === 'string'
            ? req.body.browser_activity_state
            : null;
        const browserActivityState = rawBrowserActivityState && VALID_BROWSER_ACTIVITY_STATES.has(rawBrowserActivityState)
            ? rawBrowserActivityState
            : null;

        const activeTimer = await prisma.activeTimer.findFirst({
            where: { user_id, organization_id: req.user!.organization_id },
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
        const policy = await getGlobalTimerPolicy();
        const heartbeatIntervalMs = policy.heartbeatIntervalSeconds * 1000;
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
            organizationId: req.user!.organization_id,
        });

        if (guardrailOutcome === 'stopped') {
            res.status(404).json({ message: 'No active timer found to ping' });
            return;
        }

        await prisma.activeTimer.update({
            where: { id: activeTimer.id },
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
                    browser_activity_state: browserActivityState,
                    active_timer_id: activeTimer.id,
                    received_at: requestReceivedAt.toISOString(),
                },
                heartbeat_miss_count: 0,
                idle_warning_shown_at: null,
            },
        });

        await prisma.auditLog.create({
            data: {
                user_id,
                organization_id: req.user!.organization_id,
                action: 'timer_heartbeat_received',
                resource: 'active_timer',
                metadata: {
                    active_timer_id: activeTimer.id,
                    last_activity_at: validLastClientActivityAt?.toISOString() ?? null,
                    visibility_state: visibilityState,
                    has_focus: hasFocus,
                    browser_activity_state: browserActivityState,
                },
            },
        });

        res.status(200).json({
            message: guardrailOutcome === 'paused' ? 'Ping successful, timer paused for inactivity' : 'Ping successful',
            state: guardrailOutcome === 'paused' ? 'paused' : 'running',
            // Return server-authoritative policy thresholds so the client can display accurate
            // countdowns without relying solely on env-var-baked values.
            policy: {
                idleWarningAfterMinutes: policy.idleWarningAfterMinutes,
                idlePauseAfterMinutes: policy.idlePauseAfterMinutes,
                heartbeatIntervalSeconds: policy.heartbeatIntervalSeconds,
            },
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
            const payload = jwt.verify(rawToken, env.jwtSecret) as { userId: string; type?: string };
            // Guard: refresh tokens are longer-lived and must not be accepted here.
            if (payload.type === 'refresh') throw new Error('Refresh token not accepted for beacon');
            userId = payload.userId;
            if (!userId) throw new Error('No userId in token');
        } catch {
            res.status(200).end();
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { organization_id: true },
        });
        if (!user) {
            res.status(200).end();
            return;
        }

        await pauseActiveTimer(userId, user.organization_id, 'tab_closed');
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
                organization_id: req.user!.organization_id,
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

        const entry = await prisma.timeEntry.findFirst({
            where: { id: entryId, organization_id: req.user!.organization_id },
        });
        if (!entry) {
            res.status(404).json({ message: 'Timesheet entry not found' });
            return;
        }

        // Transaction: status update + notification must both commit or both roll back.
        // Also scopes the UPDATE to the org so a malicious entryId from another tenant
        // cannot be approved by a manager in a different org (TOCTOU mitigation).
        const updatedEntry = await prisma.$transaction(async (tx) => {
            const updated = await tx.timeEntry.update({
                where: { id: entryId, organization_id: req.user!.organization_id },
                data: { status: statusMap[action as keyof typeof statusMap] },
            });

            await tx.notification.create({
                data: {
                    user_id: updated.user_id,
                    organization_id: req.user!.organization_id,
                    message: `Your timesheet for ${updated.task_description} was ${statusMap[action as keyof typeof statusMap]} by your manager.`,
                    type: 'approval_status',
                },
            });

            return updated;
        });

        try {
            await prisma.auditLog.create({
                data: {
                    user_id: reviewerId,
                    organization_id: req.user!.organization_id,
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

        const entry = await prisma.timeEntry.findFirst({
            where: { id: entryId, organization_id: req.user!.organization_id },
        });
        if (!entry) { res.status(404).json({ message: 'Time entry not found' }); return; }
        if (entry.user_id !== user_id && role !== 'Admin' && role !== 'Manager') {
            res.status(403).json({ message: 'Not authorized to edit this entry' }); return;
        }

        // Payroll lock check
        try {
            await assertPeriodNotLocked(req.user!.organization_id, entry.start_time);
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'PERIOD_LOCKED') {
                res.status(423).json({ message: (e as Error).message });
                return;
            }
            throw e;
        }

        // Compliance mode: DCAA blocks edits of approved entries
        try {
            await assertComplianceAllowsEdit(req.user!.organization_id, entry);
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'COMPLIANCE_BLOCKED') {
                res.status(403).json({ message: (e as Error).message });
                return;
            }
            throw e;
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
            // Include org_id in the UPDATE WHERE to close the TOCTOU window between
            // the findFirst check above and this write.
            const result = await tx.timeEntry.update({ where: { id: entryId, organization_id: req.user!.organization_id }, data });

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

        const entry = await prisma.timeEntry.findFirst({
            where: { id: entryId, organization_id: req.user!.organization_id },
        });
        if (!entry) { res.status(404).json({ message: 'Time entry not found' }); return; }
        if (entry.user_id !== user_id && role !== 'Admin') {
            res.status(403).json({ message: 'Not authorized to delete this entry' }); return;
        }

        // Payroll lock check
        try {
            await assertPeriodNotLocked(req.user!.organization_id, entry.start_time);
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'PERIOD_LOCKED') {
                res.status(423).json({ message: (e as Error).message });
                return;
            }
            throw e;
        }

        // Compliance mode: DCAA blocks deletes of approved entries
        try {
            await assertComplianceAllowsDelete(req.user!.organization_id, entry);
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'COMPLIANCE_BLOCKED') {
                res.status(403).json({ message: (e as Error).message });
                return;
            }
            throw e;
        }

        // Scope DELETE to org_id to close the TOCTOU window between the findFirst above and this write.
        await prisma.timeEntry.delete({ where: { id: entryId, organization_id: req.user!.organization_id } });
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

        const entry = await prisma.timeEntry.findFirst({
            where: { id: entryId, organization_id: req.user!.organization_id },
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
                    organization_id: req.user!.organization_id,
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

// ---------------------------------------------------------------------------
// PATCH /api/v1/timers/bulk  — bulk operations on multiple entries
// ---------------------------------------------------------------------------
export const bulkUpdateEntries = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const orgId = req.user!.organization_id;
        const role = req.user?.role;
        const user_id = requireUserId(req);

        const { entry_ids, action, project_id, is_billable, tag_ids } = req.body ?? {};

        if (!Array.isArray(entry_ids) || entry_ids.length === 0) {
            res.status(400).json({ message: 'entry_ids must be a non-empty array.' });
            return;
        }
        if (entry_ids.length > 200) {
            res.status(400).json({ message: 'Bulk operations are limited to 200 entries at once.' });
            return;
        }

        const validActions = ['approve', 'reject', 'set_project', 'set_billable', 'set_tags', 'delete'];
        if (!validActions.includes(action)) {
            res.status(400).json({ message: `Invalid action. Must be one of: ${validActions.join(', ')}` });
            return;
        }

        // Only managers/admins can approve/reject
        if (['approve', 'reject'].includes(action) && role !== 'Admin' && role !== 'Manager') {
            res.status(403).json({ message: 'Only Managers and Admins can bulk approve/reject entries.' });
            return;
        }

        // Fetch all entries scoped to org
        const entries = await prisma.timeEntry.findMany({
            where: { id: { in: entry_ids }, organization_id: orgId },
        });

        if (entries.length === 0) {
            res.status(404).json({ message: 'No matching entries found.' });
            return;
        }

        // For non-admin/manager actions, only allow edits on own entries
        const filtered = ['approve', 'reject'].includes(action)
            ? entries
            : entries.filter(e => e.user_id === user_id || role === 'Admin' || role === 'Manager');

        if (filtered.length === 0) {
            res.status(403).json({ message: 'Not authorized to modify the selected entries.' });
            return;
        }

        const ids = filtered.map(e => e.id);

        // Payroll lock: skip any entry that falls in a locked period and report them
        const lockChecks = await Promise.all(
            filtered.map(async (e) => {
                try {
                    await assertPeriodNotLocked(orgId, e.start_time);
                    return { id: e.id, locked: false };
                } catch {
                    return { id: e.id, locked: true };
                }
            }),
        );
        const lockedIds = new Set(lockChecks.filter(c => c.locked).map(c => c.id));
        const editableIds = ids.filter(id => !lockedIds.has(id));

        if (editableIds.length === 0) {
            res.status(423).json({ message: 'All selected entries fall within locked payroll periods.' });
            return;
        }

        let updatedCount = 0;

        await prisma.$transaction(async (tx) => {
            if (action === 'approve' || action === 'reject') {
                const result = await tx.timeEntry.updateMany({
                    where: { id: { in: editableIds }, organization_id: orgId },
                    data: { status: action === 'approve' ? 'approved' : 'rejected' },
                });
                updatedCount = result.count;
            } else if (action === 'set_project') {
                const result = await tx.timeEntry.updateMany({
                    where: { id: { in: editableIds }, organization_id: orgId },
                    data: { project_id: project_id || null },
                });
                updatedCount = result.count;
            } else if (action === 'set_billable') {
                if (typeof is_billable !== 'boolean') throw new Error('is_billable must be a boolean.');
                const result = await tx.timeEntry.updateMany({
                    where: { id: { in: editableIds }, organization_id: orgId },
                    data: { is_billable },
                });
                updatedCount = result.count;
            } else if (action === 'set_tags') {
                if (!Array.isArray(tag_ids)) throw new Error('tag_ids must be an array.');
                // Remove existing tags and set new ones for each entry
                await tx.timeEntryTag.deleteMany({ where: { time_entry_id: { in: editableIds } } });
                if (tag_ids.length > 0) {
                    const links = editableIds.flatMap((eid) =>
                        (tag_ids as string[]).map((tid) => ({ time_entry_id: eid, tag_id: tid })),
                    );
                    await tx.timeEntryTag.createMany({ data: links, skipDuplicates: true });
                }
                updatedCount = editableIds.length;
            } else if (action === 'delete') {
                const result = await tx.timeEntry.deleteMany({
                    where: { id: { in: editableIds }, organization_id: orgId },
                });
                updatedCount = result.count;
            }
        });

        try {
            await prisma.auditLog.create({
                data: {
                    user_id,
                    organization_id: orgId,
                    action: `bulk_${action}`,
                    resource: 'time_entry',
                    metadata: {
                        entry_ids: editableIds,
                        skipped_locked: [...lockedIds],
                        updated_count: updatedCount,
                    },
                },
            });
        } catch (e) {
            console.error('[bulkUpdateEntries] audit log failed:', e);
        }

        res.status(200).json({
            updated: updatedCount,
            skipped_locked: [...lockedIds],
            message: lockedIds.size > 0
                ? `${updatedCount} entries updated; ${lockedIds.size} skipped (locked payroll period).`
                : `${updatedCount} entries updated.`,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Internal server error';
        console.error('Failed bulk update:', error);
        res.status(500).json({ message: msg });
    }
};
