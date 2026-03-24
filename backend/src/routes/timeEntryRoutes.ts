import { Router } from 'express';
import { startTimer, stopTimer, manualEntry, getMyEntries, pingTimer, getPendingTimesheets, reviewTimesheet } from '../controllers/timeEntryController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken);

router.post('/start', startTimer);
router.post('/stop', stopTimer);
router.post('/manual', manualEntry);
router.get('/me', getMyEntries);
router.post('/ping', pingTimer);

// Manager/Admin endpoints
router.get('/approvals', requireRole(['Manager', 'Admin']), getPendingTimesheets);
router.post('/approvals/:entryId', requireRole(['Manager', 'Admin']), reviewTimesheet);

export default router;
