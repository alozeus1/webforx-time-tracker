import prisma from '../config/db';
import { getGlobalTimerPolicy } from './timerPolicyService';
import { normalizeIdList } from './tenantOwnershipService';

export type AutoStopReason =
    | 'idle_timeout'
    | 'heartbeat_missing'
    | 'browser_inactive'
    | 'pause_expired'
    | 'active_duration_limit'
    | 'abandoned_timer';

/**
 * Reasons whose recorded end time is clamped back to proven activity.
 *
 * A timer left running on a closed laptop used to be credited in full up to the
 * session cap, even though the last evidence the user was working is the last
 * heartbeat. For these reasons the entry ends at the last heartbeat plus a short
 * grace, so unproven time is never paid.
 *
 * `idle_timeout` and `browser_inactive` are deliberately NOT clamped: those pause
 * first and their paused span is already excluded from the duration.
 */
const CLAMPED_REASONS: AutoStopReason[] = ['active_duration_limit', 'abandoned_timer', 'heartbeat_missing'];

/** Timer sources whose client cannot send heartbeats. */
const BOT_TIMER_SOURCES = new Set(['mattermost', 'slack', 'teams']);

/**
 * True when the timer was started from a chat bot rather than a Timer client.
 *
 * Nothing in Mattermost or Slack can call `/timers/ping`, so these timers never send a
 * heartbeat and never report client activity: `last_heartbeat_at` is the moment the row
 * was created and `last_client_activity_at` stays null forever. Every heartbeat- and
 * idle-driven rule therefore fires on them by construction — in production a
 * `/timer start` was reliably paused ~20 minutes in for `missed_heartbeat_threshold`,
 * after which it accrued nothing and the user only found out when their timesheet was
 * empty.
 *
 * These timers are punch cards: the user proves presence by explicitly starting and
 * stopping. Heartbeat rules do not apply to them. The session cap, the daily cap and
 * the approval queue still do, so an unstopped one is still bounded and still reviewed.
 */
export const isBotStartedTimer = (timer: { persisted_state?: unknown }): boolean => {
    const state = timer.persisted_state;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
    const source = (state as Record<string, unknown>).source;
    return typeof source === 'string' && BOT_TIMER_SOURCES.has(source);
};

export const stopActiveTimerWithReason = async ({
    userId,
    reason,
    triggeredAt = new Date(),
    organizationId,
}: {
    userId: string;
    reason: AutoStopReason;
    triggeredAt?: Date;
    organizationId: string;
}) => {
    const activeTimer = await prisma.activeTimer.findFirst({
        where: { user_id: userId, organization_id: organizationId },
    });
    if (!activeTimer) {
        return null;
    }

    const policy = await getGlobalTimerPolicy();
    const startTime = new Date(activeTimer.start_time);

    let endTime = triggeredAt > startTime ? triggeredAt : new Date(startTime.getTime() + 1000);
    let clampedToHeartbeat = false;

    // A bot timer's "last proof" is the moment it was created, so clamping to it would
    // trim a whole session down to the grace window. Its proof of work is the explicit
    // start/stop command, not a heartbeat.
    if (CLAMPED_REASONS.includes(reason) && !isBotStartedTimer(activeTimer)) {
        const lastProof = activeTimer.last_heartbeat_at
            ?? activeTimer.last_client_activity_at
            ?? activeTimer.last_active_ping;

        if (lastProof) {
            const clampTarget = new Date(
                new Date(lastProof).getTime() + policy.abandonedTimerGraceMinutes * 60_000,
            );
            if (clampTarget < endTime && clampTarget > startTime) {
                endTime = clampTarget;
                clampedToHeartbeat = true;
            }
        }
    }

    const rawDuration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
    const pausedSeconds = activeTimer.paused_duration_seconds ?? 0;
    const duration = Math.max(rawDuration - pausedSeconds, 1);
    const persistedState = (activeTimer.persisted_state as Record<string, unknown>) || {};
    const isBillable = persistedState.is_billable !== false;
    const existingNotes = typeof persistedState.notes === 'string' ? persistedState.notes.trim() : '';
    const reasonNote = clampedToHeartbeat
        ? `Automatically stopped due to ${reason.replace(/_/g, ' ')}. Recorded end time was trimmed back to the last confirmed activity.`
        : `Automatically stopped due to ${reason.replace(/_/g, ' ')}.`;
    const notes = existingNotes ? `${existingNotes}\n\n${reasonNote}` : reasonNote;

    const timeEntry = await prisma.$transaction(async (tx) => {
        const entry = await tx.timeEntry.create({
            data: {
                user_id: userId,
                organization_id: organizationId,
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
                over_daily_cap: persistedState.over_daily_cap === true,
                overtime_reason: typeof persistedState.overtime_reason === 'string'
                    ? persistedState.overtime_reason
                    : null,
            },
        });

        const persistedTagIds = normalizeIdList(persistedState.tag_ids);
        if (persistedTagIds.length > 0) {
            const orgTags = await tx.tag.findMany({
                where: { id: { in: persistedTagIds }, organization_id: organizationId },
                select: { id: true },
            });

            await tx.timeEntryTag.createMany({
                data: orgTags.map(({ id: tagId }) => ({
                    time_entry_id: entry.id,
                    tag_id: tagId,
                })),
                skipDuplicates: true,
            });
        }

        await tx.activeTimer.delete({ where: { id: activeTimer.id } });

        return entry;
    });

    try {
        await prisma.auditLog.create({
            data: {
                user_id: userId,
                organization_id: organizationId,
                action: 'timer_auto_stopped',
                resource: 'time_entry',
                metadata: {
                    reason,
                    clamped_to_heartbeat: clampedToHeartbeat,
                    recorded_end_time: endTime.toISOString(),
                    time_entry_id: timeEntry.id,
                    active_timer_id: activeTimer.id,
                    triggered_at: triggeredAt.toISOString(),
                    last_active_ping: activeTimer.last_active_ping?.toISOString?.() ?? activeTimer.last_active_ping,
                    last_heartbeat_at: activeTimer.last_heartbeat_at?.toISOString?.() ?? activeTimer.last_heartbeat_at,
                    last_client_activity_at: activeTimer.last_client_activity_at?.toISOString?.() ?? activeTimer.last_client_activity_at,
                    client_visibility: activeTimer.client_visibility,
                    client_has_focus: activeTimer.client_has_focus,
                },
            },
        });
    } catch (error) {
        console.error('Failed to write timer auto-stop audit log:', error);
    }

    try {
        await prisma.notification.create({
            data: {
                user_id: userId,
                organization_id: organizationId,
                message: clampedToHeartbeat
                    ? `Your timer for "${activeTimer.task_description}" was stopped automatically and trimmed back to your last confirmed activity. Review it on your timesheet, or request a correction if that is wrong.`
                    : `Your timer for "${activeTimer.task_description}" was stopped automatically because ${reason.replace(/_/g, ' ')} was detected.`,
                type: 'timer_auto_stopped',
            },
        });
    } catch (error) {
        console.error('Failed to create timer auto-stop notification:', error);
    }

    return timeEntry;
};

export const pauseActiveTimer = async (userId: string, organizationId: string, reason: string): Promise<void> => {
    const timer = await prisma.activeTimer.findFirst({
        where: { user_id: userId, organization_id: organizationId },
    });
    if (!timer || timer.is_paused) return;

    await prisma.activeTimer.update({
        where: { id: timer.id },
        data: {
            is_paused: true,
            paused_at: new Date(),
            pause_reason: reason,
        },
    });

    await prisma.notification.create({
        data: {
            user_id: userId,
            organization_id: organizationId,
            message: `Your timer was paused due to inactivity. Resume when you're back — your time is saved.`,
            type: 'timer_paused',
        },
    });

    await prisma.auditLog.create({
        data: {
            user_id: userId,
            organization_id: organizationId,
            action: 'timer_paused',
            resource: 'active_timer',
            metadata: { reason, active_timer_id: timer.id },
        },
    });
};

export const resumeActiveTimer = async (userId: string, organizationId: string): Promise<number> => {
    const timer = await prisma.activeTimer.findFirst({
        where: { user_id: userId, organization_id: organizationId },
    });
    if (!timer || !timer.is_paused || !timer.paused_at) return 0;

    const now = new Date();
    const newPausedSeconds = Math.floor((now.getTime() - timer.paused_at.getTime()) / 1000);
    const totalPausedSeconds = timer.paused_duration_seconds + newPausedSeconds;

    await prisma.activeTimer.update({
        where: { id: timer.id },
        data: {
            is_paused: false,
            paused_at: null,
            pause_reason: null,
            paused_duration_seconds: totalPausedSeconds,
            last_active_ping: now,
            last_heartbeat_at: now,
            last_client_activity_at: now,
            heartbeat_miss_count: 0,
        },
    });

    await prisma.auditLog.create({
        data: {
            user_id: userId,
            organization_id: organizationId,
            action: 'timer_resumed',
            resource: 'active_timer',
            metadata: {
                active_timer_id: timer.id,
                new_paused_seconds: newPausedSeconds,
                total_paused_seconds: totalPausedSeconds,
            },
        },
    });

    return totalPausedSeconds;
};
