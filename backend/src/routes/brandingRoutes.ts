import { Router } from 'express';
import { authenticateToken, requireRole } from '../middlewares/auth';
import { getPublicBranding, getBranding, upsertBranding, resetBranding } from '../controllers/brandingController';

const router = Router();

// Public — used by frontend for custom domain / white-label login page
router.get('/public', getPublicBranding);

// Protected — Admin only
router.use(authenticateToken);
router.get('/', requireRole(['Admin']), getBranding);
router.put('/', requireRole(['Admin']), upsertBranding);
router.delete('/', requireRole(['Admin']), resetBranding);

export default router;
