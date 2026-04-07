import { Router } from 'express';
import {
    getMe,
    getAllUsers,
    createUser,
    updateUser,
    deleteUser,
    permanentlyDeleteUser,
    updateMe,
    getRoles,
    getMyNotifications,
    getMyWellbeing,
    importUsers,
    getUserAuthEvents,
} from '../controllers/userController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.get('/me', authenticateToken, getMe);
router.get('/me/notifications', authenticateToken, getMyNotifications);
router.get('/me/wellbeing', authenticateToken, getMyWellbeing);
router.put('/me', authenticateToken, updateMe);
router.get('/', authenticateToken, requireRole(['Admin', 'Manager']), getAllUsers);
router.get('/roles', authenticateToken, requireRole(['Admin', 'Manager']), getRoles);
router.get('/:id/auth-events', authenticateToken, requireRole(['Admin', 'Manager']), getUserAuthEvents);
router.post('/', authenticateToken, requireRole(['Admin', 'Manager']), createUser);
router.post('/import', authenticateToken, requireRole(['Admin', 'Manager']), importUsers);
router.put('/:id', authenticateToken, requireRole(['Admin', 'Manager']), updateUser);
router.delete('/:id', authenticateToken, requireRole(['Admin', 'Manager']), deleteUser);
router.delete('/:id/permanent', authenticateToken, requireRole(['Admin']), permanentlyDeleteUser);

export default router;
