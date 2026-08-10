jest.mock('../src/config/db', () => ({
    __esModule: true,
    default: {
        integration: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            upsert: jest.fn(),
        },
        auditLog: { create: jest.fn() },
    },
}));

jest.mock('../src/utils/crypto', () => ({
    decryptConfig: jest.fn(),
    encryptConfig: jest.fn(() => 'encrypted-config'),
}));

jest.mock('../src/utils/outboundHttp', () => ({
    publicHttpsFetch: jest.fn(),
    validatePublicHttpsUrl: jest.fn(),
}));

import { Response as ExpressResponse } from 'express';
import prisma from '../src/config/db';
import { AuthRequest } from '../src/types/auth';
import { decryptConfig, encryptConfig } from '../src/utils/crypto';
import { publicHttpsFetch } from '../src/utils/outboundHttp';
import {
    getGithubCommits,
    getTaskSources,
    saveIntegration,
    syncQuickbooks,
    testIntegration,
} from '../src/controllers/integrationController';

const responseMock = () => {
    const response = {
        status: jest.fn(),
        json: jest.fn(),
    };
    response.status.mockReturnValue(response);
    return response as unknown as ExpressResponse & { status: jest.Mock; json: jest.Mock };
};

const request = (body: Record<string, unknown> = {}) => ({
    body,
    user: {
        userId: 'user-a',
        email: 'admin@example.com',
        role: 'Admin',
        organization_id: 'org-a',
    },
}) as AuthRequest;

const githubConfig = { repository: 'webforx/time-tracker', personalAccessToken: 't'.repeat(40) };
const githubResponse = () => new Response(JSON.stringify([{
    sha: 'abc123',
    html_url: 'https://github.com/webforx/time-tracker/commit/abc123',
    commit: { message: 'feat: real commits', author: { date: '2026-08-10T12:00:00Z' } },
}]), { status: 200, headers: { 'content-type': 'application/json' } });

describe('integration controller platform foundations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (decryptConfig as jest.Mock).mockReturnValue(githubConfig);
    });

    it('loads GitHub configuration only from the authenticated tenant', async () => {
        (prisma.integration.findFirst as jest.Mock).mockResolvedValue({ config: 'encrypted', is_active: true });
        (publicHttpsFetch as jest.Mock).mockResolvedValue(githubResponse());
        const response = responseMock();

        await getGithubCommits(request(), response);

        expect(prisma.integration.findFirst).toHaveBeenCalledWith({
            where: { type: 'github', organization_id: 'org-a', is_active: true },
        });
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ readiness: 'live' }));
    });

    it('returns preview when GitHub is not configured and rate-limit state when exhausted', async () => {
        (prisma.integration.findFirst as jest.Mock).mockResolvedValueOnce(null);
        const unconfiguredResponse = responseMock();
        await getGithubCommits(request(), unconfiguredResponse);
        expect(unconfiguredResponse.status).toHaveBeenCalledWith(404);
        expect(unconfiguredResponse.json).toHaveBeenCalledWith(expect.objectContaining({ readiness: 'preview', commits: [] }));

        (prisma.integration.findFirst as jest.Mock).mockResolvedValueOnce({ config: 'encrypted', is_active: true });
        (publicHttpsFetch as jest.Mock).mockResolvedValueOnce(new Response('', {
            status: 429,
            headers: { 'x-ratelimit-reset': '1893456000' },
        }));
        const limitedResponse = responseMock();
        await getGithubCommits(request(), limitedResponse);
        expect(limitedResponse.status).toHaveBeenCalledWith(429);
        expect(limitedResponse.json).toHaveBeenCalledWith(expect.objectContaining({
            code: 'GITHUB_RATE_LIMITED',
            readiness: 'error',
        }));
    });

    it('validates repository format before encrypted tenant-scoped storage', async () => {
        const invalidResponse = responseMock();
        await saveIntegration(request({
            type: 'github',
            config: { repository: 'https://github.com/webforx/time-tracker', personalAccessToken: 't'.repeat(40) },
        }), invalidResponse);
        expect(invalidResponse.status).toHaveBeenCalledWith(400);
        expect(prisma.integration.upsert).not.toHaveBeenCalled();

        (prisma.integration.upsert as jest.Mock).mockResolvedValue({ type: 'github', is_active: true });
        const validResponse = responseMock();
        await saveIntegration(request({ type: 'github', config: githubConfig }), validResponse);
        expect(encryptConfig).toHaveBeenCalledWith(githubConfig);
        expect(prisma.integration.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { type_organization_id: { type: 'github', organization_id: 'org-a' } },
        }));
        expect(validResponse.status).toHaveBeenCalledWith(200);
    });

    it('performs a real GitHub test while leaving unimplemented connectors in preview', async () => {
        (prisma.integration.findFirst as jest.Mock).mockResolvedValue({ type: 'github', config: 'encrypted', is_active: true });
        (publicHttpsFetch as jest.Mock).mockResolvedValue(githubResponse());
        const githubTestResponse = responseMock();
        await testIntegration(request({ type: 'github' }), githubTestResponse);
        expect(githubTestResponse.json).toHaveBeenCalledWith(expect.objectContaining({ readiness: 'live' }));

        (prisma.integration.findFirst as jest.Mock).mockResolvedValue({ type: 'jira', config: 'encrypted', is_active: true });
        const jiraTestResponse = responseMock();
        await testIntegration(request({ type: 'jira' }), jiraTestResponse);
        expect(jiraTestResponse.json).toHaveBeenCalledWith(expect.objectContaining({
            status: 'preview',
            readiness: 'preview',
        }));
    });

    it('reports task-source readiness truthfully', async () => {
        (prisma.integration.findMany as jest.Mock).mockResolvedValue([
            { type: 'github', config: 'github-config' },
            { type: 'jira', config: 'jira-config' },
        ]);
        (decryptConfig as jest.Mock)
            .mockReturnValueOnce(githubConfig)
            .mockReturnValueOnce({ baseUrl: 'https://example.atlassian.net', projectKey: 'WFX' });
        const response = responseMock();
        await getTaskSources(request(), response);
        expect(response.json).toHaveBeenCalledWith({ sources: [
            { type: 'github', label: 'webforx/time-tracker', readiness: 'configured' },
            { type: 'jira', label: 'WFX @ example.atlassian.net', readiness: 'preview' },
        ] });
    });

    it('fails QuickBooks closed without claiming an invoice was created', async () => {
        const response = responseMock();
        await syncQuickbooks(request({ project_id: 'project-a' }), response);
        expect(response.status).toHaveBeenCalledWith(501);
        expect(response.json).toHaveBeenCalledWith({
            status: 'not_implemented',
            message: 'QuickBooks sync is not implemented. No invoice was created.',
        });
    });
});
