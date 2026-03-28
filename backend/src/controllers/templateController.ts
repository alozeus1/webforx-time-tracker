import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { sendApiError } from '../utils/http';

const parseOptionalInteger = (value: unknown): number | null => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
};

const parseOptionalNumber = (value: unknown): number | null => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
};

export const listTemplates = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const templates = await prisma.projectTemplate.findMany({
            orderBy: { name: 'asc' },
            include: { creator: { select: { first_name: true, last_name: true } } },
        });
        res.status(200).json({ templates });
    } catch (error) {
        console.error('Failed to list templates:', error);
        sendApiError(res, 500, 'TEMPLATE_LIST_FAILED', 'Internal server error');
    }
};

export const createTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            sendApiError(res, 401, 'AUTH_REQUIRED', 'Authenticated user required');
            return;
        }

        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        if (!name) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'Template name is required');
            return;
        }

        const budgetHours = parseOptionalInteger(req.body?.budget_hours);
        if (req.body?.budget_hours !== undefined && budgetHours === null) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'budget_hours must be a valid integer');
            return;
        }

        const budgetAmount = parseOptionalNumber(req.body?.budget_amount);
        if (req.body?.budget_amount !== undefined && budgetAmount === null) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'budget_amount must be a valid number');
            return;
        }

        const existing = await prisma.projectTemplate.findUnique({ where: { name } });
        if (existing) {
            sendApiError(res, 409, 'TEMPLATE_EXISTS', 'Template name already exists');
            return;
        }

        const template = await prisma.projectTemplate.create({
            data: {
                name,
                description: typeof req.body?.description === 'string' && req.body.description.trim() ? req.body.description.trim() : null,
                default_billable: req.body.default_billable !== false,
                budget_hours: budgetHours,
                budget_amount: budgetAmount,
                tag_ids: Array.isArray(req.body.tag_ids) ? req.body.tag_ids : [],
                created_by: userId,
            },
        });

        res.status(201).json(template);
    } catch (error) {
        console.error('Failed to create template:', error);
        sendApiError(res, 500, 'TEMPLATE_CREATE_FAILED', 'Internal server error');
    }
};

export const createProjectFromTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const templateId = req.params.id as string;
        const template = await prisma.projectTemplate.findUnique({ where: { id: templateId } });
        if (!template) {
            sendApiError(res, 404, 'TEMPLATE_NOT_FOUND', 'Template not found');
            return;
        }

        const projectName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        if (!projectName) {
            sendApiError(res, 400, 'VALIDATION_ERROR', 'Project name is required');
            return;
        }

        const existingProject = await prisma.project.findUnique({ where: { name: projectName } });
        if (existingProject) {
            sendApiError(res, 409, 'PROJECT_EXISTS', 'Project name already exists');
            return;
        }

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
        sendApiError(res, 500, 'TEMPLATE_APPLY_FAILED', 'Internal server error');
    }
};

export const deleteTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const templateId = req.params.id as string;
        await prisma.projectTemplate.delete({ where: { id: templateId } });
        res.status(200).json({ message: 'Template deleted' });
    } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
            sendApiError(res, 404, 'TEMPLATE_NOT_FOUND', 'Template not found');
            return;
        }
        console.error('Failed to delete template:', error);
        sendApiError(res, 500, 'TEMPLATE_DELETE_FAILED', 'Internal server error');
    }
};
