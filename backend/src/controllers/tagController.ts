import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

export const listTags = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });
        res.status(200).json({ tags });
    } catch (error) {
        console.error('Failed to list tags:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createTag = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        const color = typeof req.body?.color === 'string' ? req.body.color.trim() : '#6366f1';

        if (!name) {
            res.status(400).json({ message: 'Tag name is required' });
            return;
        }

        const existing = await prisma.tag.findUnique({ where: { name } });
        if (existing) {
            res.status(409).json({ message: 'Tag already exists' });
            return;
        }

        const tag = await prisma.tag.create({ data: { name, color } });
        res.status(201).json(tag);
    } catch (error) {
        console.error('Failed to create tag:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteTag = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        await prisma.tag.delete({ where: { id } });
        res.status(200).json({ message: 'Tag deleted' });
    } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
            res.status(404).json({ message: 'Tag not found' });
            return;
        }
        console.error('Failed to delete tag:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
