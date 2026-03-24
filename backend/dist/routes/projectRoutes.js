"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const projectController_1 = require("../controllers/projectController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticateToken, projectController_1.getAllProjects);
router.post('/', auth_1.authenticateToken, (0, auth_1.requireRole)(['Admin']), projectController_1.createProject);
exports.default = router;
