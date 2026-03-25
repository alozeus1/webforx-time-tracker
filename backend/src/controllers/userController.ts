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
        });
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

export const updateMe = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = requireUserId(req);
        const { first_name, last_name, password } = req.body;

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
        });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};
