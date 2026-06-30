import { Router } from 'express';
import { authenticateToken, requireRole } from '../middlewares/auth';
import {
    listMyLeave,
    createLeave,
    cancelLeave,
    listAllLeave,
    reviewLeave,
    leaveSummary,
} from '../controllers/leaveController';

const router = Router();

router.use(authenticateToken);

// Employee — own requests
router.get('/', listMyLeave as any);
router.post('/', createLeave as any);
router.delete('/:id', cancelLeave as any);

// Manager / Admin — org-wide
router.get('/all', requireRole(['Admin', 'Manager']), listAllLeave as any);
router.patch('/:id/review', requireRole(['Admin', 'Manager']), reviewLeave as any);
router.get('/summary', requireRole(['Admin', 'Manager']), leaveSummary as any);

export default router;
