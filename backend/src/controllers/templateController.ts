import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

export const listTemplates = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const templates = await prisma.projectTemplate.findMany({
            orderBy: { name: 'asc' },
            include: { creator: { select: { first_name: true, last_name: true } } },
        });
        res.status(200).json({ templates });
    } catch (error) {
        console.error('Failed to list templates:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) { res.status(401).json({ message: 'Authenticated user required' }); return; }

        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        if (!name) { res.status(400).json({ message: 'Template name is required' }); return; }

        const existing = await prisma.projectTemplate.findUnique({ where: { name } });
        if (existing) { res.status(409).json({ message: 'Template name already exists' }); return; }

        const template = await prisma.projectTemplate.create({
            data: {
                name,
                description: req.body.description || null,
                default_billable: req.body.default_billable !== false,
                budget_hours: req.body.budget_hours ? parseInt(req.body.budget_hours) : null,
                budget_amount: req.body.budget_amount ? parseFloat(req.body.budget_amount) : null,
                tag_ids: Array.isArray(req.body.tag_ids) ? req.body.tag_ids : [],
                created_by: userId,
            },
        });

        res.status(201).json(template);
    } catch (error) {
        console.error('Failed to create template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createProjectFromTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const templateId = req.params.id as string;
        const template = await prisma.projectTemplate.findUnique({ where: { id: templateId } });
        if (!template) { res.status(404).json({ message: 'Template not found' }); return; }

        const projectName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        if (!projectName) { res.status(400).json({ message: 'Project name is required' }); return; }

        const existingProject = await prisma.project.findUnique({ where: { name: projectName } });
        if (existingProject) { res.status(409).json({ message: 'Project name already exists' }); return; }

        const project = await prisma.project.create({
            data: {
                name: projectName,
                description: template.description,
                budget_hours: template.budget_hours,
                budget_amount: template.budget_amount,
            },
        });

        res.status(201).json(project);
    } catch (error) {
        console.error('Failed to create project from template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const templateId = req.params.id as string;
        await prisma.projectTemplate.delete({ where: { id: templateId } });
        res.status(200).json({ message: 'Template deleted' });
    } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
            res.status(404).json({ message: 'Template not found' });
            return;
        }
        console.error('Failed to delete template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
