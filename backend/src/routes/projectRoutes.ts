import { Router } from 'express';
import { getAllProjects, createProject, updateProject, deleteProject } from '../controllers/projectController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.get('/', authenticateToken, getAllProjects);
router.post('/', authenticateToken, requireRole(['Admin', 'Manager']), createProject);
router.put('/:id', authenticateToken, requireRole(['Admin', 'Manager']), updateProject);
router.delete('/:id', authenticateToken, requireRole(['Admin', 'Manager']), deleteProject);

export default router;
