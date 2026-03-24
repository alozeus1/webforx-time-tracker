import { Router } from 'express';
import { login, logout } from '../controllers/authController';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);

export default router;
