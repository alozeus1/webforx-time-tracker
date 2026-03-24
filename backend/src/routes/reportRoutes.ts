import { Router } from 'express';
import { exportTimeEntries, getAnalyticsDashboard } from '../controllers/reportController';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken);
router.get('/export', exportTimeEntries);
router.get('/dashboard', getAnalyticsDashboard);

export default router;
