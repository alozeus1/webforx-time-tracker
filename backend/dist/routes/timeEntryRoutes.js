"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const timeEntryController_1 = require("../controllers/timeEntryController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
// Must be registered before authenticateToken — navigator.sendBeacon cannot set headers.
// Auth is handled inside the controller by reading the token from the request body.
router.post('/pause-beacon', timeEntryController_1.pauseBeacon);
router.use(auth_1.authenticateToken);
router.post('/start', timeEntryController_1.startTimer);
router.post('/stop', timeEntryController_1.stopTimer);
router.post('/pause', timeEntryController_1.pauseTimer);
router.post('/resume', timeEntryController_1.resumeTimer);
router.post('/manual', timeEntryController_1.manualEntry);
router.get('/me', timeEntryController_1.getMyEntries);
router.post('/ping', timeEntryController_1.pingTimer);
router.put('/:id', timeEntryController_1.updateEntry);
router.delete('/:id', timeEntryController_1.deleteEntry);
router.post('/:id/duplicate', timeEntryController_1.duplicateEntry);
// Manager/Admin endpoints
router.get('/approvals', (0, auth_1.requireRole)(['Manager', 'Admin']), timeEntryController_1.getPendingTimesheets);
router.post('/approvals/:entryId', (0, auth_1.requireRole)(['Manager', 'Admin']), timeEntryController_1.reviewTimesheet);
exports.default = router;
