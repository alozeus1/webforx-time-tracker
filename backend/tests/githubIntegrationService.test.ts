jest.mock('../src/utils/outboundHttp', () => ({
    publicHttpsFetch: jest.fn(),
}));

import { publicHttpsFetch } from '../src/utils/outboundHttp';
import {
    fetchGitHubCommits,
    GitHubIntegrationError,
    normalizeGitHubRepository,
} from '../src/services/githubIntegrationService';

const fetchMock = publicHttpsFetch as jest.Mock;
const token = 't'.repeat(40);

describe('GitHub integration service', () => {
    beforeEach(() => jest.clearAllMocks());

    it('accepts only owner/repository identifiers', () => {
        expect(normalizeGitHubRepository(' webforx/time-tracker ')).toBe('webforx/time-tracker');
        expect(() => normalizeGitHubRepository('https://github.com/webforx/time-tracker')).toThrow(/owner\/repository/);
        expect(() => normalizeGitHubRepository('webforx/time-tracker.git')).toThrow(/owner\/repository/);
        expect(() => normalizeGitHubRepository('../secrets')).toThrow(GitHubIntegrationError);
    });

    it('requests GitHub with a bearer credential and returns sanitized commit fields', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify([{
            sha: 'abc123',
            html_url: 'https://github.com/webforx/time-tracker/commit/abc123',
            commit: { message: 'feat: live integration\n\nDetails', author: { name: 'Developer', date: '2026-08-10T12:00:00Z' } },
            author: { login: 'octocat' },
        }]), { status: 200, headers: { 'content-type': 'application/json' } }));

        await expect(fetchGitHubCommits({ repository: 'webforx/time-tracker', personalAccessToken: token }))
            .resolves.toEqual([{
                id: 'abc123',
                message: 'feat: live integration',
                repo: 'webforx/time-tracker',
                timestamp: '2026-08-10T12:00:00Z',
                url: 'https://github.com/webforx/time-tracker/commit/abc123',
                author: 'octocat',
            }]);

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://api.github.com/repos/webforx/time-tracker/commits?per_page=10');
        expect(init.headers).toMatchObject({
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
        });
    });

    it('maps authentication, repository access, and rate limits without returning upstream bodies', async () => {
        fetchMock.mockResolvedValueOnce(new Response('credential details', { status: 401 }));
        await expect(fetchGitHubCommits({ repository: 'webforx/time-tracker', personalAccessToken: token }))
            .rejects.toMatchObject({ code: 'authentication' });

        fetchMock.mockResolvedValueOnce(new Response('private repo details', { status: 404 }));
        await expect(fetchGitHubCommits({ repository: 'webforx/time-tracker', personalAccessToken: token }))
            .rejects.toMatchObject({ code: 'not_found' });

        fetchMock.mockResolvedValueOnce(new Response('rate details', {
            status: 403,
            headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1893456000' },
        }));
        await expect(fetchGitHubCommits({ repository: 'webforx/time-tracker', personalAccessToken: token }))
            .rejects.toMatchObject({ code: 'rate_limited', retryAt: '2030-01-01T00:00:00.000Z' });
    });

    it('rejects malformed success payloads', async () => {
        fetchMock.mockResolvedValue(new Response('{"message":"unexpected"}', { status: 200 }));
        await expect(fetchGitHubCommits({ repository: 'webforx/time-tracker', personalAccessToken: token }))
            .rejects.toMatchObject({ code: 'upstream' });
    });
});
