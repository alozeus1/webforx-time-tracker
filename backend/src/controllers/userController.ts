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

export const createUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password, first_name, last_name, role_id } = req.body;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(400).json({ message: 'User with this email already exists' });
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
                role_id,
            },
            select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
            },
        });

        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};
