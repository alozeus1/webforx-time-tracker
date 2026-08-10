import { publicHttpsFetch } from '../utils/outboundHttp';

const GITHUB_API_ORIGIN = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const REPOSITORY_PATTERN = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9_.-]{1,100})$/;

export interface GitHubConfig {
    repository: string;
    personalAccessToken: string;
}

export interface GitHubCommitSummary {
    id: string;
    message: string;
    repo: string;
    timestamp: string;
    url: string;
    author: string | null;
}

export class GitHubIntegrationError extends Error {
    constructor(
        public readonly code: 'invalid_config' | 'authentication' | 'not_found' | 'rate_limited' | 'upstream',
        message: string,
        public readonly retryAt?: string,
    ) {
        super(message);
        this.name = 'GitHubIntegrationError';
    }
}

export const normalizeGitHubRepository = (value: string): string => {
    const repository = value.trim();
    const match = REPOSITORY_PATTERN.exec(repository);
    if (!match || ['.', '..'].includes(match[2]) || match[2].endsWith('.git')) {
        throw new GitHubIntegrationError(
            'invalid_config',
            'GitHub repository must use the owner/repository format without a URL or .git suffix.',
        );
    }
    return `${match[1]}/${match[2]}`;
};

export const validateGitHubToken = (value: string): string => {
    const token = value.trim();
    if (token.length < 20 || token.length > 255 || /\s/.test(token)) {
        throw new GitHubIntegrationError('invalid_config', 'GitHub token format is invalid.');
    }
    return token;
};

const rateLimitReset = (response: Response): string | undefined => {
    const raw = response.headers.get('x-ratelimit-reset');
    if (!raw || !/^\d+$/.test(raw)) return undefined;
    const parsed = new Date(Number(raw) * 1000);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

export const fetchGitHubCommits = async (
    config: GitHubConfig,
    options: { limit?: number } = {},
): Promise<GitHubCommitSummary[]> => {
    const repository = normalizeGitHubRepository(config.repository);
    const token = validateGitHubToken(config.personalAccessToken);

    const limit = Math.min(Math.max(options.limit ?? 10, 1), 30);
    const [owner, repo] = repository.split('/');
    let response: Response;
    try {
        response = await publicHttpsFetch(
            `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=${limit}`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/vnd.github+json',
                    Authorization: `Bearer ${token}`,
                    'User-Agent': 'webforx-time-tracker',
                    'X-GitHub-Api-Version': GITHUB_API_VERSION,
                },
            },
        );
    } catch {
        throw new GitHubIntegrationError('upstream', 'GitHub API request failed or timed out.');
    }

    if (response.status === 401) {
        throw new GitHubIntegrationError('authentication', 'GitHub rejected the stored credential.');
    }
    if (response.status === 404) {
        throw new GitHubIntegrationError('not_found', 'GitHub repository was not found or is not accessible to this credential.');
    }
    if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) {
        throw new GitHubIntegrationError('rate_limited', 'GitHub API rate limit reached.', rateLimitReset(response));
    }
    if (!response.ok) {
        throw new GitHubIntegrationError('upstream', `GitHub API request failed with status ${response.status}.`);
    }

    const payload = await response.json().catch(() => null) as Array<{
        sha?: unknown;
        html_url?: unknown;
        commit?: {
            message?: unknown;
            author?: { name?: unknown; date?: unknown } | null;
        };
        author?: { login?: unknown } | null;
    }> | null;

    if (!Array.isArray(payload)) {
        throw new GitHubIntegrationError('upstream', 'GitHub returned an invalid commit response.');
    }

    return payload.flatMap((item) => {
        const sha = typeof item.sha === 'string' ? item.sha : '';
        const message = typeof item.commit?.message === 'string' ? item.commit.message : '';
        const timestamp = typeof item.commit?.author?.date === 'string' ? item.commit.author.date : '';
        const url = typeof item.html_url === 'string' ? item.html_url : '';
        if (!sha || !message || !timestamp || !url) return [];

        return [{
            id: sha,
            message: message.split('\n')[0],
            repo: repository,
            timestamp,
            url,
            author: typeof item.author?.login === 'string'
                ? item.author.login
                : (typeof item.commit?.author?.name === 'string' ? item.commit.author.name : null),
        }];
    });
};
