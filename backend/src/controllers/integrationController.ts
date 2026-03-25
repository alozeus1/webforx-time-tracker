import { Response } from 'express';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { decryptConfig, encryptConfig } from '../utils/crypto';

type IntegrationType = 'taiga' | 'mattermost' | 'quickbooks';

interface TaigaConfig {
    username: string;
    password: string;
}

interface MattermostConfig {
    webhookUrl: string;
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

        if (!['taiga', 'mattermost', 'quickbooks'].includes(type)) {
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

        if (!type || !['taiga', 'mattermost'].includes(type)) {
            res.status(400).json({ message: 'Supported test types are taiga and mattermost' });
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
