import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { decryptConfig, encryptConfig } from '../utils/crypto';

type IntegrationType = 'taiga' | 'mattermost' | 'quickbooks' | 'github' | 'jira' | 'linear' | 'asana' | 'clickup' | 'trello';

interface TaigaConfig {
    username: string;
    password: string;
}

interface MattermostConfig {
    webhookUrl: string;
}

interface GithubConfig {
    repository: string;
    personalAccessToken: string;
}

interface JiraConfig {
    baseUrl: string;
    email: string;
    apiToken: string;
    projectKey: string;
}

interface LinearConfig {
    apiKey: string;
    teamName: string;
}

interface AsanaConfig {
    personalAccessToken: string;
    workspace: string;
}

interface ClickUpConfig {
    apiKey: string;
    workspaceId: string;
}

interface TrelloConfig {
    apiKey: string;
    token: string;
    boardId: string;
}

export const getGithubCommits = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // In a real app, uses a stored GitHub PAT from the integrations table to fetch user's recent commits.
        const mockCommits = [
            { id: 'c_1xyz', message: 'fix: resolving strict mode warnings in Playwright', repo: 'webforxtech/time-tracker', timestamp: new Date().toISOString() },
            { id: 'c_2abc', message: 'feat: connecting calendar mock controller', repo: 'webforxtech/time-tracker', timestamp: new Date(Date.now() - 3600000).toISOString() }
        ];

        res.status(200).json({ commits: mockCommits });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error while syncing GitHub' });
    }
};

export const getTaskSources = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const integrations = await prisma.integration.findMany({
            where: {
                type: { in: ['github', 'jira', 'linear', 'asana', 'clickup', 'trello'] },
                is_active: true,
            },
            orderBy: { type: 'asc' },
        });

        const sources = integrations.map((integration) => {
            try {
                if (integration.type === 'github') {
                    const config = decryptConfig<GithubConfig>(integration.config);
                    return { type: integration.type, label: config.repository, readiness: 'live' };
                }

                if (integration.type === 'jira') {
                    const config = decryptConfig<JiraConfig>(integration.config);
                    return { type: integration.type, label: `${config.projectKey} @ ${new URL(config.baseUrl).host}`, readiness: 'configured' };
                }

                if (integration.type === 'linear') {
                    const config = decryptConfig<LinearConfig>(integration.config);
                    return { type: integration.type, label: config.teamName, readiness: 'configured' };
                }

                if (integration.type === 'asana') {
                    const config = decryptConfig<AsanaConfig>(integration.config);
                    return { type: integration.type, label: config.workspace, readiness: 'configured' };
                }

                if (integration.type === 'clickup') {
                    const config = decryptConfig<ClickUpConfig>(integration.config);
                    return { type: integration.type, label: config.workspaceId, readiness: 'configured' };
                }

                if (integration.type === 'trello') {
                    const config = decryptConfig<TrelloConfig>(integration.config);
                    return { type: integration.type, label: config.boardId, readiness: 'configured' };
                }
            } catch (error) {
                return { type: integration.type, label: 'Configuration unreadable', readiness: 'error' };
            }

            return { type: integration.type, label: integration.type, readiness: 'configured' };
        });

        res.status(200).json({ sources });
    } catch (error) {
        console.error('Failed to load task sources:', error);
        res.status(500).json({ message: 'Internal server error while loading task sources' });
    }
};

export const listIntegrations = async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const integrations = await prisma.integration.findMany({
            orderBy: { type: 'asc' },
        });

        const sanitized = integrations.map((integration) => {
            let summary: Record<string, string> = {};

            try {
                if (integration.type === 'taiga') {
                    const config = decryptConfig<TaigaConfig>(integration.config);
                    summary = { username: config.username };
                }

                if (integration.type === 'mattermost') {
                    const config = decryptConfig<MattermostConfig>(integration.config);
                    summary = { webhookHost: new URL(config.webhookUrl).host };
                }

                if (integration.type === 'github') {
                    const config = decryptConfig<GithubConfig>(integration.config);
                    summary = { repository: config.repository };
                }

                if (integration.type === 'jira') {
                    const config = decryptConfig<JiraConfig>(integration.config);
                    summary = { host: new URL(config.baseUrl).host, projectKey: config.projectKey };
                }

                if (integration.type === 'linear') {
                    const config = decryptConfig<LinearConfig>(integration.config);
                    summary = { teamName: config.teamName };
                }

                if (integration.type === 'asana') {
                    const config = decryptConfig<AsanaConfig>(integration.config);
                    summary = { workspace: config.workspace };
                }

                if (integration.type === 'clickup') {
                    const config = decryptConfig<ClickUpConfig>(integration.config);
                    summary = { workspaceId: config.workspaceId };
                }

                if (integration.type === 'trello') {
                    const config = decryptConfig<TrelloConfig>(integration.config);
                    summary = { boardId: config.boardId };
                }
            } catch (error) {
                summary = { status: 'Configuration unreadable' };
            }

            return {
                type: integration.type,
                is_active: integration.is_active,
                summary,
            };
        });

        res.status(200).json({ integrations: sanitized });
    } catch (error) {
        console.error('Failed to list integrations:', error);
        res.status(500).json({ message: 'Internal server error while loading integrations' });
    }
};

export const saveIntegration = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { type, config } = req.body as { type?: IntegrationType; config?: Record<string, string> };

        if (!type || !config) {
            res.status(400).json({ message: 'Integration type and config are required' });
            return;
        }

        if (!['taiga', 'mattermost', 'quickbooks', 'github', 'jira', 'linear', 'asana', 'clickup', 'trello'].includes(type)) {
            res.status(400).json({ message: 'Unsupported integration type' });
            return;
        }

        if (type === 'taiga') {
            if (!config.username?.trim() || !config.password?.trim()) {
                res.status(400).json({ message: 'Taiga username and password are required' });
                return;
            }
        }

        if (type === 'mattermost') {
            if (!config.webhookUrl?.trim()) {
                res.status(400).json({ message: 'Mattermost webhook URL is required' });
                return;
            }

            try {
                const url = new URL(config.webhookUrl);
                if (!['http:', 'https:'].includes(url.protocol)) {
                    throw new Error('Invalid protocol');
                }
            } catch (error) {
                res.status(400).json({ message: 'Mattermost webhook URL is invalid' });
                return;
            }
        }

        if (type === 'github') {
            if (!config.repository?.trim() || !config.personalAccessToken?.trim()) {
                res.status(400).json({ message: 'GitHub repository and personal access token are required' });
                return;
            }
        }

        if (type === 'jira') {
            if (!config.baseUrl?.trim() || !config.email?.trim() || !config.apiToken?.trim() || !config.projectKey?.trim()) {
                res.status(400).json({ message: 'Jira base URL, email, API token, and project key are required' });
                return;
            }
        }

        if (type === 'linear') {
            if (!config.apiKey?.trim() || !config.teamName?.trim()) {
                res.status(400).json({ message: 'Linear API key and team name are required' });
                return;
            }
        }

        if (type === 'asana') {
            if (!config.personalAccessToken?.trim() || !config.workspace?.trim()) {
                res.status(400).json({ message: 'Asana personal access token and workspace are required' });
                return;
            }
        }

        if (type === 'clickup') {
            if (!config.apiKey?.trim() || !config.workspaceId?.trim()) {
                res.status(400).json({ message: 'ClickUp API key and workspace ID are required' });
                return;
            }
        }

        if (type === 'trello') {
            if (!config.apiKey?.trim() || !config.token?.trim() || !config.boardId?.trim()) {
                res.status(400).json({ message: 'Trello API key, token, and board ID are required' });
                return;
            }
        }

        const integration = await prisma.integration.upsert({
            where: { type },
            update: {
                config: encryptConfig(config),
                is_active: true,
            },
            create: {
                type,
                config: encryptConfig(config),
                is_active: true,
            },
        });

        if (req.user?.userId) {
            try {
                await prisma.auditLog.create({
                    data: {
                        user_id: req.user.userId,
                        action: 'integration_saved',
                        resource: 'integration',
                        metadata: {
                            type: integration.type,
                            is_active: integration.is_active,
                        },
                    },
                });
            } catch (error) {
                console.error('Failed to write integration save audit log:', error);
            }
        }

        res.status(200).json({
            type: integration.type,
            is_active: integration.is_active,
            message: `${integration.type} integration saved successfully`,
        });
    } catch (error) {
        console.error('Failed to save integration:', error);
        res.status(500).json({ message: 'Internal server error while saving integration' });
    }
};

export const testIntegration = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { type } = req.body as { type?: IntegrationType };

        if (!type || !['taiga', 'mattermost', 'github', 'jira', 'linear', 'asana', 'clickup', 'trello'].includes(type)) {
            res.status(400).json({ message: 'Supported test types are taiga, mattermost, github, jira, linear, asana, clickup, and trello' });
            return;
        }

        const integration = await prisma.integration.findUnique({ where: { type } });
        if (!integration || !integration.is_active) {
            res.status(404).json({ message: `${type} integration is not configured` });
            return;
        }

        if (type === 'mattermost') {
            const config = decryptConfig<MattermostConfig>(integration.config);
            const response = await fetch(config.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `Web Forx Time Tracker integration test at ${new Date().toISOString()}`,
                }),
            });

            if (!response.ok) {
                const body = await response.text();
                res.status(400).json({ message: `Mattermost webhook test failed (${response.status}): ${body || 'No response body'}` });
                return;
            }

            if (req.user?.userId) {
                try {
                    await prisma.auditLog.create({
                        data: {
                            user_id: req.user.userId,
                            action: 'integration_tested',
                            resource: 'integration',
                            metadata: { type: 'mattermost', result: 'success' },
                        },
                    });
                } catch (error) {
                    console.error('Failed to write mattermost test audit log:', error);
                }
            }

            res.status(200).json({ status: 'success', message: 'Mattermost webhook test delivered successfully' });
            return;
        }

        if (['github', 'jira', 'linear', 'asana', 'clickup', 'trello'].includes(type)) {
            if (req.user?.userId) {
                try {
                    await prisma.auditLog.create({
                        data: {
                            user_id: req.user.userId,
                            action: 'integration_tested',
                            resource: 'integration',
                            metadata: { type, result: 'configured' },
                        },
                    });
                } catch (error) {
                    console.error(`Failed to write ${type} test audit log:`, error);
                }
            }

            res.status(200).json({
                status: 'success',
                message: `${type} connector saved and ready for workday suggestions.`,
            });
            return;
        }

        const config = decryptConfig<TaigaConfig>(integration.config);
        const response = await fetch('https://api.taiga.io/api/v1/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'normal',
                username: config.username,
                password: config.password,
            }),
        });

        if (!response.ok) {
            const body = await response.text();
            res.status(400).json({ message: `Taiga credential test failed (${response.status}): ${body || 'No response body'}` });
            return;
        }

        const payload = await response.json().catch(() => ({}));
        if (!payload?.auth_token) {
            res.status(400).json({ message: 'Taiga credential test failed: auth token missing from response' });
            return;
        }

        if (req.user?.userId) {
            try {
                await prisma.auditLog.create({
                    data: {
                        user_id: req.user.userId,
                        action: 'integration_tested',
                        resource: 'integration',
                        metadata: { type: 'taiga', result: 'success' },
                    },
                });
            } catch (error) {
                console.error('Failed to write taiga test audit log:', error);
            }
        }

        res.status(200).json({ status: 'success', message: 'Taiga credentials validated successfully' });
    } catch (error) {
        console.error('Failed to test integration:', error);
        res.status(500).json({ message: 'Internal server error while testing integration' });
    }
};

export const syncQuickbooks = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // In a real app, groups recent approved timesheets and POSTs an invoice to Intuit Quickbooks API
        const { project_id } = req.body;

        console.log(`[Integration Worker] Mock syncing invoice for project ${project_id} to QuickBooks...`);
        res.status(200).json({ message: 'Timesheets successfully synced as draft invoices in QuickBooks', status: 'success' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error while syncing QuickBooks' });
    }
};
