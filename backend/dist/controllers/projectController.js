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
exports.deleteProject = exports.getProjectBudgets = exports.updateProject = exports.createProject = exports.searchProjectsAndTasks = exports.getAllProjects = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = __importDefault(require("../config/db"));
const UPLOADS_DIR = path_1.default.join(__dirname, '../../uploads/projects');
if (!fs_1.default.existsSync(UPLOADS_DIR)) {
    fs_1.default.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const getAllProjects = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const projects = yield db_1.default.project.findMany({
            where: { is_active: true },
            include: {
                _count: {
                    select: { members: true },
                },
                time_entries: {
                    select: { duration: true, status: true, user: { select: { hourly_rate: true } } }
                }
            },
        });
        // Compute current burn
        const enrichedProjects = projects.map(p => {
            let totalSeconds = 0;
            let totalCost = 0;
            p.time_entries.forEach(t => {
                var _a;
                totalSeconds += t.duration;
                const rate = parseFloat(((_a = t.user.hourly_rate) === null || _a === void 0 ? void 0 : _a.toString()) || '0');
                totalCost += (t.duration / 3600) * rate;
            });
            return Object.assign(Object.assign({}, p), { hours_burned: totalSeconds / 3600, cost_burned: totalCost, time_entries: undefined // remove heavy nested objects for standard payload
             });
        });
        res.status(200).json(enrichedProjects);
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getAllProjects = getAllProjects;
const searchProjectsAndTasks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        if (query.length < 2) {
            res.status(200).json({ query, projects: [], tasks: [] });
            return;
        }
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const role = (_b = req.user) === null || _b === void 0 ? void 0 : _b.role;
        const canViewAll = role === 'Manager' || role === 'Admin';
        const [projects, tasks] = yield Promise.all([
            db_1.default.project.findMany({
                where: {
                    is_active: true,
                    name: { contains: query, mode: 'insensitive' },
                },
                select: { id: true, name: true },
                orderBy: { name: 'asc' },
                take: 8,
            }),
            db_1.default.timeEntry.findMany({
                where: Object.assign(Object.assign({}, (canViewAll ? {} : { user_id: userId })), { task_description: { contains: query, mode: 'insensitive' } }),
                select: {
                    task_description: true,
                    project: { select: { id: true, name: true } },
                },
                orderBy: { updated_at: 'desc' },
                distinct: ['task_description'],
                take: 8,
            }),
        ]);
        res.status(200).json({
            query,
            projects,
            tasks: tasks.map((task) => ({
                name: task.task_description,
                project: task.project ? { id: task.project.id, name: task.project.name } : null,
            })),
        });
    }
    catch (error) {
        console.error('Failed to search projects and tasks:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.searchProjectsAndTasks = searchProjectsAndTasks;
const createProject = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, description, budget_hours, budget_amount, logo_data } = req.body;
        const existingProject = yield db_1.default.project.findUnique({ where: { name } });
        if (existingProject) {
            res.status(400).json({ message: 'Project with this name already exists' });
            return;
        }
        let logo_url = null;
        if (typeof logo_data === 'string' && logo_data.startsWith('data:image/')) {
            const matches = logo_data.match(/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,(.+)$/);
            if (matches) {
                const ext = matches[1].replace('+xml', '');
                const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                fs_1.default.writeFileSync(path_1.default.join(UPLOADS_DIR, fileName), Buffer.from(matches[2], 'base64'));
                logo_url = `/uploads/projects/${fileName}`;
            }
        }
        const newProject = yield db_1.default.project.create({
            data: {
                name,
                description,
                logo_url,
                budget_hours: budget_hours ? parseInt(budget_hours) : null,
                budget_amount: budget_amount ? parseFloat(budget_amount) : null,
            },
        });
        if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) {
            try {
                yield db_1.default.auditLog.create({
                    data: {
                        user_id: req.user.userId,
                        action: 'project_created',
                        resource: 'project',
                        metadata: {
                            project_id: newProject.id,
                            project_name: newProject.name,
                        },
                    },
                });
            }
            catch (error) {
                console.error('Failed to write project creation audit log:', error);
            }
        }
        res.status(201).json(newProject);
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.createProject = createProject;
const updateProject = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const projectId = req.params.id;
        const { name, description, budget_hours, budget_amount, logo_data, is_active } = req.body;
        const updateData = {};
        if (typeof name === 'string' && name.trim())
            updateData.name = name.trim();
        if (typeof description === 'string')
            updateData.description = description;
        if (typeof is_active === 'boolean')
            updateData.is_active = is_active;
        if (budget_hours !== undefined)
            updateData.budget_hours = budget_hours ? parseInt(budget_hours) : null;
        if (budget_amount !== undefined)
            updateData.budget_amount = budget_amount ? parseFloat(budget_amount) : null;
        if (typeof logo_data === 'string' && logo_data.startsWith('data:image/')) {
            const matches = logo_data.match(/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,(.+)$/);
            if (matches) {
                const ext = matches[1].replace('+xml', '');
                const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                fs_1.default.writeFileSync(path_1.default.join(UPLOADS_DIR, fileName), Buffer.from(matches[2], 'base64'));
                updateData.logo_url = `/uploads/projects/${fileName}`;
            }
        }
        else if (logo_data === null) {
            updateData.logo_url = null;
        }
        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ message: 'No valid fields provided' });
            return;
        }
        const updated = yield db_1.default.project.update({
            where: { id: projectId },
            data: updateData,
        });
        if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) {
            try {
                yield db_1.default.auditLog.create({
                    data: {
                        user_id: req.user.userId,
                        action: 'project_updated',
                        resource: 'project',
                        metadata: { project_id: projectId, updated_fields: Object.keys(updateData) },
                    },
                });
            }
            catch (error) {
                console.error('Failed to write project update audit log:', error);
            }
        }
        res.status(200).json(updated);
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.updateProject = updateProject;
const getProjectBudgets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const projects = yield db_1.default.project.findMany({
            where: { is_active: true },
            select: {
                id: true,
                name: true,
                budget_hours: true,
                budget_amount: true,
                time_entries: {
                    select: { duration: true, user: { select: { hourly_rate: true } } },
                },
            },
        });
        const budgets = projects.map(project => {
            const totalSeconds = project.time_entries.reduce((sum, e) => sum + e.duration, 0);
            const totalHours = totalSeconds / 3600;
            const totalCost = project.time_entries.reduce((sum, e) => {
                var _a;
                const rate = parseFloat(((_a = e.user.hourly_rate) === null || _a === void 0 ? void 0 : _a.toString()) || '0');
                return sum + (e.duration / 3600) * rate;
            }, 0);
            const hoursUsedPct = project.budget_hours
                ? Math.round((totalHours / project.budget_hours) * 100)
                : null;
            const amountUsedPct = project.budget_amount
                ? Math.round((totalCost / parseFloat(project.budget_amount.toString())) * 100)
                : null;
            return {
                id: project.id,
                name: project.name,
                budget_hours: project.budget_hours,
                budget_amount: project.budget_amount ? parseFloat(project.budget_amount.toString()) : null,
                hours_used: parseFloat(totalHours.toFixed(1)),
                hours_used_pct: hoursUsedPct,
                amount_used: parseFloat(totalCost.toFixed(2)),
                amount_used_pct: amountUsedPct,
                over_budget: (hoursUsedPct !== null && hoursUsedPct > 100) || (amountUsedPct !== null && amountUsedPct > 100),
            };
        });
        res.status(200).json({ budgets });
    }
    catch (error) {
        console.error('Failed to fetch project budgets:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getProjectBudgets = getProjectBudgets;
const deleteProject = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const projectId = req.params.id;
        yield db_1.default.project.update({
            where: { id: projectId },
            data: { is_active: false },
        });
        if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) {
            try {
                yield db_1.default.auditLog.create({
                    data: {
                        user_id: req.user.userId,
                        action: 'project_deleted',
                        resource: 'project',
                        metadata: { project_id: projectId },
                    },
                });
            }
            catch (error) {
                console.error('Failed to write project deletion audit log:', error);
            }
        }
        res.status(200).json({ message: 'Project deactivated successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.deleteProject = deleteProject;
