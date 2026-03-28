import { Router } from 'express';
import { listScheduledReports, createScheduledReport, updateScheduledReport, deleteScheduledReport } from '../controllers/scheduledReportController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', listScheduledReports);
router.post('/', requireRole(['Admin', 'Manager']), createScheduledReport);
router.put('/:id', requireRole(['Admin', 'Manager']), updateScheduledReport);
router.delete('/:id', requireRole(['Admin', 'Manager']), deleteScheduledReport);

export default router;
