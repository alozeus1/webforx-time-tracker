"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const projectRoutes_1 = __importDefault(require("./routes/projectRoutes"));
const timeEntryRoutes_1 = __importDefault(require("./routes/timeEntryRoutes"));
const reportRoutes_1 = __importDefault(require("./routes/reportRoutes"));
const integrationRoutes_1 = __importDefault(require("./routes/integrationRoutes"));
const calendarRoutes_1 = __importDefault(require("./routes/calendarRoutes"));
const mlRoutes_1 = __importDefault(require("./routes/mlRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const cronRoutes_1 = __importDefault(require("./routes/cronRoutes"));
const notificationWorker_1 = require("./workers/notificationWorker");
const idleTracker_1 = require("./workers/idleTracker");
const burnoutTracker_1 = require("./workers/burnoutTracker");
const db_1 = __importDefault(require("./config/db"));
const env_1 = require("./config/env");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: env_1.env.corsOrigin }));
app.use(express_1.default.json());
// Routes
app.use('/api/v1/auth', authRoutes_1.default);
app.use('/api/v1/users', userRoutes_1.default);
app.use('/api/v1/projects', projectRoutes_1.default);
app.use('/api/v1/timers', timeEntryRoutes_1.default);
app.use('/api/v1/reports', reportRoutes_1.default);
app.use('/api/v1/integrations', integrationRoutes_1.default);
app.use('/api/v1/calendar', calendarRoutes_1.default);
app.use('/api/v1/ml', mlRoutes_1.default);
app.use('/api/v1/admin', adminRoutes_1.default);
app.use('/api/v1/cron', cronRoutes_1.default);
app.get('/', (_req, res) => {
    res.status(200).json({
        name: 'Web Forx Time Tracker API',
        status: 'ok',
        docs_hint: 'Use the frontend at http://localhost:5173 and the API under /api/v1',
        health: '/api/v1/health',
    });
});
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Time Tracker API is running' });
});
app.use('/api/v1', (_req, res) => {
    res.status(404).json({ message: 'API route not found' });
});
const bootstrap = () => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.default.$connect();
    if (env_1.env.enableBackgroundWorkers) {
        notificationWorker_1.notificationWorker.start();
        (0, idleTracker_1.startIdleTracker)();
        (0, burnoutTracker_1.startBurnoutTracker)();
    }
    if (process.env.VERCEL !== '1') {
        const server = app.listen(env_1.env.port, () => {
            console.log(`Server running on port ${env_1.env.port}`);
        });
        const shutdown = (signal) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(`Received ${signal}. Closing server...`);
            server.close(() => __awaiter(void 0, void 0, void 0, function* () {
                yield db_1.default.$disconnect();
                process.exit(0);
            }));
        });
        process.on('SIGINT', () => {
            void shutdown('SIGINT');
        });
        process.on('SIGTERM', () => {
            void shutdown('SIGTERM');
        });
    }
});
if (process.env.VERCEL !== '1') {
    void bootstrap().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
        console.error('Failed to start server:', error);
        yield db_1.default.$disconnect();
        process.exit(1);
    }));
}
else {
    // Ensure DB connects in serverless environment
    void db_1.default.$connect();
}
exports.default = app;
