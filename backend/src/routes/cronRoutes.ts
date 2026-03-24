import { Router } from 'express';
import { runHourlyChecks, runDailyReport } from '../controllers/cronController';

const router = Router();

// Middleware to protect cron routes using Vercel's authorization header mapping
router.use((req, res, next) => {
    // Vercel sends a Bearer token in the authorization header that matches CRON_SECRET
    const authHeader = req.headers.authorization;
    if (process.env.VERCEL === '1' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        res.status(401).json({ error: 'Unauthorized CRON execution' });
        return;
    }
    next();
});

router.get('/hourly', runHourlyChecks);
router.get('/daily', runDailyReport);

export default router;
