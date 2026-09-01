import { Request, Response } from 'express';
import type { Prisma } from '@prisma/client/index';
import prisma from '../config/db';
import { env } from '../config/env';
import { AuthRequest } from '../types/auth';
import { emitWebhookEvent } from '../services/webhookService';
import { scoreTimeEntryRisk } from '../services/opsInsightsService';
import { pauseActiveTimer, resumeActiveTimer, stopActiveTimerWithReason, isBotStartedTimer } from '../services/activeTimerService';
import { getGlobalTimerPolicy } from '../services/timerPolicyService';
import { assertPeriodNotLocked } from '../services/payrollLockService';
import { assertComplianceAllowsDelete, assertComplianceAllowsEdit, notifyWtdIfNeeded } from '../services/complianceService';
import { applyRounding } from '../services/roundingService';
import { assertProjectBelongsToOrganization, assertTagsBelongToOrganization, normalizeIdList } from '../services/tenantOwnershipService';
import { verifyToken } from '../services/tokenService';
import { evaluateClockInGeofence, normalizeTimerLocation } from '../services/geofenceService';
import { getCorrectionRequestsForReview as getCorrectionRequestsForReviewService, purgeResolvedCorrections } from '../services/correctionRetentionService';
import {
    computeCountedSeconds,
    dailyCapConflictBody,
    getDailyUsage,
    OvertimeAckError,
    parseOvertimeAck,
    withDayCache,
    type DailyUsage,
} from '../services/dailyCapService';
import { findOverlaps, overlapConflictBody, TimeOverlapError } from '../services/timeOverlapService';
import {
    REJECTION_REASONS,
    REJECTION_NOTE_MAX_LENGTH,
    rejectionReasonLabel,
    reasonRequiresNote,
    validateRejectionReason,
} from '../constants/rejectionReasons';
import { dispatchRejectionNotices } from '../services/rejectionNoticeService';
import {
    assertRecoveryAllowed,
    getWeeklyRecoveryUsage,
    recoveryQuotaBody,
    RecoveryQuotaError,
    serializeRecoveryUsage,
} from '../services/recoveredTimeService';

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
    paused_duration_seconds?: number;
    persisted_state?: unknown;
};

/**
 * Reasons a client is allowed to declare when stopping a timer. Deliberately narrow:
 * the client may report that it enforced the session cap, but it cannot invent an
 * arbitrary stop_reason and thereby control the entry's risk score.
 */
const CLIENT_STOPPABLE_REASONS = ['active_duration_limit'] as const;

/** Ceiling on one bulk review request, matching bulkUpdateEntries. */
const BULK_REVIEW_LIMIT = 200;
type ClientStopReason = (typeof CLIENT_STOPPABLE_REASONS)[number];

const requireUserId = (req: AuthRequest): string => {
    if (!req.user?.userId) {
        throw new Error('Authenticated user is required');
    }

    return req.user.userId;
};

const sendTenantOwnershipError = (res: Response, error: unknown): boolean => {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'TENANT_PROJECT_NOT_FOUND') {
        res.status(404).json({ message: 'Project not found' });
        return true;
    }
    if (code === 'TENANT_TAG_NOT_FOUND') {
        res.status(404).json({ message: 'One or more tags not found' });
        return true;
    }
    return false;
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
    // Counted time, not wall-clock: comparing raw elapsed against the cap meant a
    // session paused for two hours was auto-stopped at six hours of real work.
    const activeForMs = computeCountedSeconds(
        {
            start_time: timer.start_time,
            paused_duration_seconds: timer.paused_duration_seconds || 0,
            is_paused: timer.is_paused,
            paused_at: timer.paused_at,
        },
        checkTime,
    ) * 1000;

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

    // Bot-started timers have no client that can send heartbeats, so the checks below
    // would pause them minutes after they start — see isBotStartedTimer. The session
    // cap and pause expiry above still apply.
    if (isBotStartedTimer(timer)) {
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

// ---------------------------------------------------------------------------
// Daily-cap gate
// ---------------------------------------------------------------------------

/**
 * Shared guard for every path that adds time to a day: starting a timer, a manual
 * entry, a correction request, or an edit that lengthens an entry.
 *
 * Returns null when it has already written a response (409 for "you are at your
 * cap", 400 for a malformed attestation) — callers must return immediately in that
 * case. Otherwise it returns the day's usage plus the validated attestation, which
 * the caller stamps onto the row it is about to write.
 */
const gateDailyCap = async (
    req: AuthRequest,
    res: Response,
    options: {
        userId: string;
        additionalSeconds?: number;
        at?: Date;
        excludeEntryId?: string;
    },
): Promise<{ usage: DailyUsage; ack: { acknowledged: true; reason: string } | null } | null> => {
    const user = await prisma.user.findFirst({
        where: { id: options.userId, organization_id: req.user!.organization_id },
        select: { id: true, timezone: true, employment_type: true },
    });

    if (!user) {
        res.status(404).json({ message: 'User not found' });
        return null;
    }

    const policy = await getGlobalTimerPolicy();
    const activeTimer = await prisma.activeTimer.findFirst({
        where: { user_id: options.userId, organization_id: req.user!.organization_id },
    });

    const usage = await getDailyUsage({
        user,
        organizationId: req.user!.organization_id,
        policy,
        at: options.at,
        activeTimer,
        additionalSeconds: options.additionalSeconds,
        excludeEntryId: options.excludeEntryId,
    });

    let ack: { acknowledged: true; reason: string } | null = null;
    try {
        ack = parseOvertimeAck(req.body?.overtime_ack);
    } catch (error) {
        if (error instanceof OvertimeAckError) {
            res.status(400).json({ code: 'OVERTIME_REASON_REQUIRED', message: error.message });
            return null;
        }
        throw error;
    }

    // Only 'at_cap'/'over_cap' block. 'approaching' and 'floor_passed' are advisory:
    // the client shows them, the server never refuses on them.
    const blocked = usage.state === 'at_cap' || usage.state === 'over_cap';
    if (blocked && !ack) {
        res.status(409).json(dailyCapConflictBody(usage));
        return null;
    }

    return { usage, ack: blocked ? ack : null };
};

/**
 * Reject a write that clashes with time already on the user's timeline.
 * Returns true when it has responded, so the caller must return.
 */
const rejectIfOverlapping = async (
    req: AuthRequest,
    res: Response,
    options: {
        userId: string;
        start: Date;
        end: Date;
        excludeEntryId?: string;
        excludeCorrectionId?: string;
        includeCorrections?: boolean;
    },
): Promise<boolean> => {
    const conflicts = await findOverlaps({
        organizationId: req.user!.organization_id,
        userId: options.userId,
        start: options.start,
        end: options.end,
        excludeEntryId: options.excludeEntryId,
        excludeCorrectionId: options.excludeCorrectionId,
        includeCorrections: options.includeCorrections,
    });

    if (conflicts.length > 0) {
        res.status(409).json(overlapConflictBody(conflicts));
        return true;
    }
    return false;
};

export const startTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const project_id = typeof req.body?.project_id === 'string' && req.body.project_id.trim() ? req.body.project_id : null;
        const task_description = typeof req.body?.task_description === 'string' ? req.body.task_description.trim() : '';
        const is_billable = req.body?.is_billable !== false;
        const tag_ids = normalizeIdList(req.body?.tag_ids);
        const user_id = requireUserId(req);
        const location = normalizeTimerLocation(req.body ?? {});

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

        // Starting a fresh timer is the main way the old per-session cap was walked
        // around: auto-stop at 8h, start again, repeat. The daily gate closes that.
        const capGate = await gateDailyCap(req, res, { userId: user_id });
        if (!capGate) return;

        const geofence = await evaluateClockInGeofence(req.user!.organization_id, location);
        if (!geofence.allowed) {
            if (location) {
                try {
                    await prisma.timerLocationEvent.create({
                        data: {
                            organization_id: req.user!.organization_id,
                            user_id,
                            zone_id: geofence.zoneId,
                            decision: 'denied',
                            latitude: location.latitude,
                            longitude: location.longitude,
                            accuracy_meters: location.accuracy_meters,
                        },
                    });
                } catch (eventError) {
                    console.error('Failed to record denied timer location event:', eventError);
                }
            }
            res.status(403).json({ code: 'GEOFENCE_RESTRICTED', message: geofence.reason });
            return;
        }

        await assertProjectBelongsToOrganization(project_id, req.user!.organization_id);
        await assertTagsBelongToOrganization(tag_ids, req.user!.organization_id);

        const newTimer = await prisma.activeTimer.create({
            data: {
                user_id,
                organization_id: req.user!.organization_id,
                project_id,
                task_description,
                start_time: new Date(),
                persisted_state: {
                    is_billable,
                    tag_ids,
                    // Carried through to the TimeEntry created at stop, so an
                    // attested over-cap session stays flagged even though the flag
                    // is decided hours before the entry exists.
                    over_daily_cap: Boolean(capGate.ack),
                    overtime_reason: capGate.ack?.reason ?? null,
                },
            },
        });

        if (geofence.policy.enabled && location) {
            try {
                await prisma.timerLocationEvent.create({
                    data: {
                        organization_id: req.user!.organization_id,
                        user_id,
                        active_timer_id: newTimer.id,
                        zone_id: geofence.zoneId,
                        decision: 'allowed',
                        latitude: location.latitude,
                        longitude: location.longitude,
                        accuracy_meters: location.accuracy_meters,
                    },
                });
            } catch (eventError) {
                console.error('Failed to record allowed timer location event:', eventError);
            }
        }

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
        if (sendTenantOwnershipError(res, error)) return;
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

        // Three enforcers can end a capped session — this endpoint (called by the
        // client-side cap check), the inline server guardrail, and the cron sweeper —
        // and they used to disagree. A plain stop wrote auto_stopped=false with no
        // stop_reason, which scores 28 risk points lower than the identical
        // server-stopped entry, so whether a capped session was flagged came down to
        // which enforcer won the race. Delegating a reasoned stop to the same service
        // the other two use makes the outcome identical regardless of who wins.
        const requestedReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        if (CLIENT_STOPPABLE_REASONS.includes(requestedReason as ClientStopReason)) {
            const stopped = await stopActiveTimerWithReason({
                userId: user_id,
                reason: requestedReason as ClientStopReason,
                triggeredAt: new Date(),
                organizationId: req.user!.organization_id,
            });

            if (!stopped) {
                res.status(404).json({ message: 'No active timer found' });
                return;
            }

            emitWebhookEvent('timer.stopped', {
                time_entry_id: stopped.id,
                user_id,
                duration: stopped.duration,
                project_id: stopped.project_id,
                auto_stopped: true,
                stop_reason: requestedReason,
            }, { organizationId: req.user!.organization_id }).catch(() => {});

            res.status(200).json({ timeEntry: stopped, auto_stopped: true, stop_reason: requestedReason });
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
        const overDailyCap = persistedState.over_daily_cap === true;
        const overtimeReason = typeof persistedState.overtime_reason === 'string'
            ? persistedState.overtime_reason
            : null;

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
                    over_daily_cap: overDailyCap,
                    overtime_reason: overtimeReason,
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
        }, { organizationId: req.user!.organization_id }).catch(() => {});
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
        const tag_ids = normalizeIdList(req.body?.tag_ids);

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

        // Clash check. This path was previously unguarded, and it is also where the
        // Workday "recovered suggestions" copilot writes, so it was the easiest way to
        // double-book a slot that a timer had already recorded.
        if (await rejectIfOverlapping(req, res, { userId: user_id, start, end })) return;

        // Daily cap. Evaluated on the entry's own day, not today, so backdated manual
        // entries cannot quietly push a past day over the limit.
        const capGate = await gateDailyCap(req, res, {
            userId: user_id,
            at: start,
            additionalSeconds: duration,
        });
        if (!capGate) return;

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

        const resolvedProjectId = typeof project_id === 'string' && project_id.trim() ? project_id.trim() : null;
        await assertProjectBelongsToOrganization(resolvedProjectId, req.user!.organization_id);
        await assertTagsBelongToOrganization(tag_ids, req.user!.organization_id);

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
                    project_id: resolvedProjectId,
                    task_description: task_description.trim(),
                    start_time: effectiveStart,
                    end_time: effectiveEnd,
                    duration: effectiveDuration,
                    entry_type: 'manual',
                    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
                    is_billable,
                    over_daily_cap: Boolean(capGate.ack),
                    overtime_reason: capGate.ack?.reason ?? null,
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
        if (sendTenantOwnershipError(res, error)) return;
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

        // Widened from the original check, which only looked at APPROVED entries and
        // never at other correction requests — so two overlapping PENDING requests
        // could both be filed and both approved.
        if (await rejectIfOverlapping(req, res, {
            userId: user_id,
            start: requestedStartTime,
            end: requestedEndTime,
        })) return;

        const requestedDurationSeconds = Math.floor((requestedEndTime.getTime() - requestedStartTime.getTime()) / 1000);

        // Recovered time is the least-evidenced way to add hours, so it carries a
        // weekly allowance with escalating friction rather than a flat block.
        const policy = await getGlobalTimerPolicy();
        const requester = await prisma.user.findFirst({
            where: { id: user_id, organization_id: req.user!.organization_id },
            select: { id: true, timezone: true, employment_type: true },
        });

        if (!requester) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const recoveryUsage = await getWeeklyRecoveryUsage({
            user: requester,
            organizationId: req.user!.organization_id,
            policy,
        });

        try {
            assertRecoveryAllowed(recoveryUsage, {
                reason,
                acknowledgedPolicy: req.body?.acknowledged_policy,
            });
        } catch (error) {
            if (error instanceof RecoveryQuotaError) {
                res.status(error.status).json(recoveryQuotaBody(error.usage, error.message));
                return;
            }
            throw error;
        }

        // A correction adds time to the day it covers, so it is capped like any other write.
        const capGate = await gateDailyCap(req, res, {
            userId: user_id,
            at: requestedStartTime,
            additionalSeconds: requestedDurationSeconds,
        });
        if (!capGate) return;

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
                    recovery_used: recoveryUsage.used + 1,
                    recovery_limit: recoveryUsage.limit,
                    recovery_tier: recoveryUsage.tier,
                    over_daily_cap: Boolean(capGate.ack),
                },
            },
        });

        try {
            const windowStartLabel = requestedStartTime.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            });
            const windowEndLabel = requestedEndTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            });
            await prisma.notification.create({
                data: {
                    user_id,
                    organization_id: req.user!.organization_id,
                    message: `Your time correction request for ${windowStartLabel}–${windowEndLabel} was submitted and is pending approval.`,
                    type: 'correction_request_submitted',
                },
            });

            // Alert reviewers so pending requests are seen without polling the
            // Admin → Corrections tab (mirrors the leave-request flow).
            const requester = await prisma.user.findUnique({
                where: { id: user_id },
                select: { first_name: true, last_name: true, email: true },
            });
            const requesterLabel = requester
                ? `${requester.first_name} ${requester.last_name}`.trim() || requester.email
                : 'A team member';
            const reviewers = await prisma.user.findMany({
                where: {
                    organization_id: req.user!.organization_id,
                    is_active: true,
                    id: { not: user_id },
                    role: { name: { in: ['Admin', 'Manager'] } },
                },
                select: { id: true },
            });
            if (reviewers.length > 0) {
                await prisma.notification.createMany({
                    data: reviewers.map((reviewer) => ({
                        user_id: reviewer.id,
                        organization_id: req.user!.organization_id,
                        message: `${requesterLabel} submitted a time correction request for ${windowStartLabel}–${windowEndLabel} — pending review.`,
                        type: 'correction_request_review',
                    })),
                    skipDuplicates: true,
                });
            }
        } catch (notificationError) {
            console.error('Failed to create correction request notification:', notificationError);
        }

        res.status(201).json({
            correction,
            recovery_usage: serializeRecoveryUsage({
                ...recoveryUsage,
                used: recoveryUsage.used + 1,
                remaining: Math.max(recoveryUsage.limit - (recoveryUsage.used + 1), 0),
            }),
        });
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
        const status = typeof req.query.status === 'string' ? req.query.status : 'all';
        const lookbackDays = Number.parseInt(String(req.query.lookbackDays ?? ''), 10);
        const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? ''), 10) || 200, 1), 500);
        const offset = Math.max(Number.parseInt(String(req.query.offset ?? ''), 10) || 0, 0);

        const corrections = await getCorrectionRequestsForReviewService({
            organizationId: req.user!.organization_id,
            status,
            lookbackDays: Number.isFinite(lookbackDays) && lookbackDays > 0 ? lookbackDays : undefined,
            limit,
            offset,
        });

        res.status(200).json({ corrections });
    } catch (error) {
        console.error('Failed to list correction requests for review:', error);
        res.status(500).json({ message: 'Internal server error while loading correction requests' });
    }
};

export const purgeResolvedCorrectionsController = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const deleted = await purgeResolvedCorrections(req.user!.organization_id, env.correctionRetentionDays);
        res.status(200).json({ deleted });
    } catch (error) {
        console.error('Failed to purge resolved corrections:', error);
        res.status(500).json({ message: 'Internal server error while purging resolved corrections' });
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
                // Re-check inside the transaction: the timeline can have changed
                // between filing and review. Other PENDING corrections are excluded —
                // they are not real time yet, and the one being approved must not be
                // compared against itself.
                const conflicts = await findOverlaps({
                    client: tx,
                    organizationId: req.user!.organization_id,
                    userId: correction.user_id,
                    start: correction.requested_start_time,
                    end: correction.requested_end_time,
                    includeCorrections: false,
                });

                if (conflicts.length > 0) {
                    throw new TimeOverlapError(conflicts);
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
        // Typed error rather than sniffing the message string for "overlaps".
        if (error instanceof TimeOverlapError) {
            res.status(409).json(overlapConflictBody(error.conflicts));
            return;
        }
        console.error('Failed to review correction request:', error);
        res.status(500).json({ message: 'Internal server error while reviewing correction request' });
    }
};

/**
 * Lean active-timer lookup for the client heartbeat poller.
 *
 * The poller runs every ACTIVE_TIMER_REFRESH_MS for every user with the app open, and
 * reads nothing but `activeTimer`. Serving it from `/me` meant shipping 50 fully
 * hydrated time entries — each joined to its project and tags — plus a COUNT over the
 * user's whole history out of the database every two minutes, then discarding all of it
 * client-side. That was the single largest source of database egress, and the constant
 * traffic also kept the compute from ever idling long enough to auto-suspend.
 *
 * Guardrail enforcement is intentionally retained: the poll is what drives server-side
 * auto-pause/auto-stop, so dropping it here would silently break idle handling.
 */
export const getActiveTimer = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const where = { user_id, organization_id: req.user!.organization_id };
        const include = { project: { select: { id: true, name: true } } };

        let activeTimer = await prisma.activeTimer.findFirst({ where, include });

        if (activeTimer) {
            const guardrailResult = await enforceTimerGuardrails({
                timer: activeTimer,
                now: new Date(),
                organizationId: req.user!.organization_id,
            });

            if (guardrailResult !== 'none') {
                activeTimer = await prisma.activeTimer.findFirst({ where, include });
            }
        }

        res.status(200).json({ activeTimer });
    } catch (error) {
        console.error('Failed to fetch active timer:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Parses the optional ?from / ?to window on GET /timers/me.
 *
 * Returns null when neither is supplied (the historical behaviour), 'invalid' when the
 * pair is unusable. Both are required together: a half-open window would silently
 * return a different set than the caller asked for.
 */
const parseEntryWindow = (
    rawFrom: unknown,
    rawTo: unknown,
): { from: Date; to: Date } | null | 'invalid' => {
    if (rawFrom === undefined && rawTo === undefined) return null;
    if (typeof rawFrom !== 'string' || typeof rawTo !== 'string') return 'invalid';

    const from = new Date(rawFrom);
    const to = new Date(rawTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return 'invalid';

    return { from, to };
};

/**
 * approved / rejected / pending seconds plus the total logged.
 *
 * `total_seconds` is deliberately the sum of every row, not approved + rejected +
 * pending, so an unexpected status value can never make hours disappear from the
 * screen — it shows up as the gap between the parts and the total instead.
 */
const summariseByStatus = (rows: { status: string; duration: number }[]) => {
    let approved = 0;
    let rejected = 0;
    let pending = 0;
    let totalLogged = 0;

    for (const row of rows) {
        const seconds = row.duration ?? 0;
        totalLogged += seconds;
        if (row.status === 'approved') approved += seconds;
        else if (row.status === 'rejected') rejected += seconds;
        else if (row.status === 'pending') pending += seconds;
    }

    return {
        approved_seconds: approved,
        rejected_seconds: rejected,
        pending_seconds: pending,
        total_seconds: totalLogged,
    };
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

        // Optional window, purely additive: every existing caller (Dashboard, Timeline,
        // Timer, Layout, Workday) omits it and gets exactly the response it got before,
        // including no `totals` block — so none of them pays for an aggregate they do
        // not read. /timesheet passes the week it is displaying.
        const window = parseEntryWindow(req.query.from, req.query.to);
        if (window === 'invalid') {
            res.status(400).json({ message: 'from and to must be ISO-8601 timestamps, with from before to.' });
            return;
        }

        const where: Prisma.TimeEntryWhereInput = {
            organization_id: req.user!.organization_id,
            user_id,
            ...(window ? { start_time: { gte: window.from, lt: window.to } } : {}),
        };

        const [entries, total] = await Promise.all([
            prisma.timeEntry.findMany({
                where,
                orderBy: { start_time: 'desc' },
                include: {
                    project: { select: { id: true, name: true } },
                    tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
                },
                skip,
                take: limit,
            }),
            prisma.timeEntry.count({ where }),
        ]);

        // The approved/rejected/pending split, computed here so the UI cannot re-derive
        // it differently — the whole incident behind this feature was a screen doing its
        // own arithmetic over a set it had not filtered by status. Computed over the
        // WHOLE window rather than the current page, so the header stays truthful even
        // if the row list is truncated by `limit`.
        const totals = window
            ? summariseByStatus(await prisma.timeEntry.findMany({ where, select: { status: true, duration: true } }))
            : undefined;

        res.status(200).json({
            entries: entries.map(withRejectionLabel),
            activeTimer,
            ...(totals ? { totals: { from: window!.from.toISOString(), to: window!.to.toISOString(), ...totals } } : {}),
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

        // Daily-cap usage, so the client can raise the soft nudge or the hard
        // attestation modal without polling a second endpoint.
        //
        // Cost note: the database is billed by compute hour and this endpoint runs
        // every few minutes for every user with the app open, so the completed-seconds
        // aggregate is served from a short-lived cache carried inside heartbeat_state —
        // a blob this handler already rewrites on every call. No extra column, no extra
        // write, and at most one aggregate per user per few heartbeats.
        const capUser = await prisma.user.findFirst({
            where: { id: user_id, organization_id: req.user!.organization_id },
            select: { id: true, timezone: true, employment_type: true },
        });

        const dailyUsage = capUser
            ? await getDailyUsage({
                user: capUser,
                organizationId: req.user!.organization_id,
                policy,
                at: requestReceivedAt,
                activeTimer,
                useCache: true,
            })
            : null;

        const heartbeatState: Prisma.InputJsonObject = {
            ...(activeTimer.heartbeat_state as Record<string, unknown> || {}),
            last_activity_at: validLastClientActivityAt?.toISOString() ?? null,
            visibility_state: visibilityState,
            has_focus: hasFocus,
            browser_activity_state: browserActivityState,
            active_timer_id: activeTimer.id,
            received_at: requestReceivedAt.toISOString(),
        };

        await prisma.activeTimer.update({
            where: { id: activeTimer.id },
            data: {
                last_active_ping: requestReceivedAt,
                last_heartbeat_at: requestReceivedAt,
                last_client_activity_at: validLastClientActivityAt,
                client_visibility: visibilityState,
                client_has_focus: hasFocus,
                heartbeat_state: dailyUsage
                    ? withDayCache(
                        heartbeatState,
                        dailyUsage.localDate,
                        dailyUsage.completedSeconds,
                        requestReceivedAt,
                    )
                    : heartbeatState,
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
            // Advisory only — the ping never refuses. The client renders the nudge or
            // the attestation modal; the write endpoints are what actually enforce.
            daily: dailyUsage
                ? {
                    workedSeconds: dailyUsage.workedSeconds,
                    capSeconds: dailyUsage.capSeconds,
                    floorSeconds: dailyUsage.floorSeconds,
                    remainingSeconds: dailyUsage.remainingSeconds,
                    state: dailyUsage.state,
                    localDate: dailyUsage.localDate,
                }
                : null,
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
            const payload = verifyToken<{ userId: string; type?: string }>(rawToken);
            if (payload.type && payload.type !== 'access') throw new Error('Only access tokens are accepted for beacon');
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

/**
 * Attaches the human label for a stored rejection code.
 *
 * The label is resolved server-side so the frontend never needs its own copy of the
 * taxonomy — see the header of constants/rejectionReasons.ts for why there is exactly
 * one list. A historical rejection with no code resolves to null, which every UI
 * renders as "No reason recorded" rather than blank.
 */
const withRejectionLabel = <T extends { rejection_reason_code: string | null }>(entry: T) => ({
    ...entry,
    rejection_reason_label: rejectionReasonLabel(entry.rejection_reason_code),
});

/**
 * The reason taxonomy, for the manager's reject picker.
 *
 * Authenticated but not role-gated: the codes are not sensitive, and an employee
 * screen may want to explain what a code on their own entry means.
 */
export const listRejectionReasons = async (_req: AuthRequest, res: Response): Promise<void> => {
    res.status(200).json({
        reasons: REJECTION_REASONS.map((reason) => ({
            code: reason.code,
            label: reason.label,
            requires_note: reasonRequiresNote(reason.code),
        })),
        note_max_length: REJECTION_NOTE_MAX_LENGTH,
    });
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

        // A rejection with no recorded reason is the defect this endpoint exists to fix,
        // so the check runs before anything is read or written. Same rule, same helper,
        // on all three write paths that can set status = 'rejected'.
        let rejection: { rejection_reason_code: string; rejection_reason_note: string | null } | null = null;
        if (action === 'reject') {
            const validated = validateRejectionReason(req.body?.rejection_reason_code, req.body?.rejection_reason_note);
            if (!validated.ok) {
                res.status(validated.error.status).json({ message: validated.error.message });
                return;
            }
            rejection = validated.value;
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
                data: {
                    status: statusMap[action as keyof typeof statusMap],
                    // On approve these are null, which clears any earlier rejection: an
                    // approved entry still carrying "description too vague" would be
                    // telling its owner something that is no longer true.
                    rejection_reason_code: rejection?.rejection_reason_code ?? null,
                    rejection_reason_note: rejection?.rejection_reason_note ?? null,
                    reviewed_by: reviewerId,
                    reviewed_at: new Date(),
                },
            });

            await tx.notification.create({
                data: {
                    user_id: updated.user_id,
                    organization_id: req.user!.organization_id,
                    message: rejection
                        ? `Your timesheet for ${updated.task_description} was rejected: ${rejectionReasonLabel(rejection.rejection_reason_code)}. Rejected hours do not count toward your weekly minimum.`
                        : `Your timesheet for ${updated.task_description} was ${statusMap[action as keyof typeof statusMap]} by your manager.`,
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
                        rejection_reason_code: rejection?.rejection_reason_code ?? null,
                    },
                },
            });
        } catch (error) {
            console.error('Failed to write timesheet review audit log:', error);
        }

        // After the commit, and it swallows its own failures: SES being unreachable must
        // not undo a rejection the manager has already made.
        if (rejection) {
            await dispatchRejectionNotices({
                organizationId: req.user!.organization_id,
                entries: [{
                    id: updatedEntry.id,
                    user_id: updatedEntry.user_id,
                    task_description: updatedEntry.task_description,
                    start_time: updatedEntry.start_time,
                    duration: updatedEntry.duration,
                    rejection_reason_code: updatedEntry.rejection_reason_code,
                    rejection_reason_note: updatedEntry.rejection_reason_note,
                }],
            });
        }

        res.status(200).json(withRejectionLabel(updatedEntry));
    } catch (error) {
        console.error('Failed to review timesheet:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Bulk approve/reject for the manager approval queue.
 *
 * Deliberately a separate endpoint rather than an extra action on `PATCH /timers/bulk`:
 * that one also serves employees editing their own entries, keeps its role guard in the
 * controller body, sends no notifications, and does not filter to pending — so it can
 * silently re-flip an entry that was already resolved. This mirrors `reviewTimesheet`
 * instead, one row at a time semantics applied to a set.
 */
export const reviewTimesheetsBulk = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const reviewerId = requireUserId(req);
        const action = req.body?.action;
        const rawIds = req.body?.entry_ids;

        if (!['approve', 'reject'].includes(action)) {
            res.status(400).json({ message: 'Invalid action. Must be approve or reject.' });
            return;
        }

        if (!Array.isArray(rawIds) || rawIds.length === 0) {
            res.status(400).json({ message: 'entry_ids must be a non-empty array.' });
            return;
        }

        // Bulk rejection is not exempt from needing a reason — it is the path most
        // likely to produce a wall of unexplained rejections. One reason is applied to
        // the whole selection rather than blocking bulk review, which is the trade the
        // brief asked for: a manager clearing "all of these are missing a project"
        // should not have to click through twenty identical pickers.
        let rejection: { rejection_reason_code: string; rejection_reason_note: string | null } | null = null;
        if (action === 'reject') {
            const validated = validateRejectionReason(req.body?.rejection_reason_code, req.body?.rejection_reason_note);
            if (!validated.ok) {
                res.status(validated.error.status).json({ message: validated.error.message });
                return;
            }
            rejection = validated.value;
        }

        // Same ceiling as bulkUpdateEntries, so one request cannot lock a large table
        // range or blow the serverless function's time budget.
        const entryIds = Array.from(new Set(rawIds.filter((id: unknown): id is string => typeof id === 'string')));
        if (entryIds.length > BULK_REVIEW_LIMIT) {
            res.status(400).json({ message: `Bulk review is limited to ${BULK_REVIEW_LIMIT} entries at once.` });
            return;
        }

        const nextStatus = action === 'approve' ? 'approved' : 'rejected';

        const entries = await prisma.timeEntry.findMany({
            where: { id: { in: entryIds }, organization_id: req.user!.organization_id },
            select: { id: true, user_id: true, task_description: true, start_time: true, duration: true, status: true },
        });

        const foundIds = new Set(entries.map((entry) => entry.id));
        const notFound = entryIds.filter((id) => !foundIds.has(id));
        const pending = entries.filter((entry) => entry.status === 'pending');
        const skippedNotPending = entries.filter((entry) => entry.status !== 'pending').map((entry) => entry.id);

        // Payroll-lock check per entry, matching bulkUpdateEntries. A locked entry is
        // skipped and reported rather than failing the whole batch.
        const skippedLocked: string[] = [];
        const editable: typeof pending = [];
        for (const entry of pending) {
            try {
                await assertPeriodNotLocked(req.user!.organization_id, entry.start_time);
                editable.push(entry);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'PERIOD_LOCKED') {
                    skippedLocked.push(entry.id);
                    continue;
                }
                throw error;
            }
        }

        if (editable.length === 0) {
            res.status(skippedLocked.length > 0 ? 423 : 400).json({
                updated: 0,
                skipped_locked: skippedLocked,
                skipped_not_pending: skippedNotPending,
                not_found: notFound,
                message: skippedLocked.length > 0
                    ? 'Every selected entry is inside a locked payroll period.'
                    : 'No pending entries were selected.',
            });
            return;
        }

        const editableIds = editable.map((entry) => entry.id);

        const updated = await prisma.$transaction(async (tx) => {
            const result = await tx.timeEntry.updateMany({
                // org_id repeated here to close the TOCTOU window with the read above.
                where: { id: { in: editableIds }, organization_id: req.user!.organization_id, status: 'pending' },
                data: {
                    status: nextStatus,
                    // Null on approve, which clears any reason a previous rejection left behind.
                    rejection_reason_code: rejection?.rejection_reason_code ?? null,
                    rejection_reason_note: rejection?.rejection_reason_note ?? null,
                    reviewed_by: reviewerId,
                    reviewed_at: new Date(),
                },
            });

            // One notification per affected user per entry, matching what single-entry
            // review sends. The existing PATCH /timers/bulk path sends none, which is
            // why people never heard about bulk-approved timesheets.
            await tx.notification.createMany({
                data: editable.map((entry) => ({
                    user_id: entry.user_id,
                    organization_id: req.user!.organization_id,
                    message: rejection
                        ? `Your timesheet for ${entry.task_description} was rejected: ${rejectionReasonLabel(rejection.rejection_reason_code)}. Rejected hours do not count toward your weekly minimum.`
                        : `Your timesheet for ${entry.task_description} was ${nextStatus} by your manager.`,
                    type: 'approval_status',
                })),
            });

            return result.count;
        });

        try {
            await prisma.auditLog.create({
                data: {
                    user_id: reviewerId,
                    organization_id: req.user!.organization_id,
                    action: action === 'approve' ? 'bulk_approve' : 'bulk_reject',
                    resource: 'time_entry',
                    metadata: {
                        entry_ids: editableIds,
                        updated_count: updated,
                        skipped_locked: skippedLocked,
                        skipped_not_pending: skippedNotPending,
                        rejection_reason_code: rejection?.rejection_reason_code ?? null,
                    },
                },
            });
        } catch (error) {
            console.error('Failed to write bulk timesheet review audit log:', error);
        }

        // One email per affected person covering everything this action rejected —
        // never one per entry. Twenty emails is a mailbox flood, and a filtered
        // rejection notice is the same as no rejection notice.
        if (rejection) {
            await dispatchRejectionNotices({
                organizationId: req.user!.organization_id,
                entries: editable.map((entry) => ({
                    id: entry.id,
                    user_id: entry.user_id,
                    task_description: entry.task_description,
                    start_time: entry.start_time,
                    duration: entry.duration,
                    rejection_reason_code: rejection!.rejection_reason_code,
                    rejection_reason_note: rejection!.rejection_reason_note,
                })),
            });
        }

        res.status(200).json({
            updated,
            skipped_locked: skippedLocked,
            skipped_not_pending: skippedNotPending,
            not_found: notFound,
            message: `${updated} ${updated === 1 ? 'entry' : 'entries'} ${nextStatus}.`,
        });
    } catch (error) {
        console.error('Failed to bulk review timesheets:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Where the caller stands against their daily limits right now.
 *
 * Separate from the `daily` block on the heartbeat response because that one only
 * exists while a timer is running, whereas the daily-goal bar on /timer and
 * /dashboard has to render whether or not the user is currently tracking. Not on the
 * poll path, so it queries directly rather than using the heartbeat cache.
 */
export const getDailyUsageSummary = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const user = await prisma.user.findFirst({
            where: { id: user_id, organization_id: req.user!.organization_id },
            select: { id: true, timezone: true, employment_type: true },
        });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const policy = await getGlobalTimerPolicy();
        const activeTimer = await prisma.activeTimer.findFirst({
            where: { user_id, organization_id: req.user!.organization_id },
        });

        const usage = await getDailyUsage({
            user,
            organizationId: req.user!.organization_id,
            policy,
            activeTimer,
        });

        res.status(200).json({
            daily: {
                workedSeconds: usage.workedSeconds,
                capSeconds: usage.capSeconds,
                floorSeconds: usage.floorSeconds,
                remainingSeconds: usage.remainingSeconds,
                state: usage.state,
                localDate: usage.localDate,
            },
        });
    } catch (error) {
        console.error('Failed to load daily usage:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Current weekly recovery allowance, so the correction form can show the user where
 * they stand *before* they fill it in rather than rejecting them on submit.
 */
export const getRecoveryQuota = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const user = await prisma.user.findFirst({
            where: { id: user_id, organization_id: req.user!.organization_id },
            select: { id: true, timezone: true },
        });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        const policy = await getGlobalTimerPolicy();
        const usage = await getWeeklyRecoveryUsage({
            user,
            organizationId: req.user!.organization_id,
            policy,
        });

        res.status(200).json({ recovery_usage: serializeRecoveryUsage(usage) });
    } catch (error) {
        console.error('Failed to load recovery quota:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Acknowledge an auto-stopped entry ("looks right"), dismissing its review card.
 * Only the entry's owner can acknowledge — a manager confirming on someone's behalf
 * would defeat the point of asking the person who was actually there.
 */
export const acknowledgeAutoStop = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user_id = requireUserId(req);
        const entryId = req.params.id as string;

        const entry = await prisma.timeEntry.findFirst({
            where: { id: entryId, organization_id: req.user!.organization_id, user_id },
        });

        if (!entry) {
            res.status(404).json({ message: 'Time entry not found' });
            return;
        }

        if (!entry.auto_stopped) {
            res.status(400).json({ message: 'This entry was not stopped automatically.' });
            return;
        }

        const updated = await prisma.timeEntry.update({
            where: { id: entry.id, organization_id: req.user!.organization_id },
            data: { auto_stop_reviewed_at: new Date() },
        });

        try {
            await prisma.auditLog.create({
                data: {
                    user_id,
                    organization_id: req.user!.organization_id,
                    action: 'auto_stop_acknowledged',
                    resource: 'time_entry',
                    metadata: { entry_id: entry.id, stop_reason: entry.stop_reason },
                },
            });
        } catch (error) {
            console.error('Failed to write auto-stop acknowledgement audit log:', error);
        }

        res.status(200).json(updated);
    } catch (error) {
        console.error('Failed to acknowledge auto-stop:', error);
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
        const normalizedProjectId = typeof project_id === 'string' && project_id.trim() ? project_id.trim() : null;
        const normalizedTagIds = normalizeIdList(tag_ids);

        if (typeof task_description === 'string' && task_description.trim()) data.task_description = task_description.trim();
        if (project_id !== undefined) {
            await assertProjectBelongsToOrganization(normalizedProjectId, req.user!.organization_id);
            data.project_id = normalizedProjectId;
        }
        if (Array.isArray(tag_ids)) {
            await assertTagsBelongToOrganization(normalizedTagIds, req.user!.organization_id);
        }
        if (typeof notes === 'string') data.notes = notes.trim() || null;
        if (typeof is_billable === 'boolean') data.is_billable = is_billable;

        if (start_time && end_time) {
            const s = new Date(start_time);
            const e = new Date(end_time);
            const dur = Math.floor((e.getTime() - s.getTime()) / 1000);
            if (dur > 0) {
                // Moving or lengthening an entry can collide with another one, and can
                // push the day past the cap. Both were previously unchecked here.
                if (await rejectIfOverlapping(req, res, {
                    userId: entry.user_id,
                    start: s,
                    end: e,
                    excludeEntryId: entry.id,
                })) return;

                if (dur > entry.duration) {
                    const capGate = await gateDailyCap(req, res, {
                        userId: entry.user_id,
                        at: s,
                        additionalSeconds: dur,
                        excludeEntryId: entry.id,
                    });
                    if (!capGate) return;

                    if (capGate.ack) {
                        data.over_daily_cap = true;
                        data.overtime_reason = capGate.ack.reason;
                    }
                }

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
                if (normalizedTagIds.length > 0) {
                    await tx.timeEntryTag.createMany({
                        data: normalizedTagIds.map((tag_id: string) => ({ time_entry_id: entryId, tag_id })),
                        skipDuplicates: true,
                    });
                }
            }

            return result;
        });

        res.status(200).json(updated);
    } catch (error) {
        if (sendTenantOwnershipError(res, error)) return;
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

        // Duplicating drops a copy at 09:00 today, which very often lands on top of
        // whatever the user actually tracked this morning.
        if (await rejectIfOverlapping(req, res, {
            userId: user_id,
            start: startOfDay,
            end: endTime,
        })) return;

        const capGate = await gateDailyCap(req, res, {
            userId: user_id,
            at: startOfDay,
            additionalSeconds: entry.duration,
        });
        if (!capGate) return;

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
                    over_daily_cap: Boolean(capGate.ack),
                    overtime_reason: capGate.ack?.reason ?? null,
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
        const normalizedProjectId = typeof project_id === 'string' && project_id.trim() ? project_id.trim() : null;
        const normalizedTagIds = normalizeIdList(tag_ids);

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

        // The third write path that can set status = 'rejected'. It is a generic bulk
        // editor rather than the approval queue, but leaving it exempt would leave an
        // open door to unexplained rejections, so the same rule applies here.
        let rejection: { rejection_reason_code: string; rejection_reason_note: string | null } | null = null;
        if (action === 'reject') {
            const validated = validateRejectionReason(req.body?.rejection_reason_code, req.body?.rejection_reason_note);
            if (!validated.ok) {
                res.status(validated.error.status).json({ message: validated.error.message });
                return;
            }
            rejection = validated.value;
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

        if (action === 'set_project') {
            await assertProjectBelongsToOrganization(normalizedProjectId, orgId);
        }

        if (action === 'set_tags') {
            if (!Array.isArray(tag_ids)) {
                res.status(400).json({ message: 'tag_ids must be an array.' });
                return;
            }
            await assertTagsBelongToOrganization(normalizedTagIds, orgId);
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
                    data: {
                        status: action === 'approve' ? 'approved' : 'rejected',
                        // Null on approve, clearing any earlier rejection reason.
                        rejection_reason_code: rejection?.rejection_reason_code ?? null,
                        rejection_reason_note: rejection?.rejection_reason_note ?? null,
                        reviewed_by: user_id,
                        reviewed_at: new Date(),
                    },
                });
                updatedCount = result.count;
            } else if (action === 'set_project') {
                const result = await tx.timeEntry.updateMany({
                    where: { id: { in: editableIds }, organization_id: orgId },
                    data: { project_id: normalizedProjectId },
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
                // Remove existing tags and set new ones for each entry
                await tx.timeEntryTag.deleteMany({ where: { time_entry_id: { in: editableIds } } });
                if (normalizedTagIds.length > 0) {
                    const links = editableIds.flatMap((eid) =>
                        normalizedTagIds.map((tid) => ({ time_entry_id: eid, tag_id: tid })),
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
                        rejection_reason_code: rejection?.rejection_reason_code ?? null,
                    },
                },
            });
        } catch (e) {
            console.error('[bulkUpdateEntries] audit log failed:', e);
        }

        // Batched per reviewer action, after the commit, failures swallowed — same
        // contract as the approval-queue paths.
        if (rejection) {
            await dispatchRejectionNotices({
                organizationId: orgId,
                entries: filtered
                    .filter((entry) => editableIds.includes(entry.id))
                    .map((entry) => ({
                        id: entry.id,
                        user_id: entry.user_id,
                        task_description: entry.task_description,
                        start_time: entry.start_time,
                        duration: entry.duration,
                        rejection_reason_code: rejection!.rejection_reason_code,
                        rejection_reason_note: rejection!.rejection_reason_note,
                    })),
            });
        }

        res.status(200).json({
            updated: updatedCount,
            skipped_locked: [...lockedIds],
            message: lockedIds.size > 0
                ? `${updatedCount} entries updated; ${lockedIds.size} skipped (locked payroll period).`
                : `${updatedCount} entries updated.`,
        });
    } catch (error) {
        if (sendTenantOwnershipError(res, error)) return;
        const msg = error instanceof Error ? error.message : 'Internal server error';
        console.error('Failed bulk update:', error);
        res.status(500).json({ message: msg });
    }
};
