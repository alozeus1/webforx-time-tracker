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
exports.deleteTemplate = exports.createProjectFromTemplate = exports.createTemplate = exports.listTemplates = void 0;
const db_1 = __importDefault(require("../config/db"));
const http_1 = require("../utils/http");
const parseOptionalInteger = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
};
const parseOptionalNumber = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
};
const listTemplates = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const templates = yield db_1.default.projectTemplate.findMany({
            orderBy: { name: 'asc' },
            include: { creator: { select: { first_name: true, last_name: true } } },
        });
        res.status(200).json({ templates });
    }
    catch (error) {
        console.error('Failed to list templates:', error);
        (0, http_1.sendApiError)(res, 500, 'TEMPLATE_LIST_FAILED', 'Internal server error');
    }
});
exports.listTemplates = listTemplates;
const createTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            (0, http_1.sendApiError)(res, 401, 'AUTH_REQUIRED', 'Authenticated user required');
            return;
        }
        const name = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.name) === 'string' ? req.body.name.trim() : '';
        if (!name) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'Template name is required');
            return;
        }
        const budgetHours = parseOptionalInteger((_c = req.body) === null || _c === void 0 ? void 0 : _c.budget_hours);
        if (((_d = req.body) === null || _d === void 0 ? void 0 : _d.budget_hours) !== undefined && budgetHours === null) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'budget_hours must be a valid integer');
            return;
        }
        const budgetAmount = parseOptionalNumber((_e = req.body) === null || _e === void 0 ? void 0 : _e.budget_amount);
        if (((_f = req.body) === null || _f === void 0 ? void 0 : _f.budget_amount) !== undefined && budgetAmount === null) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'budget_amount must be a valid number');
            return;
        }
        const existing = yield db_1.default.projectTemplate.findUnique({ where: { name } });
        if (existing) {
            (0, http_1.sendApiError)(res, 409, 'TEMPLATE_EXISTS', 'Template name already exists');
            return;
        }
        const template = yield db_1.default.projectTemplate.create({
            data: {
                name,
                description: typeof ((_g = req.body) === null || _g === void 0 ? void 0 : _g.description) === 'string' && req.body.description.trim() ? req.body.description.trim() : null,
                default_billable: req.body.default_billable !== false,
                budget_hours: budgetHours,
                budget_amount: budgetAmount,
                tag_ids: Array.isArray(req.body.tag_ids) ? req.body.tag_ids : [],
                created_by: userId,
            },
        });
        res.status(201).json(template);
    }
    catch (error) {
        console.error('Failed to create template:', error);
        (0, http_1.sendApiError)(res, 500, 'TEMPLATE_CREATE_FAILED', 'Internal server error');
    }
});
exports.createTemplate = createTemplate;
const createProjectFromTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const templateId = req.params.id;
        const template = yield db_1.default.projectTemplate.findUnique({ where: { id: templateId } });
        if (!template) {
            (0, http_1.sendApiError)(res, 404, 'TEMPLATE_NOT_FOUND', 'Template not found');
            return;
        }
        const projectName = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.name) === 'string' ? req.body.name.trim() : '';
        if (!projectName) {
            (0, http_1.sendApiError)(res, 400, 'VALIDATION_ERROR', 'Project name is required');
            return;
        }
        const existingProject = yield db_1.default.project.findUnique({ where: { name: projectName } });
        if (existingProject) {
            (0, http_1.sendApiError)(res, 409, 'PROJECT_EXISTS', 'Project name already exists');
            return;
        }
        const project = yield db_1.default.project.create({
            data: {
                name: projectName,
                description: template.description,
                budget_hours: template.budget_hours,
                budget_amount: template.budget_amount,
            },
        });
        res.status(201).json(project);
    }
    catch (error) {
        console.error('Failed to create project from template:', error);
        (0, http_1.sendApiError)(res, 500, 'TEMPLATE_APPLY_FAILED', 'Internal server error');
    }
});
exports.createProjectFromTemplate = createProjectFromTemplate;
const deleteTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const templateId = req.params.id;
        yield db_1.default.projectTemplate.delete({ where: { id: templateId } });
        res.status(200).json({ message: 'Template deleted' });
    }
    catch (error) {
        if (error.code === 'P2025') {
            (0, http_1.sendApiError)(res, 404, 'TEMPLATE_NOT_FOUND', 'Template not found');
            return;
        }
        console.error('Failed to delete template:', error);
        (0, http_1.sendApiError)(res, 500, 'TEMPLATE_DELETE_FAILED', 'Internal server error');
    }
});
exports.deleteTemplate = deleteTemplate;
