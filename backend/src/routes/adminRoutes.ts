import { Router } from 'express';
import { getAuditLogs, getSystemNotifications } from '../controllers/adminController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['Admin']));

router.get('/audit-logs', getAuditLogs);
router.get('/notifications', getSystemNotifications);

export default router;
