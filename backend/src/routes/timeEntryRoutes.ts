import { Router } from 'express';
import { startTimer, stopTimer, pauseTimer, resumeTimer, manualEntry, getMyEntries, pingTimer, getPendingTimesheets, reviewTimesheet, updateEntry, deleteEntry, duplicateEntry } from '../controllers/timeEntryController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken);

router.post('/start', startTimer);
router.post('/stop', stopTimer);
router.post('/pause', pauseTimer);
router.post('/resume', resumeTimer);
router.post('/manual', manualEntry);
router.get('/me', getMyEntries);
router.post('/ping', pingTimer);
router.put('/:id', updateEntry);
router.delete('/:id', deleteEntry);
router.post('/:id/duplicate', duplicateEntry);

// Manager/Admin endpoints
router.get('/approvals', requireRole(['Manager', 'Admin']), getPendingTimesheets);
router.post('/approvals/:entryId', requireRole(['Manager', 'Admin']), reviewTimesheet);

export default router;
