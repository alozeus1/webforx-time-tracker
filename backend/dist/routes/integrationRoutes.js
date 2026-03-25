"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const integrationController_1 = require("../controllers/integrationController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateToken);
// Individual developer integrations
router.get('/github/commits', integrationController_1.getGithubCommits);
router.get('/', (0, auth_1.requireRole)(['Admin', 'Manager']), integrationController_1.listIntegrations);
router.post('/', (0, auth_1.requireRole)(['Admin']), integrationController_1.saveIntegration);
router.post('/test', (0, auth_1.requireRole)(['Admin', 'Manager']), integrationController_1.testIntegration);
// Organization-level integrations (Managers/Admins only)
router.post('/quickbooks/sync', (0, auth_1.requireRole)(['Admin', 'Manager']), integrationController_1.syncQuickbooks);
exports.default = router;
