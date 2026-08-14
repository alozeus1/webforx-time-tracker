/**
 * Mattermost Slash Command Handler
 *
 * Commands:
 *   /timer start [description]   (no description + bot token → interactive dialog)
 *   /timer stop
 *   /timer status
 *   /timer log <minutes> <description>
 *   /timer link | unlink         (secure account linking via one-time code)
 *   /timer help
 *
 * Verification: outgoing webhook token stored in Integration.config.
 * User mapping: mattermost_user_id → app user_id in Integration.config.
 *
 * Mattermost sends POST with:
 *   { token, command, text, user_id, user_name, channel_id, trigger_id, ... }
 */
import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/db';
import { computeCountedSeconds } from '../services/dailyCapService';
import { encryptConfig, decryptConfig } from '../utils/crypto';
import { publicHttpsFetch, validatePublicHttpsUrl } from '../utils/outboundHttp';

interface PendingLink {
    mm_user_id: string;
    mm_username: string;
    expires_at: string;                       // ISO timestamp
}

interface MattermostConfig {
    token: string;                            // outgoing webhook verification token
    user_map: Record<string, string>;         // mattermost_user_id → app_user_id (optional manual override)
    incoming_webhook_url?: string;            // incoming webhook URL for pushing notifications TO Mattermost channel
    bot_token?: string;                       // Mattermost bot API token — for DMs + email-based user lookup
    mattermost_base_url?: string;             // e.g. https://mattermost.yourcompany.com (no trailing slash)
    pending_links?: Record<string, PendingLink>; // one-time linking codes (code → pending link)
}

const LINK_CODE_TTL_MS = 15 * 60 * 1000;

const HELP_TEXT = [
    '**Timer bot commands**',
    '`/timer start [description]` — start a timer (no description opens an interactive picker when the bot token is configured)',
    '`/timer stop` — stop the running timer and save the entry',
    '`/timer status` — show the running timer',
    '`/timer log <minutes> <description>` — log a manual entry',
    '`/timer link` — get a one-time code to link your Timer account',
    '`/timer unlink` — remove your manual account link',
    '`/timer help` — show this help',
].join('\n');

/** Public base URL of this API — used as the dialog submission callback host. */
const resolveCallbackBase = (): string =>
    (process.env.PUBLIC_API_URL?.trim() || 'https://vercel-backend-xi-three.vercel.app').replace(/\/$/, '');

/** Drop expired pending link codes. Returns a new object. */
function pruneExpiredLinks(pending: Record<string, PendingLink>): Record<string, PendingLink> {
    const now = Date.now();
    const next: Record<string, PendingLink> = {};
    for (const [code, entry] of Object.entries(pending)) {
        if (new Date(entry.expires_at).getTime() > now) next[code] = entry;
    }
    return next;
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
        const mmUserRes = await publicHttpsFetch(`${base}/api/v4/users/${mmUserId}`, { headers });
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

async function getMattermostIntegration(organizationId: string): Promise<{ id: string; config: MattermostConfig } | null> {
    const integration = await prisma.integration.findFirst({
        where: { organization_id: organizationId, type: 'mattermost', is_active: true },
        select: { id: true, config: true },
    });
    if (!integration) return null;
    try {
        return { id: integration.id, config: decryptConfig<MattermostConfig>(integration.config) };
    } catch {
        return null;
    }
}

async function saveMattermostConfig(integrationId: string, config: MattermostConfig): Promise<void> {
    await prisma.integration.update({
        where: { id: integrationId },
        data: { config: encryptConfig(config) },
    });
}

/**
 * Open the interactive "Start Timer" dialog via the Mattermost API.
 * Returns true if Mattermost accepted the request.
 */
async function openStartTimerDialog(
    orgId: string,
    orgSlug: string,
    config: MattermostConfig,
    triggerId: string,
): Promise<boolean> {
    try {
        const base = (config.mattermost_base_url ?? '').replace(/\/$/, '');
        const projects = await prisma.project.findMany({
            where: { organization_id: orgId, is_active: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
            take: 20,
        });
        const elements: object[] = [
            {
                display_name: 'What are you working on?',
                name: 'task',
                type: 'text',
                optional: false,
                max_length: 255,
                placeholder: 'Task description',
            },
        ];
        if (projects.length > 0) {
            elements.push({
                display_name: 'Project',
                name: 'project_id',
                type: 'select',
                optional: true,
                options: projects.map((p) => ({ text: p.name, value: p.id })),
            });
        }
        const dialogRes = await publicHttpsFetch(`${base}/api/v4/actions/dialogs/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.bot_token}` },
            body: JSON.stringify({
                trigger_id: triggerId,
                url: `${resolveCallbackBase()}/api/v1/bots/mattermost/${orgSlug}/dialog`,
                dialog: {
                    callback_id: 'timer_start',
                    title: 'Start Timer',
                    submit_label: 'Start Timer',
                    notify_on_cancel: false,
                    state: config.token,
                    elements,
                },
            }),
        });
        return dialogRes.ok;
    } catch (err) {
        console.warn('[mattermostBot] failed to open dialog:', err instanceof Error ? err.message : err);
        return false;
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

    const integration = await getMattermostIntegration(org.id);
    if (!integration) { res.json(mmResponse('Mattermost integration is not configured.')); return; }
    const config = integration.config;

    // Verify token — reply ephemerally (Mattermost only displays 200 responses),
    // but never execute the command.
    const incomingToken: string = req.body?.token ?? '';
    if (incomingToken !== config.token) {
        console.warn(`[mattermostBot] token mismatch for org ${orgSlug}`);
        res.json(mmResponse('⚠️ Token verification failed: the token sent by Mattermost does not match the one configured in the Timer app. Ask your admin to update it in Admin → Bot Integrations.'));
        return;
    }

    const mmUserId: string = req.body?.user_id ?? '';

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
        // --- Commands that work without a linked account ---------------------
        if (subCommand === 'help') {
            res.json(mmResponse(HELP_TEXT));
            return;
        }

        if (subCommand === 'link') {
            if (!mmUserId) { res.json(mmResponse('⚠️ Missing Mattermost user id in the request.')); return; }
            const code = crypto.randomBytes(4).toString('hex').toUpperCase();
            const pending = pruneExpiredLinks(config.pending_links ?? {});
            // One pending code per Mattermost user — drop older codes for this user.
            for (const [c, entry] of Object.entries(pending)) {
                if (entry.mm_user_id === mmUserId) delete pending[c];
            }
            pending[code] = {
                mm_user_id: mmUserId,
                mm_username: req.body?.user_name ?? '',
                expires_at: new Date(Date.now() + LINK_CODE_TTL_MS).toISOString(),
            };
            await saveMattermostConfig(integration.id, { ...config, pending_links: pending });
            res.json(mmResponse(`Your linking code is **${code}**. In the Timer app go to Profile → Linked Accounts and enter this code within 15 minutes. The code can only be used once.`));
            return;
        }

        if (subCommand === 'unlink') {
            if (config.user_map?.[mmUserId]) {
                const userMap = { ...config.user_map };
                delete userMap[mmUserId];
                await saveMattermostConfig(integration.id, { ...config, user_map: userMap });
                const note = config.bot_token
                    ? ' Note: email-based auto-link still applies while a bot token is configured — commands may still resolve to your Timer account via your email.'
                    : '';
                res.json(mmResponse(`✅ Your manual account link was removed.${note}`));
            } else {
                res.json(mmResponse('No manual account link found for your Mattermost user. (Email-based auto-link, if configured, is managed by your admin.)'));
            }
            return;
        }

        // --- Everything below requires a resolved Timer account --------------
        const appUserId = await resolveTimerUser(mmUserId, org.id, config);
        if (!appUserId) {
            const hint = config.bot_token
                ? 'Your Mattermost email is not registered in the Timer app. Run `/timer link` to get a linking code, or contact your admin.'
                : 'Your Mattermost account is not linked. Run `/timer link` to get a linking code, then enter it in the Timer app under Profile → Linked Accounts.';
            res.json(mmResponse(hint));
            return;
        }

        const user = await prisma.user.findFirst({
            where: { id: appUserId, organization_id: org.id, is_active: true },
            select: { id: true, first_name: true },
        });
        if (!user) { res.json(mmResponse('Linked user not found or inactive.')); return; }

        if (subCommand === 'start') {
            const description = parts.slice(1).join(' ');
            const existing = await prisma.activeTimer.findFirst({ where: { user_id: user.id, organization_id: org.id } });
            if (existing) { res.json(mmResponse('⚠️ Timer already running. Use `/timer stop` first.')); return; }

            // No description + bot credentials + trigger_id → interactive dialog.
            const triggerId: string = req.body?.trigger_id ?? '';
            if (!description && config.bot_token && config.mattermost_base_url && triggerId) {
                const opened = await openStartTimerDialog(org.id, orgSlug, config, triggerId);
                if (opened) { res.json(mmResponse('Opening timer dialog…')); return; }
                res.json(mmResponse('⚠️ Could not open the timer dialog. Use `/timer start <description>` instead.'));
                return;
            }

            const timer = await prisma.activeTimer.create({
                data: {
                    user_id: user.id,
                    organization_id: org.id,
                    task_description: description || 'Timer started via Mattermost',
                    start_time: new Date(),
                    persisted_state: { is_billable: true, tag_ids: [], source: 'mattermost' },
                },
            });
            let message = `✅ Timer started: **${timer.task_description}**`;
            if (!description && !(config.bot_token && config.mattermost_base_url)) {
                message += '\n_Tip: configure the bot token to get an interactive task/project picker, or use `/timer start <description>`._';
            }
            res.json(mmResponse(message));

        } else if (subCommand === 'stop') {
            const timer = await prisma.activeTimer.findFirst({ where: { user_id: user.id, organization_id: org.id } });
            if (!timer) { res.json(mmResponse('⚠️ No active timer found.')); return; }
            const end = new Date();
            // Counted time, not wall clock: a timer the user paused in the app must not be
            // credited for the paused span. Matches how the web stop path bills a session.
            const duration = Math.max(computeCountedSeconds(timer, end), 1);
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
            // Report counted time. Reporting wall clock told a user whose timer was paused
            // that it was still running, and the missing hours only showed up on the timesheet.
            const counted = computeCountedSeconds(timer, new Date());
            const hrs = Math.floor(counted / 3600);
            const mins = Math.floor((counted % 3600) / 60);
            res.json(mmResponse(timer.is_paused
                ? `⏸️ **${timer.task_description}** — paused at ${hrs}h ${mins}m. Resume it in the Timer app, or use \`/timer stop\` to save it.`
                : `⏱️ **${timer.task_description}** — running ${hrs}h ${mins}m`));

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
            res.json(mmResponse('Commands: `start [desc]` · `stop` · `status` · `log <mins> <desc>` · `link` · `unlink` · `help`'));
        }
    } catch (err) {
        console.error('[mattermostBot] error:', err);
        res.json(mmResponse('❌ An error occurred. Please try again.'));
    }
};

// ---------------------------------------------------------------------------
// POST /api/v1/bots/mattermost/:orgSlug/dialog
// Interactive dialog submission (Mattermost posts JSON):
//   { callback_id, state, user_id, channel_id, submission: { task, project_id }, cancelled }
// Responding with {} closes the dialog; { error } / { errors } keeps it open.
// ---------------------------------------------------------------------------
export const handleMattermostDialogSubmit = async (req: Request, res: Response): Promise<void> => {
    const rawSlug = req.params['orgSlug'];
    const orgSlug: string = (Array.isArray(rawSlug) ? rawSlug[0] : rawSlug) ?? '';
    const body = (req.body ?? {}) as {
        callback_id?: string;
        state?: string;
        user_id?: string;
        channel_id?: string;
        cancelled?: boolean;
        submission?: { task?: string; project_id?: string };
    };

    try {
        if (body.cancelled) { res.json({}); return; }

        const org = await prisma.organization.findFirst({ where: { slug: orgSlug }, select: { id: true } });
        if (!org) { res.json({ error: 'Organisation not found.' }); return; }

        const integration = await getMattermostIntegration(org.id);
        if (!integration) { res.json({ error: 'Mattermost integration is not configured.' }); return; }
        const config = integration.config;

        // Verify the state we placed in the dialog when opening it.
        if (!body.state || body.state !== config.token) {
            console.warn(`[mattermostBot] dialog state mismatch for org ${orgSlug}`);
            res.json({ error: 'Verification failed. Please re-run /timer start.' });
            return;
        }

        const mmUserId = body.user_id ?? '';
        const appUserId = await resolveTimerUser(mmUserId, org.id, config);
        if (!appUserId) { res.json({ error: 'Your Mattermost account is not linked. Run /timer link first.' }); return; }

        const user = await prisma.user.findFirst({
            where: { id: appUserId, organization_id: org.id, is_active: true },
            select: { id: true },
        });
        if (!user) { res.json({ error: 'Linked user not found or inactive.' }); return; }

        const task = String(body.submission?.task ?? '').trim();
        if (!task) { res.json({ errors: { task: 'Task description is required.' } }); return; }

        const existing = await prisma.activeTimer.findFirst({ where: { user_id: user.id, organization_id: org.id } });
        if (existing) { res.json({ error: 'Timer already running. Use /timer stop first.' }); return; }

        // Validate the selected project belongs to this org.
        let projectId: string | null = null;
        const rawProjectId = body.submission?.project_id ? String(body.submission.project_id) : '';
        if (rawProjectId) {
            const project = await prisma.project.findFirst({
                where: { id: rawProjectId, organization_id: org.id, is_active: true },
                select: { id: true },
            });
            projectId = project?.id ?? null;
        }

        await prisma.activeTimer.create({
            data: {
                user_id: user.id,
                organization_id: org.id,
                project_id: projectId,
                task_description: task,
                start_time: new Date(),
                persisted_state: { is_billable: true, tag_ids: [], source: 'mattermost' },
            },
        });
        res.json({});

        // Best-effort ephemeral confirmation (bot must be a member of the channel).
        if (config.bot_token && config.mattermost_base_url && mmUserId && body.channel_id) {
            try {
                const base = config.mattermost_base_url.replace(/\/$/, '');
                await publicHttpsFetch(`${base}/api/v4/posts/ephemeral`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.bot_token}` },
                    body: JSON.stringify({
                        user_id: mmUserId,
                        post: { channel_id: body.channel_id, message: `✅ Timer started: **${task}**` },
                    }),
                });
            } catch {
                // Confirmation is best-effort — the timer itself is the source of truth.
            }
        }
    } catch (err) {
        console.error('[mattermostBot] dialog error:', err);
        if (!res.headersSent) res.json({ error: 'An error occurred. Please try again.' });
    }
};

// ---------------------------------------------------------------------------
// Account linking — any authenticated user (no Admin role required)
//   GET  /api/v1/bots/mattermost/link  → { linked, mm_user_id? }
//   POST /api/v1/bots/mattermost/link  { code } → { linked: true, mm_username }
// ---------------------------------------------------------------------------
export const getMattermostLinkStatus = async (req: Request & { user?: { userId: string; organization_id: string } }, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const orgId = req.user?.organization_id;
    if (!userId || !orgId) { res.status(401).json({ message: 'Unauthorized' }); return; }
    try {
        const integration = await getMattermostIntegration(orgId);
        if (!integration) { res.json({ linked: false }); return; }
        const entry = Object.entries(integration.config.user_map ?? {}).find(([, appUserId]) => appUserId === userId);
        if (entry) {
            res.json({ linked: true, mm_user_id: entry[0] });
        } else {
            res.json({ linked: false });
        }
    } catch (err) {
        console.error('[mattermostBot] link status error:', err);
        res.status(500).json({ message: 'Failed to read link status.' });
    }
};

export const linkMattermostAccount = async (req: Request & { user?: { userId: string; organization_id: string } }, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const orgId = req.user?.organization_id;
    if (!userId || !orgId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const code = String(req.body?.code ?? '').trim().toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(code)) {
        res.status(400).json({ message: 'Invalid code format. Codes are 8 characters, e.g. A1B2C3D4.' });
        return;
    }

    try {
        const integration = await getMattermostIntegration(orgId);
        if (!integration) {
            res.status(400).json({ message: 'Mattermost integration is not configured for your organisation.' });
            return;
        }
        const config = integration.config;
        const pending = pruneExpiredLinks(config.pending_links ?? {});
        const entry = pending[code];
        if (!entry) {
            res.status(400).json({ message: 'Invalid or expired code. Run /timer link in Mattermost to get a new one.' });
            return;
        }

        delete pending[code]; // one-time use
        const userMap = { ...(config.user_map ?? {}), [entry.mm_user_id]: userId };
        await saveMattermostConfig(integration.id, { ...config, user_map: userMap, pending_links: pending });
        res.json({ linked: true, mm_username: entry.mm_username });
    } catch (err) {
        console.error('[mattermostBot] link error:', err);
        res.status(500).json({ message: 'Failed to link account.' });
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
                await validatePublicHttpsUrl(String(val));
            } catch {
                res.status(400).json({ message: `${field} must be a public HTTPS URL` });
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
        pending_links: current.pending_links,
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
