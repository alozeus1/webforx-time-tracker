import { Router } from 'express';
import { login, logout, forgotPassword, resetPassword, refreshAccessToken, getPasswordPolicy } from '../controllers/authController';
import { setupMfa, verifyMfa, disableMfa, validateMfaLogin, getMfaStatus } from '../controllers/mfaController';
import { googleSignIn } from '../controllers/googleAuthController';
import { authenticateToken } from '../middlewares/auth';
import { issueCsrfToken } from '../middlewares/csrf';

const router = Router();

// Standard auth
router.post('/login', login);
router.post('/google', googleSignIn);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/password-policy', getPasswordPolicy);
router.get('/csrf-token', (req, res) => {
    res.status(200).json({ csrfToken: issueCsrfToken(req, res) });
});
router.post('/refresh', refreshAccessToken);

router.post('/mfa/validate', validateMfaLogin);

router.get('/mfa/status', authenticateToken, getMfaStatus);
router.post('/mfa/setup', authenticateToken, setupMfa);
router.post('/mfa/verify', authenticateToken, verifyMfa);
router.post('/mfa/disable', authenticateToken, disableMfa);

export default router;
