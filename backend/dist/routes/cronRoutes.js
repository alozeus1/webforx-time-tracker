"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cronController_1 = require("../controllers/cronController");
const router = (0, express_1.Router)();
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
router.get('/hourly', cronController_1.runHourlyChecks);
router.get('/daily', cronController_1.runDailyReport);
exports.default = router;
