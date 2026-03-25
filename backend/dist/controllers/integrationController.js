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
exports.syncQuickbooks = exports.testIntegration = exports.saveIntegration = exports.listIntegrations = exports.getGithubCommits = void 0;
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
    var _a, _b, _c, _d;
    try {
        const { type, config } = req.body;
        if (!type || !config) {
            res.status(400).json({ message: 'Integration type and config are required' });
            return;
        }
        if (!['taiga', 'mattermost', 'quickbooks'].includes(type)) {
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
        if ((_d = req.user) === null || _d === void 0 ? void 0 : _d.userId) {
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
    var _a, _b;
    try {
        const { type } = req.body;
        if (!type || !['taiga', 'mattermost'].includes(type)) {
            res.status(400).json({ message: 'Supported test types are taiga and mattermost' });
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
        if ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId) {
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
