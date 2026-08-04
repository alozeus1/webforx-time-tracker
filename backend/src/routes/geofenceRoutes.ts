import { Router } from 'express';
import { authenticateToken, requireRole } from '../middlewares/auth';
import { createGeofenceZone, deleteGeofenceZone, getGeofencePolicy, listGeofenceZones, updateGeofencePolicy, updateGeofenceZone } from '../controllers/geofenceController';

const router = Router();
router.use(authenticateToken);
router.get('/policy', getGeofencePolicy);
router.get('/zones', requireRole(['Admin']), listGeofenceZones);
router.put('/policy', requireRole(['Admin']), updateGeofencePolicy);
router.post('/zones', requireRole(['Admin']), createGeofenceZone);
router.put('/zones/:zoneId', requireRole(['Admin']), updateGeofenceZone);
router.delete('/zones/:zoneId', requireRole(['Admin']), deleteGeofenceZone);

export default router;
