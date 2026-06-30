/**
 * Slack Slash Command Handler
 *
 * Commands handled via POST from Slack:
 *   /timer start [project name]
 *   /timer stop
 *   /timer status
 *   /timer log <minutes> <description>
 *
 * Verification: HMAC-SHA256 of the raw request body with SLACK_SIGNING_SECRET.
 * User mapping: Slack user_id → app user_id stored in Integration.config JSON.
 *
 * Setup (Admin):
 *   PUT /api/v1/bots/slack/config  { webhook_url, signing_secret, user_map: { "U123": "<app_user_id>" } }
 *   GET /api/v1/bots/slack/config
 */
import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/db';
import { encryptConfig, decryptConfig } from '../utils/crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLACK_SIGNING_VERSION = 'v0';

function verifySlackSignature(signingSecret: string, rawBody: string, timestamp: string, signature: string): boolean {
    // Reject stale requests (> 5 minutes)
    const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
    if (age > 300) return false;

    const baseString = `${SLACK_SIGNING_VERSION}:${timestamp}:${rawBody}`;
    const expected = `${SLACK_SIGNING_VERSION}=` + crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

interface SlackConfig {
    signing_secret: string;
    webhook_url?: string;
    user_map: Record<string, string>; // slack_user_id → app_user_id
}

async function getSlackConfig(organizationId: string): Promise<SlackConfig | null> {
    const integration = await prisma.integration.findFirst({
        where: { organization_id: organizationId, type: 'slack', is_active: true },
    });
    if (!integration) return null;
    try {
        return decryptConfig<SlackConfig>(integration.config);
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// POST /api/v1/bots/slack  — receive slash commands
// ---------------------------------------------------------------------------
export const handleSlackCommand = async (req: Request, res: Response): Promise<void> => {
    // Slack sends URL-encoded form data
    const rawBody: string = (req as Request & { rawBody?: string }).rawBody ?? '';
    const timestamp = req.headers['x-slack-request-timestamp'] as string ?? '';
    const slackSig = req.headers['x-slack-signature'] as string ?? '';
    const rawSlug = req.params['orgSlug'];
    const orgSlug = (Array.isArray(rawSlug) ? rawSlug[0] : rawSlug) ?? (typeof req.query.org === 'string' ? req.query.org : '') ?? '';

    if (!orgSlug) {
        res.json({ response_type: 'ephemeral', text: 'Bot not configured. Contact your admin.' });
        return;
    }

    // Resolve org
    const org = await prisma.organization.findFirst({ where: { slug: orgSlug }, select: { id: true } });
    if (!org) {
        res.json({ response_type: 'ephemeral', text: 'Organisation not found.' });
        return;
    }

    const config = await getSlackConfig(org.id);
    if (!config) {
        res.json({ response_type: 'ephemeral', text: 'Slack integration is not configured for this workspace.' });
        return;
    }

    // Verify signature
    if (!verifySlackSignature(config.signing_secret, rawBody, timestamp, slackSig)) {
        res.status(401).json({ error: 'Invalid Slack signature.' });
        return;
    }

    const slackUserId: string = req.body.user_id ?? '';
    const text: string = (req.body.text ?? '').trim();
    const appUserId = config.user_map?.[slackUserId];

    if (!appUserId) {
        res.json({
            response_type: 'ephemeral',
            text: `Your Slack account is not linked to a Web Forx timer account. Ask your admin to map your Slack user ID (\`${slackUserId}\`) in the integration settings.`,
        });
        return;
    }

    const user = await prisma.user.findFirst({
        where: { id: appUserId, organization_id: org.id, is_active: true },
        select: { id: true, first_name: true, organization_id: true },
    });

    if (!user) {
        res.json({ response_type: 'ephemeral', text: 'Linked user not found or inactive.' });
        return;
    }

    const parts = text.split(/\s+/);
    const subCommand = parts[0]?.toLowerCase() ?? 'status';

    try {
        if (subCommand === 'start') {
            const description = parts.slice(1).join(' ') || 'Timer started via Slack';
            const existing = await prisma.activeTimer.findFirst({ where: { user_id: user.id } });
            if (existing) {
                res.json({ response_type: 'ephemeral', text: '⚠️ You already have a running timer. Use `/timer stop` first.' });
                return;
            }
            const timer = await prisma.activeTimer.create({
                data: {
                    user_id: user.id,
                    organization_id: org.id,
                    task_description: description,
                    start_time: new Date(),
                    persisted_state: { is_billable: true, tag_ids: [], source: 'slack' },
                },
            });
            res.json({ response_type: 'ephemeral', text: `✅ Timer started: *${timer.task_description}*\nStarted at ${new Date(timer.start_time).toUTCString()}` });

        } else if (subCommand === 'stop') {
            const timer = await prisma.activeTimer.findFirst({ where: { user_id: user.id, organization_id: org.id } });
            if (!timer) {
                res.json({ response_type: 'ephemeral', text: '⚠️ No active timer found.' });
                return;
            }
            const end = new Date();
            const duration = Math.max(Math.floor((end.getTime() - new Date(timer.start_time).getTime()) / 1000), 1);
            await prisma.$transaction(async (tx) => {
                await tx.timeEntry.create({
                    data: {
                        user_id: user.id,
                        organization_id: org.id,
                        project_id: timer.project_id,
                        task_description: timer.task_description,
                        start_time: timer.start_time,
                        end_time: end,
                        duration,
                        entry_type: 'timer',
                        notes: 'Stopped via Slack',
                        is_billable: true,
                    },
                });
                await tx.activeTimer.delete({ where: { id: timer.id } });
            });
            const hrs = Math.floor(duration / 3600);
            const mins = Math.floor((duration % 3600) / 60);
            res.json({ response_type: 'ephemeral', text: `✅ Timer stopped: *${timer.task_description}*\nDuration: ${hrs}h ${mins}m` });

        } else if (subCommand === 'status') {
            const timer = await prisma.activeTimer.findFirst({ where: { user_id: user.id, organization_id: org.id } });
            if (!timer) {
                res.json({ response_type: 'ephemeral', text: '⏱️ No active timer running.' });
            } else {
                const elapsed = Math.floor((Date.now() - new Date(timer.start_time).getTime()) / 1000);
                const hrs = Math.floor(elapsed / 3600);
                const mins = Math.floor((elapsed % 3600) / 60);
                res.json({ response_type: 'ephemeral', text: `⏱️ *${timer.task_description}*\nRunning for ${hrs}h ${mins}m` });
            }

        } else if (subCommand === 'log') {
            // /timer log <minutes> <description>
            const minutesRaw = parseInt(parts[1] ?? '', 10);
            const description = parts.slice(2).join(' ');
            if (isNaN(minutesRaw) || minutesRaw <= 0 || !description) {
                res.json({ response_type: 'ephemeral', text: 'Usage: `/timer log <minutes> <description>`' });
                return;
            }
            const end = new Date();
            const start = new Date(end.getTime() - minutesRaw * 60 * 1000);
            const duration = minutesRaw * 60;
            await prisma.timeEntry.create({
                data: {
                    user_id: user.id,
                    organization_id: org.id,
                    project_id: null,
                    task_description: description,
                    start_time: start,
                    end_time: end,
                    duration,
                    entry_type: 'manual',
                    notes: 'Logged via Slack',
                    is_billable: true,
                },
            });
            res.json({ response_type: 'ephemeral', text: `✅ Logged ${minutesRaw} minutes for: *${description}*` });

        } else {
            res.json({
                response_type: 'ephemeral',
                text: 'Unknown command. Usage:\n• `/timer start [description]`\n• `/timer stop`\n• `/timer status`\n• `/timer log <minutes> <description>`',
            });
        }
    } catch (err) {
        console.error('[slackBot] command error:', err);
        res.json({ response_type: 'ephemeral', text: '❌ An error occurred. Please try again.' });
    }
};

// ---------------------------------------------------------------------------
// Admin: GET/PUT /api/v1/bots/slack/config
// ---------------------------------------------------------------------------
export const getSlackBotConfig = async (req: Request & { user?: { organization_id: string } }, res: Response): Promise<void> => {
    const orgId = req.user?.organization_id;
    if (!orgId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const integration = await prisma.integration.findFirst({
        where: { organization_id: orgId, type: 'slack' },
    });
    if (!integration) { res.status(404).json({ message: 'Slack integration not configured.' }); return; }

    try {
        const config = decryptConfig<SlackConfig>(integration.config);
        // Never return the signing_secret
        res.json({
            is_active: integration.is_active,
            webhook_url: config.webhook_url ?? null,
            user_map: config.user_map ?? {},
            signing_secret_set: !!config.signing_secret,
        });
    } catch {
        res.status(500).json({ message: 'Failed to read integration config.' });
    }
};

export const upsertSlackBotConfig = async (req: Request & { user?: { organization_id: string } }, res: Response): Promise<void> => {
    const orgId = req.user?.organization_id;
    if (!orgId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const { signing_secret, webhook_url, user_map } = req.body ?? {};

    const existing = await prisma.integration.findFirst({ where: { organization_id: orgId, type: 'slack' } });
    let currentConfig: Partial<SlackConfig> = {};
    if (existing) {
        try { currentConfig = decryptConfig<SlackConfig>(existing.config); } catch { /* ignore */ }
    }

    const nextConfig: SlackConfig = {
        signing_secret: signing_secret ?? currentConfig.signing_secret ?? '',
        webhook_url: webhook_url ?? currentConfig.webhook_url,
        user_map: user_map ?? currentConfig.user_map ?? {},
    };

    if (!nextConfig.signing_secret) {
        res.status(400).json({ message: 'signing_secret is required.' });
        return;
    }

    const encryptedConfig = encryptConfig(nextConfig);

    if (existing) {
        await prisma.integration.update({
            where: { id: existing.id },
            data: { config: encryptedConfig, is_active: true },
        });
    } else {
        await prisma.integration.create({
            data: { organization_id: orgId, type: 'slack', config: encryptedConfig, is_active: true },
        });
    }

    res.json({ message: 'Slack integration configured successfully.' });
};
