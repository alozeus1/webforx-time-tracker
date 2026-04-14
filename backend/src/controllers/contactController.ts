import type { Request, Response } from 'express';
import prisma from '../config/db';
import { sendAccessRequestNotification, sendAccessRequestReceipt } from '../services/emailService';

const ADMIN_EMAIL = 'admin@webforxtech.com';
const VALID_TEAM_SIZES = ['1-10', '11-30', '31-75', '76+'];

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export const submitAccessRequest = async (req: Request, res: Response): Promise<void> => {
    const { fullName, workEmail, company, teamSize, details } = req.body as Record<string, unknown>;

    if (
        typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 100 ||
        typeof workEmail !== 'string' || !isValidEmail(workEmail.trim()) ||
        typeof company !== 'string' || company.trim().length < 2 || company.trim().length > 100 ||
        typeof teamSize !== 'string' || !VALID_TEAM_SIZES.includes(teamSize)
    ) {
        res.status(400).json({ ok: false, error: 'Please fill in all required fields with valid values.' });
        return;
    }

    if (typeof details === 'string' && details.length > 1000) {
        res.status(400).json({ ok: false, error: 'Additional details must be under 1000 characters.' });
        return;
    }

    try {
        // Prisma generates camelCase client fields from snake_case schema names.
        // The DB columns and schema fields are snake_case; we cast to bypass the
        // generated type mismatch so the column names are passed through correctly.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.accessRequest.create as any)({
            data: {
                full_name: fullName.trim(),
                work_email: workEmail.trim().toLowerCase(),
                company: company.trim(),
                team_size: teamSize,
                details: typeof details === 'string' ? details.trim() : undefined,
            },
        });

        await Promise.allSettled([
            sendAccessRequestNotification({
                to: ADMIN_EMAIL,
                fullName: fullName.trim(),
                workEmail: workEmail.trim(),
                company: company.trim(),
                teamSize,
                details: typeof details === 'string' ? details.trim() : undefined,
            }),
            sendAccessRequestReceipt({
                to: workEmail.trim().toLowerCase(),
                fullName: fullName.trim(),
            }),
        ]);

        res.status(200).json({ ok: true, message: 'Request received.' });
    } catch (error) {
        console.error('[contactController] Failed to submit access request:', error);
        res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
    }
};
