import { Router } from 'express';
import { authenticateToken, requireRole } from '../middlewares/auth';
import {
    listPayrollPeriods,
    generatePayrollPeriod,
    lockPayrollPeriod,
    unlockPayrollPeriod,
    checkLockStatus,
} from '../controllers/payrollController';

const router = Router();

router.use(authenticateToken);

// Any authenticated user can view periods and check lock status
router.get('/', listPayrollPeriods);
router.get('/lock-check', checkLockStatus);

// Only Admins can generate or change period status
router.post('/generate', requireRole(['Admin']), generatePayrollPeriod);
router.post('/:id/lock', requireRole(['Admin']), lockPayrollPeriod);
router.post('/:id/unlock', requireRole(['Admin']), unlockPayrollPeriod);

export default router;
