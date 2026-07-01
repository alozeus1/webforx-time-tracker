import { Response } from 'express';
import prisma from '../config/db';
import { decryptConfig } from '../utils/crypto';
import type { AuthRequest } from '../types/auth';

const VALID_TYPES = ['annual', 'sick', 'unpaid', 'public_holiday', 'other'];
const VALID_STATUSES = ['pending', 'approved', 'rejected'];

// ─── Mattermost helper ───────────────────────────────────────────────────────

interface MattermostConfig {
    webhookUrl?: string;            // set via Admin > Integrations tab (legacy)
    incoming_webhook_url?: string;  // set via Admin > Bot Integrations tab — channel webhook
    token?: string;
    user_map?: Record<string, string>;
    bot_token?: string;             // Mattermost bot API token — for DMs
    mattermost_base_url?: string;   // e.g. https://mattermost.yourcompany.com
}

async function getMattermostConfig(organizationId: string): Promise<MattermostConfig | null> {
    try {
        const integration = await prisma.integration.findFirst({
            where: { organization_id: organizationId, type: 'mattermost', is_active: true },
            select: { config: true },
        });
        if (!integration) return null;
        return decryptConfig<MattermostConfig>(integration.config);
    } catch {
        return null;
    }
}

/** Post a message to a Mattermost channel via incoming webhook. Fire-and-forget. */
async function sendMattermostLeaveNotification(
    organizationId: string,
    text: string,
): Promise<void> {
    try {
        const config = await getMattermostConfig(organizationId);
        if (!config) return;
        const webhookUrl = config.incoming_webhook_url ?? config.webhookUrl;
        if (!webhookUrl) return;
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
    } catch (err) {
        console.error('Mattermost channel notification failed:', err);
    }
}

/**
 * Send a Mattermost DM to a user identified by email.
 * Requires bot_token + mattermost_base_url in the Integration config.
 * Fire-and-forget — never throws.
 */
async function sendMattermostDM(
    organizationId: string,
    recipientEmail: string,
    text: string,
): Promise<void> {
    try {
        const config = await getMattermostConfig(organizationId);
        if (!config?.bot_token || !config?.mattermost_base_url) return;
        const base = config.mattermost_base_url.replace(/\/$/, '');
        const headers = {
            Authorization: `Bearer ${config.bot_token}`,
            'Content-Type': 'application/json',
        };
        // Get bot's own user ID
        const botRes = await fetch(`${base}/api/v4/users/me`, { headers });
        if (!botRes.ok) return;
        const bot = await botRes.json() as { id?: string };
        if (!bot?.id) return;
        // Resolve recipient by email
        const recipRes = await fetch(`${base}/api/v4/users/email/${encodeURIComponent(recipientEmail)}`, { headers });
        if (!recipRes.ok) return;
        const recipient = await recipRes.json() as { id?: string };
        if (!recipient?.id) return;
        // Open/get DM channel
        const chanRes = await fetch(`${base}/api/v4/channels/direct`, {
            method: 'POST', headers,
            body: JSON.stringify([bot.id, recipient.id]),
        });
        if (!chanRes.ok) return;
        const channel = await chanRes.json() as { id?: string };
        if (!channel?.id) return;
        // Post message
        await fetch(`${base}/api/v4/posts`, {
            method: 'POST', headers,
            body: JSON.stringify({ channel_id: channel.id, message: text }),
        });
    } catch (err) {
        console.error('Mattermost DM failed:', err);
    }
}

// ─── In-app notification helper ──────────────────────────────────────────────

async function notifyUsers(
    userIds: string[],
    organizationId: string,
    message: string,
): Promise<void> {
    if (userIds.length === 0) return;
    try {
        await prisma.notification.createMany({
            data: userIds.map(uid => ({
                user_id: uid,
                organization_id: organizationId,
                message,
                type: 'LEAVE',
            })),
            skipDuplicates: true,
        });
    } catch (err) {
        console.error('Leave notification write failed:', err);
    }
}

// ─── History helper ──────────────────────────────────────────────────────────

async function writeHistory(
    leaveRequestId: string,
    status: string,
    actorId: string,
    comment?: string | null,
): Promise<void> {
    try {
        await (prisma as any).leaveRequestHistory.create({
            data: { leave_request_id: leaveRequestId, status, actor_id: actorId, comment: comment ?? null },
        });
    } catch (err) {
        console.error('Leave history write failed:', err);
    }
}

// ─── Employee endpoints ─────────────────────────────────────────────────────

/** GET /leave — list my leave requests with history */
export const listMyLeave = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const requests = await (prisma as any).leaveRequest.findMany({
            where: { user_id: req.user!.userId, organization_id: req.user!.organization_id },
            orderBy: { start_date: 'desc' },
            include: {
                reviewer: { select: { first_name: true, last_name: true } },
                history: {
                    orderBy: { created_at: 'asc' },
                    include: { actor: { select: { first_name: true, last_name: true } } },
                },
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

        // Fetch the submitting employee's name for notifications
        const employee = await prisma.user.findFirst({
            where: { id: req.user!.userId },
            select: { first_name: true, last_name: true, email: true },
        });
        const employeeName = employee
            ? `${employee.first_name} ${employee.last_name}`
            : 'An employee';

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

        // Write audit history — submitted
        await writeHistory(created.id, 'submitted', req.user!.userId);

        // Find all admins and managers in the org to notify
        const managers = await prisma.user.findMany({
            where: {
                organization_id: req.user!.organization_id,
                is_active: true,
                role: { name: { in: ['Admin', 'Manager'] } },
            },
            select: { id: true },
        });
        const managerIds = managers.map(m => m.id);

        const leaveLabel = leave_type.replace('_', ' ');
        const dateRange = `${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} – ${end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
        const inAppMessage = `📋 ${employeeName} submitted a ${parsedDays}-day ${leaveLabel} request (${dateRange}). Review it in Leave & PTO.`;

        // In-app notifications to all admins/managers
        await notifyUsers(managerIds, req.user!.organization_id, inAppMessage);

        // Mattermost notification (fire-and-forget)
        const mmText = [
            `### 📋 New Leave Request`,
            `**Employee:** ${employeeName}${employee ? ` (${employee.email})` : ''}`,
            `**Type:** ${leaveLabel.charAt(0).toUpperCase() + leaveLabel.slice(1)}`,
            `**Dates:** ${dateRange} · **${parsedDays} day${parsedDays !== 1 ? 's' : ''}**`,
            reason ? `**Reason:** ${reason}` : null,
            `**Status:** Pending Review`,
            `[Review request →](${process.env.FRONTEND_URL ?? 'https://timer.dev.webforxtech.com'}/leave)`,
        ].filter(Boolean).join('\n');
        void sendMattermostLeaveNotification(req.user!.organization_id, mmText);

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

        const cancelId = String(req.params['id']);
        // Write history before deleting
        await writeHistory(cancelId, 'cancelled', req.user!.userId);
        await (prisma as any).leaveRequest.delete({ where: { id: cancelId } });
        res.status(204).end();
    } catch (err) {
        console.error('cancelLeave error:', err);
        res.status(500).json({ message: 'Failed to cancel leave request' });
    }
};

// ─── Manager / Admin endpoints ──────────────────────────────────────────────

/** GET /leave/all — list all leave requests in the org (Manager+) with history */
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
                history: {
                    orderBy: { created_at: 'asc' },
                    include: { actor: { select: { first_name: true, last_name: true } } },
                },
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
            include: {
                user: { select: { id: true, first_name: true, last_name: true, email: true } },
            },
        });
        if (!existing) { res.status(404).json({ message: 'Leave request not found' }); return; }
        if (existing.status !== 'pending') {
            res.status(400).json({ message: 'This request has already been reviewed' });
            return;
        }

        // Prevent self-approval
        if (existing.user_id === req.user!.userId) {
            res.status(403).json({ message: 'You cannot approve or reject your own leave request' });
            return;
        }

        const reviewerUser = await prisma.user.findFirst({
            where: { id: req.user!.userId },
            select: { first_name: true, last_name: true },
        });
        const reviewerName = reviewerUser
            ? `${reviewerUser.first_name} ${reviewerUser.last_name}`
            : 'Your manager';

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

        const reviewId = String(req.params['id']);
        // Write audit history
        await writeHistory(reviewId, status, req.user!.userId, reviewer_note?.trim() || null);

        // Notify the employee
        const leaveLabel = existing.leave_type.replace('_', ' ');
        const startDate = new Date(existing.start_date);
        const endDate = new Date(existing.end_date);
        const dateRange = `${startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} – ${endDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
        const emoji = status === 'approved' ? '✅' : '❌';
        const verb = status === 'approved' ? 'approved' : 'rejected';

        const employeeMessage = `${emoji} Your ${leaveLabel} request (${dateRange}) was ${verb} by ${reviewerName}.${reviewer_note?.trim() ? ` Note: "${reviewer_note.trim()}"` : ''}`;
        await notifyUsers([existing.user_id], req.user!.organization_id, employeeMessage);

        // Mattermost DM to employee (fire-and-forget — requires bot_token + mattermost_base_url configured)
        if (existing.user?.email) {
            const dmText = [
                `${emoji} **Your leave request was ${verb}**`,
                `**Type:** ${leaveLabel.charAt(0).toUpperCase() + leaveLabel.slice(1)} · **Dates:** ${dateRange}`,
                `**${verb.charAt(0).toUpperCase() + verb.slice(1)} by:** ${reviewerName}`,
                reviewer_note?.trim() ? `**Note:** ${reviewer_note.trim()}` : null,
                `[View in Timer app →](${process.env.FRONTEND_URL ?? 'https://timer.dev.webforxtech.com'}/leave)`,
            ].filter(Boolean).join('\n');
            void sendMattermostDM(req.user!.organization_id, existing.user.email, dmText);
        }

        // Mattermost channel notification (fire-and-forget)
        const mmText = [
            `### ${emoji} Leave Request ${verb.charAt(0).toUpperCase() + verb.slice(1)}`,
            `**Employee:** ${existing.user?.first_name} ${existing.user?.last_name}`,
            `**Type:** ${leaveLabel.charAt(0).toUpperCase() + leaveLabel.slice(1)}`,
            `**Dates:** ${dateRange}`,
            `**${verb.charAt(0).toUpperCase() + verb.slice(1)} by:** ${reviewerName}`,
            reviewer_note?.trim() ? `**Note:** ${reviewer_note.trim()}` : null,
        ].filter(Boolean).join('\n');
        void sendMattermostLeaveNotification(req.user!.organization_id, mmText);

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
