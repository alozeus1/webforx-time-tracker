import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { getGlobalTimerPolicy, normalizeTimerPolicy, validateTimerPolicy } from '../services/timerPolicyService';
import { resolvePasswordPolicy } from '../services/passwordPolicyService';
import { EMPLOYMENT_TYPES, resolveEmploymentHours } from '../services/employmentService';

// ---------------------------------------------------------------------------
// GET /admin/org-settings  — returns compliance_mode + time_rounding + password_policy + daily_report_recipient
// PUT /admin/org-settings  — updates compliance_mode, time_rounding, password_policy and/or daily_report_recipient
// ---------------------------------------------------------------------------
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const getOrgSettings = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const orgId = req.user!.organization_id;
        const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
        const settings = (org?.settings as Record<string, unknown>) ?? {};
        res.status(200).json({
            compliance_mode: (settings.compliance_mode as string) ?? 'none',
            time_rounding: (settings.time_rounding as { increment: number; direction: string } | null) ?? null,
            password_policy: resolvePasswordPolicy(settings),
            daily_report_recipient: (settings.daily_report_recipient as string) ?? null,
            employment_hours: resolveEmploymentHours(settings),
        });
    } catch (error) {
        console.error('[admin] getOrgSettings error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateOrgSettings = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const orgId = req.user!.organization_id;
        const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
        const current = (org?.settings as Record<string, unknown>) ?? {};

        const { compliance_mode, time_rounding, password_policy, daily_report_recipient, employment_hours } = req.body ?? {};

        if (
            employment_hours !== undefined
            && employment_hours !== null
            && (typeof employment_hours !== 'object' || Array.isArray(employment_hours))
        ) {
            res.status(400).json({ message: 'employment_hours must be an object.' });
            return;
        }
        if (employment_hours && typeof employment_hours === 'object') {
            for (const type of EMPLOYMENT_TYPES) {
                const raw = (employment_hours as Record<string, unknown>)[type];
                if (raw === undefined || raw === null) continue;
                const n = Number(raw);
                if (!Number.isFinite(n) || n < 0 || n > 168) {
                    res.status(400).json({ message: `employment_hours.${type} must be between 0 and 168.` });
                    return;
                }
            }
        }

        const validModes = ['none', 'dcaa', 'flsa', 'wtd'];
        if (compliance_mode !== undefined && !validModes.includes(compliance_mode)) {
            res.status(400).json({ message: 'compliance_mode must be none, dcaa, flsa, or wtd.' });
            return;
        }

        if (
            daily_report_recipient !== undefined
            && daily_report_recipient !== null
            && (typeof daily_report_recipient !== 'string' || !EMAIL_PATTERN.test(daily_report_recipient.trim()))
        ) {
            res.status(400).json({ message: 'daily_report_recipient must be a valid email address.' });
            return;
        }

        const next: Record<string, unknown> = { ...current };
        if (compliance_mode !== undefined) next.compliance_mode = compliance_mode;
        if (time_rounding !== undefined) {
            if (time_rounding === null) {
                delete next.time_rounding;
            } else {
                const validDirections = ['nearest', 'up', 'down'];
                if (!validDirections.includes(time_rounding?.direction)) {
                    res.status(400).json({ message: 'time_rounding.direction must be nearest, up, or down.' });
                    return;
                }
                next.time_rounding = { increment: Number(time_rounding.increment) || 15, direction: time_rounding.direction };
            }
        }
        if (password_policy !== undefined) {
            if (password_policy === null) {
                delete next.password_policy;
            } else if (typeof password_policy !== 'object' || Array.isArray(password_policy)) {
                res.status(400).json({ message: 'password_policy must be an object.' });
                return;
            } else {
                // resolvePasswordPolicy clamps every field to safe ranges and
                // drops anything unknown/malformed.
                next.password_policy = { ...resolvePasswordPolicy({ password_policy }) };
            }
        }
        if (daily_report_recipient !== undefined) {
            if (daily_report_recipient === null) {
                delete next.daily_report_recipient;
            } else {
                next.daily_report_recipient = daily_report_recipient.trim();
            }
        }
        if (employment_hours !== undefined) {
            if (employment_hours === null) {
                delete next.employment_hours;
            } else {
                // resolveEmploymentHours clamps + fills defaults, dropping unknown keys.
                next.employment_hours = resolveEmploymentHours({ employment_hours });
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await prisma.organization.update({ where: { id: orgId }, data: { settings: next as any } });

        await prisma.auditLog.create({
            data: {
                user_id: req.user!.userId,
                organization_id: orgId,
                action: 'org_settings_updated',
                resource: 'organization',
                metadata: {
                    compliance_mode,
                    time_rounding,
                    password_policy: next.password_policy ?? null,
                    daily_report_recipient: next.daily_report_recipient ?? null,
                },
            },
        });

        res.status(200).json({
            compliance_mode: next.compliance_mode ?? 'none',
            time_rounding: next.time_rounding ?? null,
            password_policy: resolvePasswordPolicy(next),
            daily_report_recipient: (next.daily_report_recipient as string) ?? null,
            employment_hours: resolveEmploymentHours(next),
        });
    } catch (error) {
        console.error('[admin] updateOrgSettings error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

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

export const getAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const [auditLogs, authEvents] = await Promise.all([
            prisma.auditLog.findMany({
                where: { organization_id: req.user!.organization_id },
                orderBy: { created_at: 'desc' },
                take: 100,
                include: {
                    user: { select: { email: true, first_name: true, last_name: true } }
                }
            }),
            prisma.authEvent.findMany({
                where: { organization_id: req.user!.organization_id },
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

export const getSystemNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { deleted_at: null, organization_id: req.user!.organization_id },
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
                organization_id: req.user!.organization_id,
            },
        });

        if (!notification) {
            res.status(404).json({ message: 'Notification not found' });
            return;
        }

        await prisma.notification.update({
            where: { id: notification.id, organization_id: req.user!.organization_id },
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

export const getTeams = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const teams = await prisma.team.findMany({
            where: { organization_id: _req.user!.organization_id },
            orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
        });

        res.status(200).json({ teams });
    } catch (error) {
        console.error('Failed to get teams:', error);
        res.status(500).json({ message: 'Internal server error while loading teams' });
    }
};

export const createTeam = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        const description = typeof req.body?.description === 'string' && req.body.description.trim()
            ? req.body.description.trim()
            : null;

        if (!name) {
            res.status(400).json({ message: 'Team name is required' });
            return;
        }

        const team = await prisma.team.create({
            data: { name: name.slice(0, 80), description, organization_id: req.user!.organization_id },
        });

        if (req.user?.userId) {
            await prisma.auditLog.create({
                data: {
                    user_id: req.user.userId,
                    organization_id: req.user.organization_id,
                    action: 'team_created',
                    resource: 'team',
                    metadata: { team_id: team.id, name: team.name },
                },
            });
        }

        res.status(201).json({ team });
    } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === 'P2002') {
            res.status(409).json({ message: 'A team with this name already exists' });
            return;
        }

        console.error('Failed to create team:', error);
        res.status(500).json({ message: 'Internal server error while creating team' });
    }
};

export const updateTeam = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const teamId = String(req.params.teamId);
        const updateData: { name?: string; description?: string | null; is_active?: boolean } = {};

        if (typeof req.body?.name === 'string' && req.body.name.trim()) {
            updateData.name = req.body.name.trim().slice(0, 80);
        }

        if ('description' in (req.body || {})) {
            updateData.description = typeof req.body.description === 'string' && req.body.description.trim()
                ? req.body.description.trim()
                : null;
        }

        if (typeof req.body?.is_active === 'boolean') {
            updateData.is_active = req.body.is_active;
        }

        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ message: 'No valid team fields provided' });
            return;
        }

        const existingTeam = await prisma.team.findFirst({
            where: { id: teamId, organization_id: req.user!.organization_id },
            select: { id: true },
        });

        if (!existingTeam) {
            res.status(404).json({ message: 'Team not found' });
            return;
        }

        const team = await prisma.team.update({
            where: { id: teamId },
            data: updateData,
        });

        if (req.user?.userId) {
            await prisma.auditLog.create({
                data: {
                    user_id: req.user.userId,
                    organization_id: req.user.organization_id,
                    action: 'team_updated',
                    resource: 'team',
                    metadata: { team_id: team.id, updated_fields: Object.keys(updateData) },
                },
            });
        }

        res.status(200).json({ team });
    } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === 'P2025') {
            res.status(404).json({ message: 'Team not found' });
            return;
        }
        if (code === 'P2002') {
            res.status(409).json({ message: 'A team with this name already exists' });
            return;
        }

        console.error('Failed to update team:', error);
        res.status(500).json({ message: 'Internal server error while updating team' });
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
                    organization_id: req.user!.organization_id,
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
