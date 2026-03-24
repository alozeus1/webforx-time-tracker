import { Request, Response } from 'express';
import prisma from '../config/db';

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

export const createProject = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, description, budget_hours, budget_amount } = req.body;

        const existingProject = await prisma.project.findUnique({ where: { name } });
        if (existingProject) {
            res.status(400).json({ message: 'Project with this name already exists' });
            return;
        }

        const newProject = await prisma.project.create({
            data: {
                name,
                description,
                budget_hours: budget_hours ? parseInt(budget_hours) : null,
                budget_amount: budget_amount ? parseFloat(budget_amount) : null,
            },
        });

        res.status(201).json(newProject);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
};
