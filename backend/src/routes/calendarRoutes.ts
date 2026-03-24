import { Router } from 'express';
import {
    disconnectGoogleCalendar,
    getCalendarEvents,
    getCalendarStatus,
    getGoogleCalendarConnectUrl,
    handleGoogleCalendarCallback,
} from '../controllers/calendarController';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.get('/callback', handleGoogleCalendarCallback);

router.use(authenticateToken);
router.get('/status', getCalendarStatus);
router.get('/connect', getGoogleCalendarConnectUrl);
router.get('/events', getCalendarEvents);
router.delete('/disconnect', disconnectGoogleCalendar);

export default router;
