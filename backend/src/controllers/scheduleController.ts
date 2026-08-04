import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

const ENTRY_TYPES = new Set(['shift', 'availability', 'unavailable']);
const MAX_WINDOW_DAYS = 93;

const parseWindow = (req: AuthRequest) => {
    const start = new Date(typeof req.query.start === 'string' ? req.query.start : '');
    const end = new Date(typeof req.query.end === 'string' ? req.query.end : '');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
    if (end.getTime() - start.getTime() > MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000) return null;
    return { start, end };
};

const normalizePayload = (body: Record<string, unknown>) => {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const userId = typeof body.user_id === 'string' ? body.user_id.trim() : '';
    const projectId = typeof body.project_id === 'string' && body.project_id.trim() ? body.project_id.trim() : null;
    const entryType = typeof body.entry_type === 'string' ? body.entry_type : 'shift';
    const startTime = new Date(typeof body.start_time === 'string' ? body.start_time : '');
    const endTime = new Date(typeof body.end_time === 'string' ? body.end_time : '');
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
    const color = typeof body.color === 'string' && /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : null;

    if (!title || !userId || !ENTRY_TYPES.has(entryType)) return null;
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || endTime <= startTime) return null;
    return { title, userId, projectId, entryType, startTime, endTime, notes, color };
};

const validateTenantReferences = async (organizationId: string, userId: string, projectId: string | null) => {
    const [user, project] = await Promise.all([
        prisma.user.findFirst({ where: { id: userId, organization_id: organizationId, is_active: true }, select: { id: true } }),
        projectId
            ? prisma.project.findFirst({ where: { id: projectId, organization_id: organizationId, is_active: true }, select: { id: true } })
            : Promise.resolve({ id: null }),
    ]);
    return Boolean(user && project);
};

const scheduleInclude = {
    assignee: { select: { id: true, first_name: true, last_name: true, email: true, team_name: true } },
    project: { select: { id: true, name: true } },
    creator: { select: { id: true, first_name: true, last_name: true } },
} as const;

export const listScheduleEntries = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const window = parseWindow(req);
        if (!window) {
            res.status(400).json({ message: 'A valid start/end window of 93 days or less is required.' });
            return;
        }

        const canViewTeam = req.user?.role === 'Manager' || req.user?.role === 'Admin';
        const requestedUserId = typeof req.query.user_id === 'string' ? req.query.user_id : undefined;
        const userId = canViewTeam ? requestedUserId : req.user!.userId;

        const entries = await prisma.scheduleEntry.findMany({
            where: {
                organization_id: req.user!.organization_id,
                ...(userId ? { user_id: userId } : {}),
                start_time: { lt: window.end },
                end_time: { gt: window.start },
            },
            include: scheduleInclude,
            orderBy: { start_time: 'asc' },
        });
        res.status(200).json({ entries });
    } catch (error) {
        console.error('Failed to list schedule entries:', error);
        res.status(500).json({ message: 'Internal server error while loading the schedule.' });
    }
};

export const createScheduleEntry = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const payload = normalizePayload(req.body ?? {});
        if (!payload) {
            res.status(400).json({ message: 'Valid title, team member, type, start time, and end time are required.' });
            return;
        }
        if (!await validateTenantReferences(req.user!.organization_id, payload.userId, payload.projectId)) {
            res.status(404).json({ message: 'Team member or project not found.' });
            return;
        }

        const entry = await prisma.scheduleEntry.create({
            data: {
                organization_id: req.user!.organization_id,
                user_id: payload.userId,
                project_id: payload.projectId,
                created_by: req.user!.userId,
                title: payload.title,
                entry_type: payload.entryType,
                start_time: payload.startTime,
                end_time: payload.endTime,
                notes: payload.notes,
                color: payload.color,
            },
            include: scheduleInclude,
        });
        res.status(201).json(entry);
    } catch (error) {
        console.error('Failed to create schedule entry:', error);
        res.status(500).json({ message: 'Internal server error while creating the schedule entry.' });
    }
};

export const updateScheduleEntry = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const entryId = Array.isArray(req.params.entryId) ? req.params.entryId[0] : req.params.entryId;
        const existing = await prisma.scheduleEntry.findFirst({
            where: { id: entryId, organization_id: req.user!.organization_id },
        });
        if (!existing) {
            res.status(404).json({ message: 'Schedule entry not found.' });
            return;
        }

        const payload = normalizePayload({
            title: req.body?.title ?? existing.title,
            user_id: req.body?.user_id ?? existing.user_id,
            project_id: req.body?.project_id === undefined ? existing.project_id : req.body.project_id,
            entry_type: req.body?.entry_type ?? existing.entry_type,
            start_time: req.body?.start_time ?? existing.start_time.toISOString(),
            end_time: req.body?.end_time ?? existing.end_time.toISOString(),
            notes: req.body?.notes === undefined ? existing.notes : req.body.notes,
            color: req.body?.color === undefined ? existing.color : req.body.color,
        });
        if (!payload) {
            res.status(400).json({ message: 'The updated schedule entry is invalid.' });
            return;
        }
        if (!await validateTenantReferences(req.user!.organization_id, payload.userId, payload.projectId)) {
            res.status(404).json({ message: 'Team member or project not found.' });
            return;
        }

        const entry = await prisma.scheduleEntry.update({
            where: { id: existing.id },
            data: {
                user_id: payload.userId,
                project_id: payload.projectId,
                title: payload.title,
                entry_type: payload.entryType,
                start_time: payload.startTime,
                end_time: payload.endTime,
                notes: payload.notes,
                color: payload.color,
            },
            include: scheduleInclude,
        });
        res.status(200).json(entry);
    } catch (error) {
        console.error('Failed to update schedule entry:', error);
        res.status(500).json({ message: 'Internal server error while updating the schedule entry.' });
    }
};

export const deleteScheduleEntry = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const entryId = Array.isArray(req.params.entryId) ? req.params.entryId[0] : req.params.entryId;
        const result = await prisma.scheduleEntry.deleteMany({
            where: { id: entryId, organization_id: req.user!.organization_id },
        });
        if (result.count === 0) {
            res.status(404).json({ message: 'Schedule entry not found.' });
            return;
        }
        res.status(204).send();
    } catch (error) {
        console.error('Failed to delete schedule entry:', error);
        res.status(500).json({ message: 'Internal server error while deleting the schedule entry.' });
    }
};
