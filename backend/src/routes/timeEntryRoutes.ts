import { Router } from 'express';
import { startTimer, stopTimer, pauseTimer, resumeTimer, manualEntry, getMyEntries, getActiveTimer, pingTimer, pauseBeacon, getPendingTimesheets, reviewTimesheet, updateEntry, deleteEntry, duplicateEntry, createCorrectionRequest, getCorrectionRequestsForReview, getMyCorrectionRequests, reviewCorrectionRequest, bulkUpdateEntries, purgeResolvedCorrectionsController, reviewTimesheetsBulk, getRecoveryQuota, acknowledgeAutoStop, getDailyUsageSummary } from '../controllers/timeEntryController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

// Must be registered before authenticateToken — navigator.sendBeacon cannot set headers.
// Auth is handled inside the controller by reading the token from the request body.
router.post('/pause-beacon', pauseBeacon);

router.use(authenticateToken);

router.post('/start', startTimer);
router.post('/stop', stopTimer);
router.post('/pause', pauseTimer);
router.post('/resume', resumeTimer);
router.post('/manual', manualEntry);
router.get('/me', getMyEntries);
// Polled every couple of minutes by the client heartbeat; deliberately lean — see getActiveTimer.
router.get('/active', getActiveTimer);
router.post('/ping', pingTimer);
router.get('/corrections', getMyCorrectionRequests);
// Read before the form is filled in, so the user sees their allowance up front.
router.get('/recovery-quota', getRecoveryQuota);
// Drives the daily-goal bar, which must render whether or not a timer is running.
router.get('/daily-usage', getDailyUsageSummary);
router.post('/corrections', createCorrectionRequest);
// NOTE: router.post('/correction', ...) was a typo/duplicate — removed.
router.get('/corrections/review', requireRole(['Manager', 'Admin']), getCorrectionRequestsForReview);
router.post('/corrections/:correctionId/review', requireRole(['Manager', 'Admin']), reviewCorrectionRequest);
router.post('/corrections/purge-resolved', requireRole(['Manager', 'Admin']), purgeResolvedCorrectionsController);

// Manager/Admin endpoints
router.get('/approvals', requireRole(['Manager', 'Admin']), getPendingTimesheets);
// Registered BEFORE '/approvals/:entryId' so Express does not match "bulk" as an entryId.
router.post('/approvals/bulk', requireRole(['Manager', 'Admin']), reviewTimesheetsBulk);
router.post('/approvals/:entryId', requireRole(['Manager', 'Admin']), reviewTimesheet);

router.patch('/bulk', bulkUpdateEntries);
router.put('/:id', updateEntry);
router.delete('/:id', deleteEntry);
router.post('/:id/duplicate', duplicateEntry);
router.post('/:id/ack-auto-stop', acknowledgeAutoStop);

export default router;
