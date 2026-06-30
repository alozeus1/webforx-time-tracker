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
    user_map: Record<string, string>;         // mattermost_user_id → app_user_id
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
    const appUserId = config.user_map?.[mmUserId];
    if (!appUserId) {
        res.json(mmResponse(`Your Mattermost account is not linked. Ask your admin to map your user ID (\`${mmUserId}\`).`));
        return;
    }

    const user = await prisma.user.findFirst({
        where: { id: appUserId, organization_id: org.id, is_active: true },
        select: { id: true, first_name: true },
    });
    if (!user) { res.json(mmResponse('Linked user not found or inactive.')); return; }

    const text: string = (req.body?.text ?? '').trim();
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
        res.json({ is_active: integration.is_active, user_map: config.user_map ?? {}, token_set: !!config.token });
    } catch {
        res.status(500).json({ message: 'Failed to read config.' });
    }
};

export const upsertMattermostBotConfig = async (req: Request & { user?: { organization_id: string } }, res: Response): Promise<void> => {
    const orgId = req.user?.organization_id;
    if (!orgId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const { token, user_map } = req.body ?? {};
    const existing = await prisma.integration.findFirst({ where: { organization_id: orgId, type: 'mattermost' } });
    let current: Partial<MattermostConfig> = {};
    if (existing) { try { current = decryptConfig<MattermostConfig>(existing.config); } catch { /* ignore */ } }

    const next: MattermostConfig = {
        token: token ?? current.token ?? '',
        user_map: user_map ?? current.user_map ?? {},
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
