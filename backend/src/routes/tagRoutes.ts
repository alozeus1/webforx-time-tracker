import { Router } from 'express';
import { authenticateToken, requireRole } from '../middlewares/auth';
import { createTag, listTags, deleteTag } from '../controllers/tagController';

const router = Router();

router.get('/', authenticateToken, listTags);
router.post('/', authenticateToken, requireRole(['Admin', 'Manager']), createTag);
router.delete('/:id', authenticateToken, requireRole(['Admin']), deleteTag);

export default router;
