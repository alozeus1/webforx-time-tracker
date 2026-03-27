import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';

const UPLOADS_DIR = path.join(__dirname, '../../uploads/projects');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const getAllProjects = async (req: Request, res: Response): Promise<void> => {
    try {
        const projects = await prisma.project.findMany({
            where: { is_active: true },
            include: {
                _count: {
                    select: { members: true },
                },
                time_entries: {
                    select: { duration: true, status: true, user: { select: { hourly_rate: true } } }
                }
            },
        });

        // Compute current burn
        const enrichedProjects = projects.map(p => {
            let totalSeconds = 0;
            let totalCost = 0;
            p.time_entries.forEach(t => {
                totalSeconds += t.duration;
                const rate = parseFloat(t.user.hourly_rate?.toString() || '0');
                totalCost += (t.duration / 3600) * rate;
            });

            return {
                ...p,
                hours_burned: totalSeconds / 3600,
                cost_burned: totalCost,
                time_entries: undefined // remove heavy nested objects for standard payload
            };
        });

        res.status(200).json(enrichedProjects);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createProject = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { name, description, budget_hours, budget_amount, logo_data } = req.body;

        const existingProject = await prisma.project.findUnique({ where: { name } });
        if (existingProject) {
            res.status(400).json({ message: 'Project with this name already exists' });
            return;
        }

        let logo_url: string | null = null;
        if (typeof logo_data === 'string' && logo_data.startsWith('data:image/')) {
            const matches = logo_data.match(/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,(.+)$/);
            if (matches) {
                const ext = matches[1].replace('+xml', '');
                const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                fs.writeFileSync(path.join(UPLOADS_DIR, fileName), Buffer.from(matches[2], 'base64'));
                logo_url = `/uploads/projects/${fileName}`;
            }
        }

        const newProject = await prisma.project.create({
            data: {
                name,
                description,
                logo_url,
                budget_hours: budget_hours ? parseInt(budget_hours) : null,
                budget_amount: budget_amount ? parseFloat(budget_amount) : null,
            },
        });

        if (req.user?.userId) {
            try {
                await prisma.auditLog.create({
                    data: {
                        user_id: req.user.userId,
                        action: 'project_created',
                        resource: 'project',
                        metadata: {
                            project_id: newProject.id,
                            project_name: newProject.name,
                        },
                    },
                });
            } catch (error) {
                console.error('Failed to write project creation audit log:', error);
            }
        }

        res.status(201).json(newProject);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateProject = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const projectId = req.params.id as string;
        const { name, description, budget_hours, budget_amount, logo_data, is_active } = req.body;

        const updateData: Record<string, unknown> = {};

        if (typeof name === 'string' && name.trim()) updateData.name = name.trim();
        if (typeof description === 'string') updateData.description = description;
        if (typeof is_active === 'boolean') updateData.is_active = is_active;
        if (budget_hours !== undefined) updateData.budget_hours = budget_hours ? parseInt(budget_hours) : null;
        if (budget_amount !== undefined) updateData.budget_amount = budget_amount ? parseFloat(budget_amount) : null;

        if (typeof logo_data === 'string' && logo_data.startsWith('data:image/')) {
            const matches = logo_data.match(/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,(.+)$/);
            if (matches) {
                const ext = matches[1].replace('+xml', '');
                const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                fs.writeFileSync(path.join(UPLOADS_DIR, fileName), Buffer.from(matches[2], 'base64'));
                updateData.logo_url = `/uploads/projects/${fileName}`;
            }
        } else if (logo_data === null) {
            updateData.logo_url = null;
        }

        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ message: 'No valid fields provided' });
            return;
        }

        const updated = await prisma.project.update({
            where: { id: projectId },
            data: updateData,
        });

        if (req.user?.userId) {
            try {
                await prisma.auditLog.create({
                    data: {
                        user_id: req.user.userId,
                        action: 'project_updated',
                        resource: 'project',
                        metadata: { project_id: projectId, updated_fields: Object.keys(updateData) },
                    },
                });
            } catch (error) {
                console.error('Failed to write project update audit log:', error);
            }
        }

        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteProject = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const projectId = req.params.id as string;

        await prisma.project.update({
            where: { id: projectId },
            data: { is_active: false },
        });

        if (req.user?.userId) {
            try {
                await prisma.auditLog.create({
                    data: {
                        user_id: req.user.userId,
                        action: 'project_deleted',
                        resource: 'project',
                        metadata: { project_id: projectId },
                    },
                });
            } catch (error) {
                console.error('Failed to write project deletion audit log:', error);
            }
        }

        res.status(200).json({ message: 'Project deactivated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};
