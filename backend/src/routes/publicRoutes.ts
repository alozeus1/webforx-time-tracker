import { Router } from 'express';
import { getSharedArtifact } from '../controllers/reportController';

const router = Router();

router.get('/share/:token', getSharedArtifact);

export default router;
