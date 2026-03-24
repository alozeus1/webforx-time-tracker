import { Router } from 'express';
import { getMe, getAllUsers, createUser } from '../controllers/userController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.get('/me', authenticateToken, getMe);
router.get('/', authenticateToken, requireRole(['Admin', 'Manager']), getAllUsers);
router.post('/', authenticateToken, requireRole(['Admin']), createUser);

export default router;
