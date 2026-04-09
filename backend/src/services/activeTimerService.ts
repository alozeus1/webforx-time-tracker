import prisma from '../config/db';

type AutoStopReason = 'idle_timeout' | 'heartbeat_missing' | 'browser_inactive';

export const stopActiveTimerWithReason = async ({
    userId,
    reason,
    triggeredAt = new Date(),
}: {
    userId: string;
    reason: AutoStopReason;
    triggeredAt?: Date;
}) => {
    const activeTimer = await prisma.activeTimer.findUnique({ where: { user_id: userId } });
    if (!activeTimer) {
        return null;
    }

    const startTime = new Date(activeTimer.start_time);
    const endTime = triggeredAt > startTime ? triggeredAt : new Date(startTime.getTime() + 1000);
    const duration = Math.max(Math.floor((endTime.getTime() - startTime.getTime()) / 1000), 1);
    const persistedState = (activeTimer.persisted_state as Record<string, unknown>) || {};
    const isBillable = persistedState.is_billable !== false;
    const existingNotes = typeof persistedState.notes === 'string' ? persistedState.notes.trim() : '';
    const reasonNote = `Automatically stopped due to ${reason.replace(/_/g, ' ')}.`;
    const notes = existingNotes ? `${existingNotes}\n\n${reasonNote}` : reasonNote;

    const timeEntry = await prisma.$transaction(async (tx) => {
        const entry = await tx.timeEntry.create({
            data: {
                user_id: userId,
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
            },
        });

        if (Array.isArray(persistedState.tag_ids) && persistedState.tag_ids.length > 0) {
            await tx.timeEntryTag.createMany({
                data: (persistedState.tag_ids as string[]).map((tagId) => ({
                    time_entry_id: entry.id,
                    tag_id: tagId,
                })),
                skipDuplicates: true,
            });
        }

        await tx.activeTimer.delete({ where: { user_id: userId } });

        return entry;
    });

    try {
        await prisma.auditLog.create({
            data: {
                user_id: userId,
                action: 'timer_auto_stopped',
                resource: 'time_entry',
                metadata: {
                    reason,
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
                message: `Your timer for "${activeTimer.task_description}" was stopped automatically because ${reason.replace(/_/g, ' ')} was detected.`,
                type: 'timer_auto_stopped',
            },
        });
    } catch (error) {
        console.error('Failed to create timer auto-stop notification:', error);
    }

    return timeEntry;
};
