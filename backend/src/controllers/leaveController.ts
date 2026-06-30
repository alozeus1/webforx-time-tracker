import { Response } from 'express';
import prisma from '../config/db';
import type { AuthRequest } from '../types/auth';

const VALID_TYPES = ['annual', 'sick', 'unpaid', 'public_holiday', 'other'];
const VALID_STATUSES = ['pending', 'approved', 'rejected'];

// ─── Employee endpoints ─────────────────────────────────────────────────────

/** GET /leave — list my leave requests */
export const listMyLeave = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const requests = await (prisma as any).leaveRequest.findMany({
            where: { user_id: req.user!.userId, organization_id: req.user!.organization_id },
            orderBy: { start_date: 'desc' },
            include: {
                reviewer: { select: { first_name: true, last_name: true } },
            },
        });
        res.json(requests);
    } catch (err) {
        console.error('listMyLeave error:', err);
        res.status(500).json({ message: 'Failed to load leave requests' });
    }
};

/** POST /leave — submit a new leave request */
export const createLeave = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { leave_type, start_date, end_date, days, reason } = req.body as {
            leave_type?: string;
            start_date?: string;
            end_date?: string;
            days?: number;
            reason?: string;
        };

        if (!leave_type || !VALID_TYPES.includes(leave_type)) {
            res.status(400).json({ message: `leave_type must be one of: ${VALID_TYPES.join(', ')}` });
            return;
        }
        if (!start_date || !end_date) {
            res.status(400).json({ message: 'start_date and end_date are required' });
            return;
        }
        const start = new Date(start_date);
        const end = new Date(end_date);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
            res.status(400).json({ message: 'Invalid date range' });
            return;
        }
        const parsedDays = parseFloat(String(days ?? 0));
        if (isNaN(parsedDays) || parsedDays <= 0) {
            res.status(400).json({ message: 'days must be a positive number' });
            return;
        }

        const created = await (prisma as any).leaveRequest.create({
            data: {
                user_id: req.user!.userId,
                organization_id: req.user!.organization_id,
                leave_type,
                start_date: start,
                end_date: end,
                days: parsedDays,
                reason: reason?.trim() || null,
                status: 'pending',
            },
        });
        res.status(201).json(created);
    } catch (err) {
        console.error('createLeave error:', err);
        res.status(500).json({ message: 'Failed to submit leave request' });
    }
};

/** DELETE /leave/:id — cancel my own pending request */
export const cancelLeave = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const existing = await (prisma as any).leaveRequest.findFirst({
            where: { id: req.params.id, user_id: req.user!.userId, organization_id: req.user!.organization_id },
        });
        if (!existing) { res.status(404).json({ message: 'Leave request not found' }); return; }
        if (existing.status !== 'pending') {
            res.status(400).json({ message: 'Only pending requests can be cancelled' });
            return;
        }
        await (prisma as any).leaveRequest.delete({ where: { id: req.params.id } });
        res.status(204).end();
    } catch (err) {
        console.error('cancelLeave error:', err);
        res.status(500).json({ message: 'Failed to cancel leave request' });
    }
};

// ─── Manager / Admin endpoints ──────────────────────────────────────────────

/** GET /leave/all — list all leave requests in the org (Manager+) */
export const listAllLeave = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { status, user_id } = req.query as { status?: string; user_id?: string };

        const where: Record<string, unknown> = { organization_id: req.user!.organization_id };
        if (status && VALID_STATUSES.includes(status)) where.status = status;
        if (user_id) where.user_id = user_id;

        const requests = await (prisma as any).leaveRequest.findMany({
            where,
            orderBy: { created_at: 'desc' },
            include: {
                user: { select: { first_name: true, last_name: true, email: true } },
                reviewer: { select: { first_name: true, last_name: true } },
            },
        });
        res.json(requests);
    } catch (err) {
        console.error('listAllLeave error:', err);
        res.status(500).json({ message: 'Failed to load leave requests' });
    }
};

/** PATCH /leave/:id/review — approve or reject a request (Manager+) */
export const reviewLeave = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { status, reviewer_note } = req.body as { status?: string; reviewer_note?: string };

        if (!status || !['approved', 'rejected'].includes(status)) {
            res.status(400).json({ message: 'status must be "approved" or "rejected"' });
            return;
        }

        const existing = await (prisma as any).leaveRequest.findFirst({
            where: { id: req.params.id, organization_id: req.user!.organization_id },
        });
        if (!existing) { res.status(404).json({ message: 'Leave request not found' }); return; }
        if (existing.status !== 'pending') {
            res.status(400).json({ message: 'This request has already been reviewed' });
            return;
        }

        const updated = await (prisma as any).leaveRequest.update({
            where: { id: req.params.id },
            data: {
                status,
                reviewed_by: req.user!.userId,
                reviewed_at: new Date(),
                reviewer_note: reviewer_note?.trim() || null,
            },
            include: {
                user: { select: { first_name: true, last_name: true, email: true } },
                reviewer: { select: { first_name: true, last_name: true } },
            },
        });
        res.json(updated);
    } catch (err) {
        console.error('reviewLeave error:', err);
        res.status(500).json({ message: 'Failed to review leave request' });
    }
};

/** GET /leave/summary — per-user leave balance summary (Admin) */
export const leaveSummary = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const year = parseInt(String(req.query.year ?? new Date().getFullYear()), 10);
        const startOfYear = new Date(`${year}-01-01`);
        const endOfYear = new Date(`${year}-12-31T23:59:59`);

        const requests = await (prisma as any).leaveRequest.findMany({
            where: {
                organization_id: req.user!.organization_id,
                status: 'approved',
                start_date: { gte: startOfYear, lte: endOfYear },
            },
            include: {
                user: { select: { id: true, first_name: true, last_name: true, email: true } },
            },
        });

        // Group by user → leave_type
        const summaryMap = new Map<string, { user: { id: string; first_name: string; last_name: string; email: string }; totals: Record<string, number> }>();
        for (const r of requests) {
            const uid = r.user.id;
            if (!summaryMap.has(uid)) summaryMap.set(uid, { user: r.user, totals: {} });
            const entry = summaryMap.get(uid)!;
            entry.totals[r.leave_type] = (entry.totals[r.leave_type] ?? 0) + parseFloat(r.days.toString());
        }

        res.json({ year, summary: Array.from(summaryMap.values()) });
    } catch (err) {
        console.error('leaveSummary error:', err);
        res.status(500).json({ message: 'Failed to load leave summary' });
    }
};
