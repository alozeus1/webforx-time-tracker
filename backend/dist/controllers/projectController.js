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
exports.createProject = exports.getAllProjects = void 0;
const db_1 = __importDefault(require("../config/db"));
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
const createProject = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, description, budget_hours, budget_amount } = req.body;
        const existingProject = yield db_1.default.project.findUnique({ where: { name } });
        if (existingProject) {
            res.status(400).json({ message: 'Project with this name already exists' });
            return;
        }
        const newProject = yield db_1.default.project.create({
            data: {
                name,
                description,
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
