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
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.listTemplates = listTemplates;
const createTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            res.status(401).json({ message: 'Authenticated user required' });
            return;
        }
        const name = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.name) === 'string' ? req.body.name.trim() : '';
        if (!name) {
            res.status(400).json({ message: 'Template name is required' });
            return;
        }
        const existing = yield db_1.default.projectTemplate.findUnique({ where: { name } });
        if (existing) {
            res.status(409).json({ message: 'Template name already exists' });
            return;
        }
        const template = yield db_1.default.projectTemplate.create({
            data: {
                name,
                description: req.body.description || null,
                default_billable: req.body.default_billable !== false,
                budget_hours: req.body.budget_hours ? parseInt(req.body.budget_hours) : null,
                budget_amount: req.body.budget_amount ? parseFloat(req.body.budget_amount) : null,
                tag_ids: Array.isArray(req.body.tag_ids) ? req.body.tag_ids : [],
                created_by: userId,
            },
        });
        res.status(201).json(template);
    }
    catch (error) {
        console.error('Failed to create template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.createTemplate = createTemplate;
const createProjectFromTemplate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const templateId = req.params.id;
        const template = yield db_1.default.projectTemplate.findUnique({ where: { id: templateId } });
        if (!template) {
            res.status(404).json({ message: 'Template not found' });
            return;
        }
        const projectName = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.name) === 'string' ? req.body.name.trim() : '';
        if (!projectName) {
            res.status(400).json({ message: 'Project name is required' });
            return;
        }
        const existingProject = yield db_1.default.project.findUnique({ where: { name: projectName } });
        if (existingProject) {
            res.status(409).json({ message: 'Project name already exists' });
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
        res.status(500).json({ message: 'Internal server error' });
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
            res.status(404).json({ message: 'Template not found' });
            return;
        }
        console.error('Failed to delete template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.deleteTemplate = deleteTemplate;
