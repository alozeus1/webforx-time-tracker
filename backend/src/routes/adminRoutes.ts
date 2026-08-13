import { Router } from 'express';
import { createTeam, deleteSystemNotification, getAuditLogs, getOrgSettings, getSystemNotifications, getTeams, getTimerPolicy, updateOrgSettings, updateTeam, updateTimerPolicy, grantRecoveryOverride } from '../controllers/adminController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken);

router.get('/audit-logs', requireRole(['Admin']), getAuditLogs);
router.get('/notifications', requireRole(['Admin', 'Manager']), getSystemNotifications);
router.delete('/notifications/:notificationId', requireRole(['Admin', 'Manager']), deleteSystemNotification);
router.get('/teams', requireRole(['Admin', 'Manager']), getTeams);
router.post('/teams', requireRole(['Admin']), createTeam);
router.put('/teams/:teamId', requireRole(['Admin']), updateTeam);
router.get('/timer-policy', requireRole(['Admin']), getTimerPolicy);
router.put('/timer-policy', requireRole(['Admin']), updateTimerPolicy);
router.get('/org-settings', requireRole(['Admin']), getOrgSettings);
router.put('/org-settings', requireRole(['Admin']), updateOrgSettings);
// Lifting a user's recovery allowance is a privileged, audited act — Admin only.
router.post('/recovery-grants', requireRole(['Admin']), grantRecoveryOverride);

export default router;
