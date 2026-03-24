import { Router } from 'express';
import { getAllProjects, createProject } from '../controllers/projectController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.get('/', authenticateToken, getAllProjects);
router.post('/', authenticateToken, requireRole(['Admin']), createProject);

export default router;
