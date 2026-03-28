import { Router } from 'express';
import { listTemplates, createTemplate, createProjectFromTemplate, deleteTemplate } from '../controllers/templateController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', listTemplates);
router.post('/', requireRole(['Admin', 'Manager']), createTemplate);
router.post('/:id/apply', requireRole(['Admin', 'Manager']), createProjectFromTemplate);
router.delete('/:id', requireRole(['Admin']), deleteTemplate);

export default router;
