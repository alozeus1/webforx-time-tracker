import { Router } from 'express';
import { createShareLink, exportTimeEntries, getAnalyticsDashboard, getOperationsDashboard } from '../controllers/reportController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken);
router.get('/export', exportTimeEntries);
router.get('/dashboard', getAnalyticsDashboard);
router.get('/operations', requireRole(['Manager', 'Admin']), getOperationsDashboard);
router.post('/share', requireRole(['Manager', 'Admin']), createShareLink);

export default router;
