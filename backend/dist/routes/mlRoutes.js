"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mlController_1 = require("../controllers/mlController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateToken);
router.post('/categorize', mlController_1.categorizeWindows);
exports.default = router;
