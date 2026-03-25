import { Router } from 'express';
import { getGithubCommits, listIntegrations, saveIntegration, syncQuickbooks, testIntegration } from '../controllers/integrationController';
import { authenticateToken, requireRole } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken);

// Individual developer integrations
router.get('/github/commits', getGithubCommits);
router.get('/', requireRole(['Admin', 'Manager']), listIntegrations);
router.post('/', requireRole(['Admin']), saveIntegration);
router.post('/test', requireRole(['Admin', 'Manager']), testIntegration);

// Organization-level integrations (Managers/Admins only)
router.post('/quickbooks/sync', requireRole(['Admin', 'Manager']), syncQuickbooks);

export default router;
