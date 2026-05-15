import { Router } from 'express';
import { authenticateToken, requireRole } from '../middlewares/auth';
import { listOrganizations, getOrganization, createOrganization, updateOrganization } from '../controllers/organizationController';

const router = Router();

router.get('/', authenticateToken, requireRole(['Admin', 'Manager']), listOrganizations);
router.get('/:id', authenticateToken, getOrganization);
router.post('/', createOrganization); // Public for self-service signup
router.put('/me', authenticateToken, requireRole(['Admin']), updateOrganization);

export default router;
