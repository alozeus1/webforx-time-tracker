import { Request, Response } from 'express';
import prisma from '../config/db';

export const categorizeWindows = async (req: Request, res: Response): Promise<void> => {
    try {
        const { windowTitles } = req.body;

        if (!windowTitles || !Array.isArray(windowTitles)) {
            res.status(400).json({ message: 'Invalid payload. Provide an array of windowTitles.' });
            return;
        }

        const activeProjects = await prisma.project.findMany({ where: { is_active: true } });

        // Mock ML Logic: fuzzy match words in the titles with project names
        const suggestions: Array<{ title: string, suggested_project: string | null, confidence: number }> = [];

        windowTitles.forEach((title: string) => {
            let bestMatch = null;
            let highestScore = 0;

            activeProjects.forEach(proj => {
                const words = title.toLowerCase().split(/\s+/);
                let score = 0;
                words.forEach(word => {
                    if (proj.name.toLowerCase().includes(word) && word.length > 3) {
                        score += 0.5;
                    }
                });

                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = proj.name;
                }
            });

            suggestions.push({
                title,
                suggested_project: highestScore > 0 ? bestMatch : null,
                confidence: highestScore > 0 ? Math.min(highestScore, 0.99) : 0
            });
        });

        res.status(200).json({ suggestions });
    } catch (error) {
        console.error('ML categorizer failed:', error);
        res.status(500).json({ message: 'Internal server error resolving AI categories' });
    }
};
