import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { submitAccessRequest } from '../controllers/contactController';

const router = Router();

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many requests. Please try again later.' },
});

router.post('/request-access', contactLimiter, submitAccessRequest);

export default router;
