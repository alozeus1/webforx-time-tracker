"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cronController_1 = require("../controllers/cronController");
const env_1 = require("../config/env");
const router = (0, express_1.Router)();
// Middleware to protect cron routes using Vercel's authorization header mapping
router.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!env_1.env.cronSecret) {
        if (env_1.env.nodeEnv === 'production') {
            res.status(503).json({ error: 'CRON_SECRET is not configured' });
            return;
        }
        // In non-production, allow local cron endpoint testing without a shared secret.
        next();
        return;
    }
    if (authHeader !== `Bearer ${env_1.env.cronSecret}`) {
        res.status(401).json({ error: 'Unauthorized CRON execution' });
        return;
    }
    next();
});
router.get('/hourly', cronController_1.runHourlyChecks);
router.get('/daily', cronController_1.runDailyReport);
exports.default = router;
