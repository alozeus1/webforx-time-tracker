import { Router } from 'express';
import { getMe, getAllUsers, createUser, updateUser, deleteUser, updateMe, getRoles } from '../controllers/userController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.get('/me', authenticateToken, getMe);
router.put('/me', authenticateToken, updateMe);
router.get('/', authenticateToken, requireRole(['Admin', 'Manager']), getAllUsers);
router.get('/roles', authenticateToken, requireRole(['Admin', 'Manager']), getRoles);
router.post('/', authenticateToken, requireRole(['Admin', 'Manager']), createUser);
router.put('/:id', authenticateToken, requireRole(['Admin', 'Manager']), updateUser);
router.delete('/:id', authenticateToken, requireRole(['Admin', 'Manager']), deleteUser);

export default router;
