import { Router } from 'express';
import { login, logout, forgotPassword, resetPassword, refreshAccessToken, getPasswordPolicy } from '../controllers/authController';
import { setupMfa, verifyMfa, disableMfa, validateMfaLogin, getMfaStatus } from '../controllers/mfaController';
import { googleSignIn } from '../controllers/googleAuthController';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

// Standard auth
router.post('/login', login);
router.post('/google', googleSignIn);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/password-policy', getPasswordPolicy);
router.post('/refresh', refreshAccessToken);

// MFA — second login step (no session required, uses challenge token)
router.post('/mfa/validate', validateMfaLogin as any);

// MFA management (requires full session)
router.get('/mfa/status', authenticateToken, getMfaStatus as any);
router.post('/mfa/setup', authenticateToken, setupMfa as any);
router.post('/mfa/verify', authenticateToken, verifyMfa as any);
router.post('/mfa/disable', authenticateToken, disableMfa as any);

export default router;
