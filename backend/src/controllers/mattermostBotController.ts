/**
 * Mattermost Slash Command Handler
 *
 * Commands:
 *   /timer start [description]
 *   /timer stop
 *   /timer status
 *   /timer log <minutes> <description>
 *
 * Verification: outgoing webhook token stored in Integration.config.
 * User mapping: mattermost_user_id → app user_id in Integration.config.
 *
 * Mattermost sends POST with:
 *   { token, command, text, user_id, user_name, channel_id, ... }
 */
import { Request, Response } from 'express';
import prisma from '../config/db';
import { encryptConfig, decryptConfig } from '../utils/crypto';

interface MattermostConfig {
    token: string;                            // outgoing webhook verification token
    user_map: Record<string, string>;         // mattermost_user_id → app_user_id (optional manual override)
    incoming_webhook_url?: string;            // incoming webhook URL for pushing notifications TO Mattermost channel
    bot_token?: string;                       // Mattermost bot API token — for DMs + email-based user lookup
    mattermost_base_url?: string;             // e.g. https://mattermost.yourcompany.com (no trailing slash)
}

/**
 * Resolve a Mattermost user_id to a Timer app user by:
 *   1. Checking the manual user_map (explicit override)
 *   2. Calling Mattermost API to get the user's email, then querying the Timer DB
 * Returns the Timer app user_id, or null if unresolvable.
 */
async function resolveTimerUser(
    mmUserId: string,
    orgId: string,
    config: MattermostConfig,
): Promise<string | null> {
    // Fast path: manual mapping
    const mapped = config.user_map?.[mmUserId];
    if (mapped) return mapped;

    // Auto-resolve via Mattermost API if bot credentials are configured
    if (!config.bot_token || !config.mattermost_base_url) return null;

    try {
        const base = config.mattermost_base_url.replace(/\/$/, '');
        const headers = { Authorization: `Bearer ${config.bot_token}` };
        const mmUserRes = await fetch(`${base}/api/v4/users/${mmUserId}`, { headers });
        if (!mmUserRes.ok) return null;
        const mmUser = await mmUserRes.json() as { email?: string };
        if (!mmUser?.email) return null;

        const timerUser = await prisma.user.findFirst({
            where: { email: mmUser.email, organization_id: orgId, is_active: true },
            select: { id: true },
        });
        return timerUser?.id ?? null;
    } catch {
        return null;
    }
}

async function getMattermostConfig(organizationId: string): Promise<MattermostConfig | null> {
    const integration = await prisma.integration.findFirst({
        where: { organization_id: organizationId, type: 'mattermost', is_active: true },
        select: { config: true },
    });
    if (!integration) return null;
    try {
        return decryptConfig<MattermostConfig>(integration.config);
    } catch {
        return null;
    }
}

function mmResponse(text: string): object {
    return { response_type: 'ephemeral', text };
}

// ---------------------------------------------------------------------------
// POST /api/v1/bots/mattermost/:orgSlug
// ---------------------------------------------------------------------------
export const handleMattermostCommand = async (req: Request, res: Response): Promise<void> => {
    const rawSlug = req.params['orgSlug'];
    const orgSlug: string = (Array.isArray(rawSlug) ? rawSlug[0] : rawSlug) ?? (typeof req.query.org === 'string' ? req.query.org : '') ?? '';
    if (!orgSlug) { res.json(mmResponse('Bot not configured. Contact your admin.')); return; }

    const org = await prisma.organization.findFirst({ where: { slug: orgSlug }, select: { id: true } });
    if (!org) { res.json(mmResponse('Organisation not found.')); return; }

    const config = await getMattermostConfig(org.id);
    if (!config) { res.json(mmResponse('Mattermost integration is not configured.')); return; }

    // Verify token
    const incomingToken: string = req.body?.token ?? '';
    if (incomingToken !== config.token) {
        res.status(401).json({ error: 'Invalid token.' });
        return;
    }

    const mmUserId: string = req.body?.user_id ?? '';
    const appUserId = await resolveTimerUser(mmUserId, org.id, config);
    if (!appUserId) {
        const hint = config.bot_token
            ? `Your Mattermost email is not registered in the Timer app. Contact your admin.`
            : `Your Mattermost account is not linked. Ask your admin to add your user ID (\`${mmUserId}\`) in Bot Integrations, or configure the Bot Token for auto-linking.`;
        res.json(mmResponse(hint));
        return;
    }

    const user = await prisma.user.findFirst({
        where: { id: appUserId, organization_id: org.id, is_active: true },
        select: { id: true, first_name: true },
    });
    if (!user) { res.json(mmResponse('Linked user not found or inactive.')); return; }

    // Support both Slash Commands (/timer start) and Outgoing Webhooks (trigger word "timer").
    // Outgoing webhooks include the trigger word at the start of `text`, slash commands do not.
    const isOutgoingWebhook = !!req.body?.trigger_word;
    const rawText: string = (req.body?.text ?? '').trim();
    const text = isOutgoingWebhook
        ? rawText.replace(/^timer\s*/i, '').trim()
        : rawText;

    const parts = text.split(/\s+/);
    const subCommand = parts[0]?.toLowerCase() ?? 'status';

    try {
        if (subCommand === 'start') {
            const description = parts.slice(1).join(' ') || 'Timer started via Mattermost';
            const existing = await prisma.activeTimer.findFirst({ where: { user_id: user.id, organization_id: org.id } });
            if (existing) { res.json(mmResponse('⚠️ Timer already running. Use `/timer stop` first.')); return; }
            const timer = await prisma.activeTimer.create({
                data: {
                    user_id: user.id,
                    organization_id: org.id,
                    task_description: description,
                    start_time: new Date(),
                    persisted_state: { is_billable: true, tag_ids: [], source: 'mattermost' },
                },
            });
            res.json(mmResponse(`✅ Timer started: **${timer.task_description}**`));

        } else if (subCommand === 'stop') {
            const timer = await prisma.activeTimer.findFirst({ where: { user_id: user.id, organization_id: org.id } });
            if (!timer) { res.json(mmResponse('⚠️ No active timer found.')); return; }
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
                        notes: 'Stopped via Mattermost',
                        is_billable: true,
                    },
                });
                await tx.activeTimer.delete({ where: { id: timer.id } });
            });
            const hrs = Math.floor(duration / 3600);
            const mins = Math.floor((duration % 3600) / 60);
            res.json(mmResponse(`✅ Timer stopped: **${timer.task_description}** (${hrs}h ${mins}m)`));

        } else if (subCommand === 'status') {
            const timer = await prisma.activeTimer.findFirst({ where: { user_id: user.id, organization_id: org.id } });
            if (!timer) { res.json(mmResponse('⏱️ No active timer running.')); return; }
            const elapsed = Math.floor((Date.now() - new Date(timer.start_time).getTime()) / 1000);
            const hrs = Math.floor(elapsed / 3600);
            const mins = Math.floor((elapsed % 3600) / 60);
            res.json(mmResponse(`⏱️ **${timer.task_description}** — running ${hrs}h ${mins}m`));

        } else if (subCommand === 'log') {
            const minutesRaw = parseInt(parts[1] ?? '', 10);
            const description = parts.slice(2).join(' ');
            if (isNaN(minutesRaw) || minutesRaw <= 0 || !description) {
                res.json(mmResponse('Usage: `/timer log <minutes> <description>`'));
                return;
            }
            const end = new Date();
            const start = new Date(end.getTime() - minutesRaw * 60 * 1000);
            await prisma.timeEntry.create({
                data: {
                    user_id: user.id,
                    organization_id: org.id,
                    task_description: description,
                    start_time: start,
                    end_time: end,
                    duration: minutesRaw * 60,
                    entry_type: 'manual',
                    notes: 'Logged via Mattermost',
                    is_billable: true,
                },
            });
            res.json(mmResponse(`✅ Logged ${minutesRaw} minutes: **${description}**`));

        } else {
            res.json(mmResponse('Commands: `start [desc]` · `stop` · `status` · `log <mins> <desc>`'));
        }
    } catch (err) {
        console.error('[mattermostBot] error:', err);
        res.json(mmResponse('❌ An error occurred. Please try again.'));
    }
};

// ---------------------------------------------------------------------------
// Admin: GET/PUT /api/v1/bots/mattermost/config
// ---------------------------------------------------------------------------
export const getMattermostBotConfig = async (req: Request & { user?: { organization_id: string } }, res: Response): Promise<void> => {
    const orgId = req.user?.organization_id;
    if (!orgId) { res.status(401).json({ message: 'Unauthorized' }); return; }
    const integration = await prisma.integration.findFirst({ where: { organization_id: orgId, type: 'mattermost' } });
    if (!integration) { res.status(404).json({ message: 'Mattermost integration not configured.' }); return; }
    try {
        const config = decryptConfig<MattermostConfig>(integration.config);
        res.json({
            is_active: integration.is_active,
            user_map: config.user_map ?? {},
            token_set: !!config.token,
            incoming_webhook_url_set: !!config.incoming_webhook_url,
            bot_token_set: !!config.bot_token,
            mattermost_base_url: config.mattermost_base_url ?? '',
        });
    } catch {
        res.status(500).json({ message: 'Failed to read config.' });
    }
};

export const upsertMattermostBotConfig = async (req: Request & { user?: { organization_id: string } }, res: Response): Promise<void> => {
    const orgId = req.user?.organization_id;
    if (!orgId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const { token, user_map, incoming_webhook_url, bot_token, mattermost_base_url } = req.body ?? {};
    const existing = await prisma.integration.findFirst({ where: { organization_id: orgId, type: 'mattermost' } });
    let current: Partial<MattermostConfig> = {};
    if (existing) { try { current = decryptConfig<MattermostConfig>(existing.config); } catch { /* ignore */ } }

    // Validate URLs if provided
    for (const [field, val] of [['incoming_webhook_url', incoming_webhook_url], ['mattermost_base_url', mattermost_base_url]]) {
        if (val) {
            try {
                const u = new URL(String(val));
                if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad protocol');
            } catch {
                res.status(400).json({ message: `${field} must be a valid http/https URL` });
                return;
            }
        }
    }

    const next: MattermostConfig = {
        token: token ?? current.token ?? '',
        user_map: user_map ?? current.user_map ?? {},
        incoming_webhook_url: incoming_webhook_url ?? current.incoming_webhook_url,
        bot_token: bot_token ?? current.bot_token,
        mattermost_base_url: mattermost_base_url
            ? String(mattermost_base_url).replace(/\/$/, '')
            : current.mattermost_base_url,
    };
    if (!next.token) { res.status(400).json({ message: 'token is required.' }); return; }

    const enc = encryptConfig(next);
    if (existing) {
        await prisma.integration.update({ where: { id: existing.id }, data: { config: enc, is_active: true } });
    } else {
        await prisma.integration.create({ data: { organization_id: orgId, type: 'mattermost', config: enc, is_active: true } });
    }
    res.json({ message: 'Mattermost bot configured.' });
};
