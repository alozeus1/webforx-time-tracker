"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncQuickbooks = exports.testIntegration = exports.saveIntegration = exports.listIntegrations = exports.getTaskSources = exports.getGithubCommits = void 0;
const db_1 = __importDefault(require("../config/db"));
const crypto_1 = require("../utils/crypto");
const getGithubCommits = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // In a real app, uses a stored GitHub PAT from the integrations table to fetch user's recent commits.
        const mockCommits = [
            { id: 'c_1xyz', message: 'fix: resolving strict mode warnings in Playwright', repo: 'webforxtech/time-tracker', timestamp: new Date().toISOString() },
            { id: 'c_2abc', message: 'feat: connecting calendar mock controller', repo: 'webforxtech/time-tracker', timestamp: new Date(Date.now() - 3600000).toISOString() }
        ];
        res.status(200).json({ commits: mockCommits });
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error while syncing GitHub' });
    }
});
exports.getGithubCommits = getGithubCommits;
const getTaskSources = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const integrations = yield db_1.default.integration.findMany({
            where: {
                type: { in: ['github', 'jira', 'linear', 'asana', 'clickup', 'trello'] },
                is_active: true,
            },
            orderBy: { type: 'asc' },
        });
        const sources = integrations.map((integration) => {
            try {
                if (integration.type === 'github') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    return { type: integration.type, label: config.repository, readiness: 'live' };
                }
                if (integration.type === 'jira') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    return { type: integration.type, label: `${config.projectKey} @ ${new URL(config.baseUrl).host}`, readiness: 'configured' };
                }
                if (integration.type === 'linear') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    return { type: integration.type, label: config.teamName, readiness: 'configured' };
                }
                if (integration.type === 'asana') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    return { type: integration.type, label: config.workspace, readiness: 'configured' };
                }
                if (integration.type === 'clickup') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    return { type: integration.type, label: config.workspaceId, readiness: 'configured' };
                }
                if (integration.type === 'trello') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    return { type: integration.type, label: config.boardId, readiness: 'configured' };
                }
            }
            catch (error) {
                return { type: integration.type, label: 'Configuration unreadable', readiness: 'error' };
            }
            return { type: integration.type, label: integration.type, readiness: 'configured' };
        });
        res.status(200).json({ sources });
    }
    catch (error) {
        console.error('Failed to load task sources:', error);
        res.status(500).json({ message: 'Internal server error while loading task sources' });
    }
});
exports.getTaskSources = getTaskSources;
const listIntegrations = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const integrations = yield db_1.default.integration.findMany({
            orderBy: { type: 'asc' },
        });
        const sanitized = integrations.map((integration) => {
            let summary = {};
            try {
                if (integration.type === 'taiga') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    summary = { username: config.username };
                }
                if (integration.type === 'mattermost') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    summary = { webhookHost: new URL(config.webhookUrl).host };
                }
                if (integration.type === 'github') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    summary = { repository: config.repository };
                }
                if (integration.type === 'jira') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    summary = { host: new URL(config.baseUrl).host, projectKey: config.projectKey };
                }
                if (integration.type === 'linear') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    summary = { teamName: config.teamName };
                }
                if (integration.type === 'asana') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    summary = { workspace: config.workspace };
                }
                if (integration.type === 'clickup') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    summary = { workspaceId: config.workspaceId };
                }
                if (integration.type === 'trello') {
                    const config = (0, crypto_1.decryptConfig)(integration.config);
                    summary = { boardId: config.boardId };
                }
            }
            catch (error) {
                summary = { status: 'Configuration unreadable' };
            }
            return {
                type: integration.type,
                is_active: integration.is_active,
                summary,
            };
        });
        res.status(200).json({ integrations: sanitized });
    }
    catch (error) {
        console.error('Failed to list integrations:', error);
        res.status(500).json({ message: 'Internal server error while loading integrations' });
    }
});
exports.listIntegrations = listIntegrations;
const saveIntegration = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
    try {
        const { type, config } = req.body;
        if (!type || !config) {
            res.status(400).json({ message: 'Integration type and config are required' });
            return;
        }
        if (!['taiga', 'mattermost', 'quickbooks', 'github', 'jira', 'linear', 'asana', 'clickup', 'trello'].includes(type)) {
            res.status(400).json({ message: 'Unsupported integration type' });
            return;
        }
        if (type === 'taiga') {
            if (!((_a = config.username) === null || _a === void 0 ? void 0 : _a.trim()) || !((_b = config.password) === null || _b === void 0 ? void 0 : _b.trim())) {
                res.status(400).json({ message: 'Taiga username and password are required' });
                return;
            }
        }
        if (type === 'mattermost') {
            if (!((_c = config.webhookUrl) === null || _c === void 0 ? void 0 : _c.trim())) {
                res.status(400).json({ message: 'Mattermost webhook URL is required' });
                return;
            }
            try {
                const url = new URL(config.webhookUrl);
                if (!['http:', 'https:'].includes(url.protocol)) {
                    throw new Error('Invalid protocol');
                }
            }
            catch (error) {
                res.status(400).json({ message: 'Mattermost webhook URL is invalid' });
                return;
            }
        }
        if (type === 'github') {
            if (!((_d = config.repository) === null || _d === void 0 ? void 0 : _d.trim()) || !((_e = config.personalAccessToken) === null || _e === void 0 ? void 0 : _e.trim())) {
                res.status(400).json({ message: 'GitHub repository and personal access token are required' });
                return;
            }
        }
        if (type === 'jira') {
            if (!((_f = config.baseUrl) === null || _f === void 0 ? void 0 : _f.trim()) || !((_g = config.email) === null || _g === void 0 ? void 0 : _g.trim()) || !((_h = config.apiToken) === null || _h === void 0 ? void 0 : _h.trim()) || !((_j = config.projectKey) === null || _j === void 0 ? void 0 : _j.trim())) {
                res.status(400).json({ message: 'Jira base URL, email, API token, and project key are required' });
                return;
            }
        }
        if (type === 'linear') {
            if (!((_k = config.apiKey) === null || _k === void 0 ? void 0 : _k.trim()) || !((_l = config.teamName) === null || _l === void 0 ? void 0 : _l.trim())) {
                res.status(400).json({ message: 'Linear API key and team name are required' });
                return;
            }
        }
        if (type === 'asana') {
            if (!((_m = config.personalAccessToken) === null || _m === void 0 ? void 0 : _m.trim()) || !((_o = config.workspace) === null || _o === void 0 ? void 0 : _o.trim())) {
                res.status(400).json({ message: 'Asana personal access token and workspace are required' });
                return;
            }
        }
        if (type === 'clickup') {
            if (!((_p = config.apiKey) === null || _p === void 0 ? void 0 : _p.trim()) || !((_q = config.workspaceId) === null || _q === void 0 ? void 0 : _q.trim())) {
                res.status(400).json({ message: 'ClickUp API key and workspace ID are required' });
                return;
            }
        }
        if (type === 'trello') {
            if (!((_r = config.apiKey) === null || _r === void 0 ? void 0 : _r.trim()) || !((_s = config.token) === null || _s === void 0 ? void 0 : _s.trim()) || !((_t = config.boardId) === null || _t === void 0 ? void 0 : _t.trim())) {
                res.status(400).json({ message: 'Trello API key, token, and board ID are required' });
                return;
            }
        }
        const integration = yield db_1.default.integration.upsert({
            where: { type },
            update: {
                config: (0, crypto_1.encryptConfig)(config),
                is_active: true,
            },
            create: {
                type,
                config: (0, crypto_1.encryptConfig)(config),
                is_active: true,
            },
        });
        if ((_u = req.user) === null || _u === void 0 ? void 0 : _u.userId) {
            try {
                yield db_1.default.auditLog.create({
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
            }
            catch (error) {
                console.error('Failed to write integration save audit log:', error);
            }
        }
        res.status(200).json({
            type: integration.type,
            is_active: integration.is_active,
            message: `${integration.type} integration saved successfully`,
        });
    }
    catch (error) {
        console.error('Failed to save integration:', error);
        res.status(500).json({ message: 'Internal server error while saving integration' });
    }
});
exports.saveIntegration = saveIntegration;
const testIntegration = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { type } = req.body;
        if (!type || !['taiga', 'mattermost', 'github', 'jira', 'linear', 'asana', 'clickup', 'trello'].includes(type)) {
            res.status(400).json({ message: 'Supported test types are taiga, mattermost, github, jira, linear, asana, clickup, and trello' });
            return;
        }
        const integration = yield db_1.default.integration.findUnique({ where: { type } });
        if (!integration || !integration.is_active) {
            res.status(404).json({ message: `${type} integration is not configured` });
            return;
        }
        if (type === 'mattermost') {
            const config = (0, crypto_1.decryptConfig)(integration.config);
            const response = yield fetch(config.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `Web Forx Time Tracker integration test at ${new Date().toISOString()}`,
                }),
            });
            if (!response.ok) {
                const body = yield response.text();
                res.status(400).json({ message: `Mattermost webhook test failed (${response.status}): ${body || 'No response body'}` });
                return;
            }
            if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) {
                try {
                    yield db_1.default.auditLog.create({
                        data: {
                            user_id: req.user.userId,
                            action: 'integration_tested',
                            resource: 'integration',
                            metadata: { type: 'mattermost', result: 'success' },
                        },
                    });
                }
                catch (error) {
                    console.error('Failed to write mattermost test audit log:', error);
                }
            }
            res.status(200).json({ status: 'success', message: 'Mattermost webhook test delivered successfully' });
            return;
        }
        if (['github', 'jira', 'linear', 'asana', 'clickup', 'trello'].includes(type)) {
            if ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId) {
                try {
                    yield db_1.default.auditLog.create({
                        data: {
                            user_id: req.user.userId,
                            action: 'integration_tested',
                            resource: 'integration',
                            metadata: { type, result: 'configured' },
                        },
                    });
                }
                catch (error) {
                    console.error(`Failed to write ${type} test audit log:`, error);
                }
            }
            res.status(200).json({
                status: 'success',
                message: `${type} connector saved and ready for workday suggestions.`,
            });
            return;
        }
        const config = (0, crypto_1.decryptConfig)(integration.config);
        const response = yield fetch('https://api.taiga.io/api/v1/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'normal',
                username: config.username,
                password: config.password,
            }),
        });
        if (!response.ok) {
            const body = yield response.text();
            res.status(400).json({ message: `Taiga credential test failed (${response.status}): ${body || 'No response body'}` });
            return;
        }
        const payload = yield response.json().catch(() => ({}));
        if (!(payload === null || payload === void 0 ? void 0 : payload.auth_token)) {
            res.status(400).json({ message: 'Taiga credential test failed: auth token missing from response' });
            return;
        }
        if ((_c = req.user) === null || _c === void 0 ? void 0 : _c.userId) {
            try {
                yield db_1.default.auditLog.create({
                    data: {
                        user_id: req.user.userId,
                        action: 'integration_tested',
                        resource: 'integration',
                        metadata: { type: 'taiga', result: 'success' },
                    },
                });
            }
            catch (error) {
                console.error('Failed to write taiga test audit log:', error);
            }
        }
        res.status(200).json({ status: 'success', message: 'Taiga credentials validated successfully' });
    }
    catch (error) {
        console.error('Failed to test integration:', error);
        res.status(500).json({ message: 'Internal server error while testing integration' });
    }
});
exports.testIntegration = testIntegration;
const syncQuickbooks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // In a real app, groups recent approved timesheets and POSTs an invoice to Intuit Quickbooks API
        const { project_id } = req.body;
        console.log(`[Integration Worker] Mock syncing invoice for project ${project_id} to QuickBooks...`);
        res.status(200).json({ message: 'Timesheets successfully synced as draft invoices in QuickBooks', status: 'success' });
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error while syncing QuickBooks' });
    }
});
exports.syncQuickbooks = syncQuickbooks;
