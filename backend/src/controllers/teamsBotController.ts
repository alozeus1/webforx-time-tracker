/**
 * Microsoft Teams Bot — stub (coming soon)
 *
 * Teams integration will be activated in a future release. This controller
 * accepts the Teams webhook payload and returns a structured "coming soon"
 * response so the wiring is in place when the feature is enabled.
 */
import { Request, Response } from 'express';

export const handleTeamsCommand = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({
        type: 'message',
        text: '⚠️ Microsoft Teams integration is coming soon. Please use the web app or the Slack/Mattermost integrations for now.',
    });
};

export const getTeamsBotConfig = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({ status: 'coming_soon', message: 'Teams integration is not yet active.' });
};

export const upsertTeamsBotConfig = async (_req: Request, res: Response): Promise<void> => {
    res.status(503).json({ message: 'Teams integration is not yet active. Configuration will be available in a future release.' });
};
