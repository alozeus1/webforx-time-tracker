import { Router } from 'express';
import { getMe, getAllUsers, createUser, updateUser, updateMe, getRoles } from '../controllers/userController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.get('/me', authenticateToken, getMe);
router.put('/me', authenticateToken, updateMe);
router.get('/', authenticateToken, requireRole(['Admin', 'Manager']), getAllUsers);
router.get('/roles', authenticateToken, requireRole(['Admin']), getRoles);
router.post('/', authenticateToken, requireRole(['Admin']), createUser);
router.put('/:id', authenticateToken, requireRole(['Admin']), updateUser);

export default router;
