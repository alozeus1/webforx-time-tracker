import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

const requireUserId = (req: AuthRequest): string => {
    if (!req.user?.userId) {
        throw new Error('Authenticated user is required');
    }

    return req.user.userId;
};

type ImportedUserPayload = {
    email?: unknown;
    first_name?: unknown;
    last_name?: unknown;
    full_name?: unknown;
    name?: unknown;
    role?: unknown;
    user_type?: unknown;
    type?: unknown;
    password?: unknown;
    project_ids?: unknown;
    projects?: unknown;
    project?: unknown;
    team?: unknown;
};

type ImportOptionsPayload = {
    use_email_as_password?: unknown;
    default_role?: unknown;
    default_project_ids?: unknown;
    role_in_project?: unknown;
    skip_existing?: unknown;
};

const ROLE_ALIAS_TO_CANONICAL: Record<string, string> = {
    admin: 'Admin',
    administrator: 'Admin',
    employee: 'Employee',
    employees: 'Employee',
    staff: 'Employee',
    intern: 'Intern',
    interns: 'Intern',
    manager: 'Manager',
    managers: 'Manager',
    lead: 'Manager',
    leads: 'Manager',
};

const normalizeString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const normalizeEmail = (value: unknown): string => normalizeString(value).toLowerCase();

const splitName = (value: string): { firstName: string; lastName: string } => {
    const tokens = value.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
        return { firstName: '', lastName: '' };
    }

    if (tokens.length === 1) {
        return { firstName: tokens[0], lastName: 'User' };
    }

    return {
        firstName: tokens[0],
        lastName: tokens.slice(1).join(' '),
    };
};

const deriveName = (payload: ImportedUserPayload, email: string): { firstName: string; lastName: string } => {
    const firstName = normalizeString(payload.first_name);
    const lastName = normalizeString(payload.last_name);
    if (firstName && lastName) {
        return { firstName, lastName };
    }

    const fullName = normalizeString(payload.full_name) || normalizeString(payload.name);
    if (fullName) {
        return splitName(fullName);
    }

    const emailPrefix = email.split('@')[0] || 'User';
    return splitName(emailPrefix.replace(/[._-]+/g, ' '));
};

const toStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value
            .map((item) => normalizeString(item))
            .filter(Boolean);
    }

    if (typeof value === 'string') {
        return value
            .split(/[,;|]/)
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [];
};

const resolveCanonicalRoleName = (rawRole: string): string => {
    const normalized = rawRole.trim().toLowerCase();
    if (!normalized) {
        return '';
    }

    return ROLE_ALIAS_TO_CANONICAL[normalized] || rawRole.trim();
};

const looksLikeEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: requireUserId(req) },
            include: { role: true },
        });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        res.status(200).json({
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role.name,
            is_active: user.is_active,
            weekly_hour_limit: user.weekly_hour_limit,
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getMyNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = requireUserId(req);
        const requestedLimit = Number.parseInt(String(req.query.limit ?? '20'), 10);
        const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 20;

        const notifications = await prisma.notification.findMany({
            where: { user_id: userId },
            orderBy: { created_at: 'desc' },
            take: limit,
            include: {
                user: { select: { email: true, first_name: true, last_name: true } },
            },
        });

        res.status(200).json({ notifications });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                is_active: true,
                role: { select: { name: true } },
            },
        });
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getRoles = async (_req: Request, res: Response): Promise<void> => {
    try {
        const roles = await prisma.role.findMany({
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });

        res.status(200).json({ roles });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

const resolveRoleId = async (roleId?: string, roleName?: string): Promise<string> => {
    if (roleId?.trim()) {
        return roleId.trim();
    }

    if (roleName?.trim()) {
        const role = await prisma.role.findUnique({ where: { name: roleName.trim() } });
        if (!role) {
            throw new Error('Invalid role');
        }

        return role.id;
    }

    throw new Error('Role is required');
};

export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { email, password, first_name, last_name, role_id, role } = req.body;

        if (!email || !password || !first_name || !last_name) {
            res.status(400).json({ message: 'Missing required fields' });
            return;
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(400).json({ message: 'User with this email already exists' });
            return;
        }

        let resolvedRoleId: string;
        try {
            resolvedRoleId = await resolveRoleId(role_id, role);
        } catch (error) {
            res.status(400).json({ message: 'Invalid or missing role' });
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const newUser = await prisma.user.create({
            data: {
                email,
                password_hash,
                first_name,
                last_name,
                role_id: resolvedRoleId,
            },
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                is_active: true,
                role: { select: { name: true } },
            },
        });

        try {
            await prisma.auditLog.create({
                data: {
                    user_id: requireUserId(req),
                    action: 'user_created',
                    resource: 'user',
                    metadata: {
                        target_user_id: newUser.id,
                        target_email: newUser.email,
                    },
                },
            });
        } catch (error) {
            console.error('Failed to write user creation audit log:', error);
        }

        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const importUsers = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const payload = req.body as { users?: unknown; options?: ImportOptionsPayload };
        const users = Array.isArray(payload.users) ? (payload.users as ImportedUserPayload[]) : [];
        const options = payload.options || {};

        if (users.length === 0) {
            res.status(400).json({ message: 'At least one user row is required for import' });
            return;
        }

        if (users.length > 500) {
            res.status(400).json({ message: 'Import supports up to 500 users per request' });
            return;
        }

        const skipExisting = options.skip_existing !== false;
        const useEmailAsPassword = options.use_email_as_password !== false;
        const actorRole = req.user?.role || 'Employee';
        const actorUserId = requireUserId(req);
        const roleInProject = normalizeString(options.role_in_project) || 'Team Member';
        const defaultRoleName = resolveCanonicalRoleName(normalizeString(options.default_role) || 'Employee');
        const defaultProjectIdsFromPayload = toStringArray(options.default_project_ids);

        const [roleRecords, projectRecords] = await Promise.all([
            prisma.role.findMany({ select: { id: true, name: true } }),
            prisma.project.findMany({ select: { id: true, name: true } }),
        ]);

        const roleByName = new Map<string, { id: string; name: string }>();
        roleRecords.forEach((role) => {
            roleByName.set(role.name.toLowerCase(), role);
        });

        const projectById = new Map<string, { id: string; name: string }>();
        const projectByName = new Map<string, { id: string; name: string }>();
        projectRecords.forEach((project) => {
            projectById.set(project.id, project);
            projectByName.set(project.name.toLowerCase(), project);
        });

        const normalizedDefaultRole = resolveCanonicalRoleName(defaultRoleName);
        const defaultRole = roleByName.get(normalizedDefaultRole.toLowerCase());
        if (!defaultRole) {
            res.status(400).json({ message: `Default role "${defaultRoleName}" is invalid` });
            return;
        }

        const invalidDefaultProjectIds = defaultProjectIdsFromPayload.filter((id) => !projectById.has(id));
        if (invalidDefaultProjectIds.length > 0) {
            res.status(400).json({
                message: `Unknown default project IDs: ${invalidDefaultProjectIds.join(', ')}`,
            });
            return;
        }

        const created: Array<{ id: string; email: string; first_name: string; last_name: string; role: string; assigned_projects: number }> = [];
        const skipped: Array<{ email: string; reason: string }> = [];
        const failed: Array<{ email: string; reason: string }> = [];

        for (const [index, row] of users.entries()) {
            const email = normalizeEmail(row.email);
            const recordLabel = email || `row ${index + 1}`;

            if (!email || !looksLikeEmail(email)) {
                failed.push({ email: recordLabel, reason: 'Invalid or missing email' });
                continue;
            }

            const candidateRoleName = resolveCanonicalRoleName(
                normalizeString(row.role) || normalizeString(row.user_type) || normalizeString(row.type) || defaultRole.name,
            );
            const roleRecord = roleByName.get(candidateRoleName.toLowerCase());
            if (!roleRecord) {
                failed.push({ email, reason: `Unknown role "${candidateRoleName}"` });
                continue;
            }

            if (actorRole !== 'Admin' && roleRecord.name === 'Admin') {
                failed.push({ email, reason: 'Only admins can import admin users' });
                continue;
            }

            if (skipExisting) {
                const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
                if (existing) {
                    skipped.push({ email, reason: 'User already exists' });
                    continue;
                }
            }

            const { firstName, lastName } = deriveName(row, email);
            if (!firstName || !lastName) {
                failed.push({ email, reason: 'Missing name information (first/last/full name)' });
                continue;
            }

            const passwordValue = useEmailAsPassword
                ? email
                : normalizeString(row.password) || email;

            try {
                const password_hash = await bcrypt.hash(passwordValue, await bcrypt.genSalt(10));

                const newUser = await prisma.user.create({
                    data: {
                        email,
                        password_hash,
                        first_name: firstName,
                        last_name: lastName,
                        role_id: roleRecord.id,
                    },
                    select: {
                        id: true,
                        email: true,
                        first_name: true,
                        last_name: true,
                        role: { select: { name: true } },
                    },
                });

                const rowProjectIds = toStringArray(row.project_ids);
                const rowProjectTokens = [
                    ...toStringArray(row.project),
                    ...toStringArray(row.projects),
                    ...toStringArray(row.team),
                ];

                const assignmentSet = new Set<string>(defaultProjectIdsFromPayload);

                rowProjectIds.forEach((projectId) => {
                    if (projectById.has(projectId)) {
                        assignmentSet.add(projectId);
                    }
                });

                rowProjectTokens.forEach((projectToken) => {
                    const byId = projectById.get(projectToken);
                    if (byId) {
                        assignmentSet.add(byId.id);
                        return;
                    }

                    const byName = projectByName.get(projectToken.toLowerCase());
                    if (byName) {
                        assignmentSet.add(byName.id);
                    }
                });

                if (assignmentSet.size > 0) {
                    await prisma.projectMember.createMany({
                        data: Array.from(assignmentSet).map((projectId) => ({
                            project_id: projectId,
                            user_id: newUser.id,
                            role_in_project: roleInProject,
                        })),
                        skipDuplicates: true,
                    });
                }

                created.push({
                    id: newUser.id,
                    email: newUser.email,
                    first_name: newUser.first_name,
                    last_name: newUser.last_name,
                    role: newUser.role.name,
                    assigned_projects: assignmentSet.size,
                });
            } catch (error) {
                const knownMessage = (error as { code?: string }).code === 'P2002'
                    ? 'User with this email already exists'
                    : 'Failed to create user';
                failed.push({ email, reason: knownMessage });
            }
        }

        try {
            await prisma.auditLog.create({
                data: {
                    user_id: actorUserId,
                    action: 'users_imported',
                    resource: 'user',
                    metadata: {
                        total: users.length,
                        created: created.length,
                        skipped: skipped.length,
                        failed: failed.length,
                    },
                },
            });
        } catch (error) {
            console.error('Failed to write user import audit log:', error);
        }

        res.status(201).json({
            summary: {
                total: users.length,
                created: created.length,
                skipped: skipped.length,
                failed: failed.length,
            },
            created,
            skipped,
            failed,
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userIdParam = req.params.id;
        const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
        const { first_name, last_name, email, password, role_id, role, is_active } = req.body;

        if (!userId) {
            res.status(400).json({ message: 'User id is required' });
            return;
        }

        const updateData: Record<string, unknown> = {};

        if (typeof first_name === 'string' && first_name.trim()) {
            updateData.first_name = first_name.trim();
        }

        if (typeof last_name === 'string' && last_name.trim()) {
            updateData.last_name = last_name.trim();
        }

        if (typeof email === 'string' && email.trim()) {
            updateData.email = email.trim().toLowerCase();
        }

        if (typeof is_active === 'boolean') {
            updateData.is_active = is_active;
        }

        if (typeof password === 'string' && password.trim()) {
            const salt = await bcrypt.genSalt(10);
            updateData.password_hash = await bcrypt.hash(password.trim(), salt);
        }

        if ((typeof role_id === 'string' && role_id.trim()) || (typeof role === 'string' && role.trim())) {
            try {
                updateData.role_id = await resolveRoleId(role_id, role);
            } catch (error) {
                res.status(400).json({ message: 'Invalid role' });
                return;
            }
        }

        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ message: 'No valid fields provided for update' });
            return;
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                is_active: true,
                role: { select: { name: true } },
            },
        });

        try {
            await prisma.auditLog.create({
                data: {
                    user_id: requireUserId(req),
                    action: 'user_updated',
                    resource: 'user',
                    metadata: {
                        target_user_id: updatedUser.id,
                        updated_fields: Object.keys(updateData),
                    },
                },
            });
        } catch (error) {
            console.error('Failed to write user update audit log:', error);
        }

        res.status(200).json(updatedUser);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userIdParam = req.params.id;
        const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;

        if (!userId) {
            res.status(400).json({ message: 'User id is required' });
            return;
        }

        if (userId === requireUserId(req)) {
            res.status(400).json({ message: 'Cannot delete your own account' });
            return;
        }

        const target = await prisma.user.findUnique({ where: { id: userId } });
        if (!target) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        // Soft-delete: deactivate + anonymize
        await prisma.user.update({
            where: { id: userId },
            data: { is_active: false },
        });

        try {
            await prisma.auditLog.create({
                data: {
                    user_id: requireUserId(req),
                    action: 'user_deleted',
                    resource: 'user',
                    metadata: { target_user_id: userId, target_email: target.email },
                },
            });
        } catch (error) {
            console.error('Failed to write user deletion audit log:', error);
        }

        res.status(200).json({ message: 'User deactivated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateMe = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = requireUserId(req);
        const { first_name, last_name, password, weekly_hour_limit } = req.body;

        const updateData: Record<string, unknown> = {};

        if (typeof first_name === 'string' && first_name.trim()) {
            updateData.first_name = first_name.trim();
        }

        if (typeof last_name === 'string' && last_name.trim()) {
            updateData.last_name = last_name.trim();
        }

        if (typeof password === 'string' && password.trim()) {
            const salt = await bcrypt.genSalt(10);
            updateData.password_hash = await bcrypt.hash(password.trim(), salt);
        }

        if (weekly_hour_limit !== undefined) {
            updateData.weekly_hour_limit = weekly_hour_limit === null ? null : parseInt(String(weekly_hour_limit), 10) || null;
        }

        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ message: 'No valid fields provided for update' });
            return;
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            include: { role: true },
        });

        try {
            await prisma.auditLog.create({
                data: {
                    user_id: userId,
                    action: 'profile_updated',
                    resource: 'user',
                    metadata: {
                        updated_fields: Object.keys(updateData),
                    },
                },
            });
        } catch (error) {
            console.error('Failed to write profile update audit log:', error);
        }

        res.status(200).json({
            id: updatedUser.id,
            email: updatedUser.email,
            first_name: updatedUser.first_name,
            last_name: updatedUser.last_name,
            role: updatedUser.role.name,
            is_active: updatedUser.is_active,
            weekly_hour_limit: updatedUser.weekly_hour_limit,
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};
