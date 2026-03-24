import { Router } from 'express';
import { runHourlyChecks, runDailyReport } from '../controllers/cronController';
import { env } from '../config/env';

const router = Router();

// Middleware to protect cron routes using Vercel's authorization header mapping
router.use((req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!env.cronSecret) {
        if (env.nodeEnv === 'production') {
            res.status(503).json({ error: 'CRON_SECRET is not configured' });
            return;
        }

        // In non-production, allow local cron endpoint testing without a shared secret.
        next();
        return;
    }

    if (authHeader !== `Bearer ${env.cronSecret}`) {
        res.status(401).json({ error: 'Unauthorized CRON execution' });
        return;
    }
    next();
});

router.get('/hourly', runHourlyChecks);
router.get('/daily', runDailyReport);

export default router;
