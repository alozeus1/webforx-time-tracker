import { Router } from 'express';
import { categorizeWindows } from '../controllers/mlController';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken);
router.post('/categorize', categorizeWindows);

export default router;
