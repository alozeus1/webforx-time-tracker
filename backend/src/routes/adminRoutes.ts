import { Router } from 'express';
import { deleteSystemNotification, getAuditLogs, getSystemNotifications } from '../controllers/adminController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken);

router.get('/audit-logs', requireRole(['Admin']), getAuditLogs);
router.get('/notifications', requireRole(['Admin', 'Manager']), getSystemNotifications);
router.delete('/notifications/:notificationId', requireRole(['Admin', 'Manager']), deleteSystemNotification);

export default router;
