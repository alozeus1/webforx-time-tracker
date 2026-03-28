import { Router } from 'express';
import { listWebhooks, createWebhook, deleteWebhook } from '../controllers/webhookController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['Admin']));

router.get('/', listWebhooks);
router.post('/', createWebhook);
router.delete('/:id', deleteWebhook);

export default router;
