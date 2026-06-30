/**
 * Bot routes — Slack, Mattermost, and Teams (stub) slash command endpoints.
 *
 * Public endpoints (no auth middleware) receive the slash command POST from
 * the chat platform and verify authenticity via platform-specific mechanisms
 * (Slack HMAC signature, Mattermost token).
 *
 * Admin config endpoints require authentication + Admin role.
 */
import { Router } from 'express';
import express from 'express';
import { authenticateToken, requireRole } from '../middlewares/auth';
import { handleSlackCommand, getSlackBotConfig, upsertSlackBotConfig } from '../controllers/slackBotController';
import { handleMattermostCommand, getMattermostBotConfig, upsertMattermostBotConfig } from '../controllers/mattermostBotController';
import { handleTeamsCommand, getTeamsBotConfig, upsertTeamsBotConfig } from '../controllers/teamsBotController';

const router = Router();

// ---------------------------------------------------------------------------
// Raw body capture for Slack HMAC verification
// Slack requires access to the raw request body (before JSON.parse) for
// signature verification. We capture it here on Slack-specific routes only.
// ---------------------------------------------------------------------------
const captureRawBody = express.raw({ type: 'application/x-www-form-urlencoded' });

// Slack — public slash command endpoint
router.post('/slack/:orgSlug', captureRawBody, (req, res, next) => {
    // Parse URL-encoded body and attach raw buffer for signature verification
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    (req as typeof req & { rawBody: string }).rawBody = raw;
    // Re-parse as key-value pairs for controller convenience
    const params = new URLSearchParams(raw);
    const body: Record<string, string> = {};
    params.forEach((v, k) => { body[k] = v; });
    req.body = body;
    next();
}, handleSlackCommand);

// Mattermost — public slash command endpoint
router.post('/mattermost/:orgSlug', express.urlencoded({ extended: false }), handleMattermostCommand);

// Teams — stub
router.post('/teams/:orgSlug', handleTeamsCommand);

// ---------------------------------------------------------------------------
// Admin config endpoints — require auth + Admin role
// ---------------------------------------------------------------------------
router.use(authenticateToken, requireRole(['Admin']));

router.get('/slack/config', getSlackBotConfig as express.RequestHandler);
router.put('/slack/config', upsertSlackBotConfig as express.RequestHandler);

router.get('/mattermost/config', getMattermostBotConfig as express.RequestHandler);
router.put('/mattermost/config', upsertMattermostBotConfig as express.RequestHandler);

router.get('/teams/config', getTeamsBotConfig);
router.put('/teams/config', upsertTeamsBotConfig);

export default router;
