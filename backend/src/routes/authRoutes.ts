import { Router } from 'express';
import { login, logout, forgotPassword, resetPassword, refreshAccessToken } from '../controllers/authController';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/refresh', refreshAccessToken);

export default router;
