import { Router } from 'express';
import { authenticateToken, requireRole } from '../middlewares/auth';
import { createScheduleEntry, deleteScheduleEntry, listScheduleEntries, updateScheduleEntry } from '../controllers/scheduleController';

const router = Router();
router.use(authenticateToken);
router.get('/', listScheduleEntries);
router.post('/', requireRole(['Manager', 'Admin']), createScheduleEntry);
router.put('/:entryId', requireRole(['Manager', 'Admin']), updateScheduleEntry);
router.delete('/:entryId', requireRole(['Manager', 'Admin']), deleteScheduleEntry);

export default router;
