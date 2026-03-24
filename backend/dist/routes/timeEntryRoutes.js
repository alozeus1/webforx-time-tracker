"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const timeEntryController_1 = require("../controllers/timeEntryController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateToken);
router.post('/start', timeEntryController_1.startTimer);
router.post('/stop', timeEntryController_1.stopTimer);
router.post('/manual', timeEntryController_1.manualEntry);
router.get('/me', timeEntryController_1.getMyEntries);
router.post('/ping', timeEntryController_1.pingTimer);
// Manager/Admin endpoints
router.get('/approvals', (0, auth_1.requireRole)(['Manager', 'Admin']), timeEntryController_1.getPendingTimesheets);
router.post('/approvals/:entryId', (0, auth_1.requireRole)(['Manager', 'Admin']), timeEntryController_1.reviewTimesheet);
exports.default = router;
