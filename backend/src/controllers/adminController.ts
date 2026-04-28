import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { getGlobalTimerPolicy, normalizeTimerPolicy, validateTimerPolicy } from '../services/timerPolicyService';

type AdminAuditFeedEntry = {
    id: string;
    source: 'audit' | 'auth';
    action: string;
    resource: string;
    created_at: Date;
    user: {
        email: string | null;
        first_name: string | null;
        last_name: string | null;
    } | null;
    email: string | null;
    outcome?: string | null;
    reason?: string | null;
    metadata?: unknown;
};

export const getAuditLogs = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const [auditLogs, authEvents] = await Promise.all([
            prisma.auditLog.findMany({
                orderBy: { created_at: 'desc' },
                take: 100,
                include: {
                    user: { select: { email: true, first_name: true, last_name: true } }
                }
            }),
            prisma.authEvent.findMany({
                orderBy: { created_at: 'desc' },
                take: 100,
                include: {
                    user: { select: { email: true, first_name: true, last_name: true } }
                }
            }),
        ]);

        const logs: AdminAuditFeedEntry[] = [
            ...auditLogs.map((log) => ({
                id: log.id,
                source: 'audit' as const,
                action: log.action,
                resource: log.resource,
                created_at: log.created_at,
                user: log.user,
                email: log.user.email,
                metadata: log.metadata,
            })),
            ...authEvents.map((event) => ({
                id: event.id,
                source: 'auth' as const,
                action: event.event_type,
                resource: 'authentication',
                created_at: event.created_at,
                user: event.user,
                email: event.email ?? event.user?.email ?? null,
                outcome: event.outcome,
                reason: event.reason,
                metadata: event.metadata,
            })),
        ]
            .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
            .slice(0, 100);

        res.status(200).json({ logs });
    } catch (error) {
        console.error('Failed to get audit logs:', error);
        res.status(500).json({ message: 'Internal server error while loading audit logs' });
    }
};

export const getSystemNotifications = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { deleted_at: null },
            orderBy: { created_at: 'desc' },
            take: 100,
            include: {
                user: { select: { email: true, first_name: true, last_name: true } }
            }
        });

        res.status(200).json({ notifications });
    } catch (error) {
        console.error('Failed to get system notifications:', error);
        res.status(500).json({ message: 'Internal server error while loading system notifications' });
    }
};

export const deleteSystemNotification = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const notificationId = String(req.params.notificationId);
        const notification = await prisma.notification.findFirst({
            where: {
                id: notificationId,
                deleted_at: null,
            },
        });

        if (!notification) {
            res.status(404).json({ message: 'Notification not found' });
            return;
        }

        await prisma.notification.update({
            where: { id: notification.id },
            data: {
                deleted_at: new Date(),
                is_read: true,
                read_at: notification.read_at ?? new Date(),
            },
        });

        res.status(200).json({ message: 'Notification deleted' });
    } catch (error) {
        console.error('Failed to delete system notification:', error);
        res.status(500).json({ message: 'Internal server error while deleting system notification' });
    }
};

export const getTimerPolicy = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const policy = await getGlobalTimerPolicy();
        res.status(200).json({ policy });
    } catch (error) {
        console.error('Failed to get timer policy:', error);
        res.status(500).json({ message: 'Internal server error while loading timer policy' });
    }
};

export const updateTimerPolicy = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const actorId = req.user?.userId || null;
        const currentPolicy = await getGlobalTimerPolicy();
        const nextPolicy = normalizeTimerPolicy({
            ...currentPolicy,
            ...req.body,
        });
        const errors = validateTimerPolicy(nextPolicy);

        if (errors.length > 0) {
            res.status(400).json({ message: 'Invalid timer policy', errors });
            return;
        }

        const existing = await prisma.timerPolicyConfig.findFirst({
            where: { scope_type: 'GLOBAL', scope_id: null },
        });

        const saved = existing
            ? await prisma.timerPolicyConfig.update({
                where: { id: existing.id },
                data: {
                    heartbeat_interval_seconds: nextPolicy.heartbeatIntervalSeconds,
                    missed_heartbeat_warning_threshold: nextPolicy.missedHeartbeatWarningThreshold,
                    missed_heartbeat_pause_threshold: nextPolicy.missedHeartbeatPauseThreshold,
                    idle_warning_after_minutes: nextPolicy.idleWarningAfterMinutes,
                    idle_pause_after_minutes: nextPolicy.idlePauseAfterMinutes,
                    max_session_duration_hours: nextPolicy.maxSessionDurationHours,
                    allow_resume_after_idle_pause: nextPolicy.allowResumeAfterIdlePause,
                    require_note_on_resume_after_minutes: nextPolicy.requireNoteOnResumeAfterMinutes,
                    updated_by: actorId,
                },
            })
            : await prisma.timerPolicyConfig.create({
                data: {
                    scope_type: 'GLOBAL',
                    scope_id: null,
                    heartbeat_interval_seconds: nextPolicy.heartbeatIntervalSeconds,
                    missed_heartbeat_warning_threshold: nextPolicy.missedHeartbeatWarningThreshold,
                    missed_heartbeat_pause_threshold: nextPolicy.missedHeartbeatPauseThreshold,
                    idle_warning_after_minutes: nextPolicy.idleWarningAfterMinutes,
                    idle_pause_after_minutes: nextPolicy.idlePauseAfterMinutes,
                    max_session_duration_hours: nextPolicy.maxSessionDurationHours,
                    allow_resume_after_idle_pause: nextPolicy.allowResumeAfterIdlePause,
                    require_note_on_resume_after_minutes: nextPolicy.requireNoteOnResumeAfterMinutes,
                    created_by: actorId,
                    updated_by: actorId,
                },
            });

        if (actorId) {
            await prisma.auditLog.create({
                data: {
                    user_id: actorId,
                    action: 'timer_policy_updated',
                    resource: 'timer_policy_config',
                    metadata: {
                        timer_policy_config_id: saved.id,
                        policy: nextPolicy,
                    },
                },
            });
        }

        res.status(200).json({ policy: nextPolicy });
    } catch (error) {
        console.error('Failed to update timer policy:', error);
        res.status(500).json({ message: 'Internal server error while updating timer policy' });
    }
};
