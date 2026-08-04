import { Response } from 'express';
import type { Prisma } from '@prisma/client/index';
import prisma from '../config/db';
import { AuthRequest } from '../types/auth';
import { DEFAULT_GEOFENCE_POLICY, getOrganizationGeofencePolicy } from '../services/geofenceService';

const normalizeZone = (body: Record<string, unknown>) => {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const ruleType = body.rule_type === 'deny' ? 'deny' : body.rule_type === 'allow' ? 'allow' : '';
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const radiusMeters = Number(body.radius_meters);
    if (!name || !ruleType || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
    if (!Number.isInteger(radiusMeters) || radiusMeters < 25 || radiusMeters > 100_000) return null;
    return { name, ruleType, latitude, longitude, radiusMeters, isActive: body.is_active !== false };
};

export const getGeofencePolicy = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const policy = await getOrganizationGeofencePolicy(req.user!.organization_id);
        res.status(200).json({ policy });
    } catch (error) {
        console.error('Failed to load geofence policy:', error);
        res.status(500).json({ message: 'Unable to load geofence policy.' });
    }
};

export const updateGeofencePolicy = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const enabled = req.body?.enabled === true;
        const enforceOnClockIn = req.body?.enforce_on_clock_in !== false;
        const maxAccuracy = Number(req.body?.max_accuracy_meters ?? DEFAULT_GEOFENCE_POLICY.max_accuracy_meters);
        if (!Number.isFinite(maxAccuracy) || maxAccuracy < 25 || maxAccuracy > 5000) {
            res.status(400).json({ message: 'max_accuracy_meters must be between 25 and 5000.' });
            return;
        }
        if (enabled) {
            const activeZones = await prisma.geofenceZone.count({ where: { organization_id: req.user!.organization_id, is_active: true } });
            if (activeZones === 0) {
                res.status(409).json({ message: 'Create at least one active geofence zone before enabling enforcement.' });
                return;
            }
        }
        const org = await prisma.organization.findUnique({ where: { id: req.user!.organization_id }, select: { settings: true } });
        const settings = (org?.settings as Record<string, unknown>) ?? {};
        const policy = { enabled, enforce_on_clock_in: enforceOnClockIn, max_accuracy_meters: Math.round(maxAccuracy) };
        await prisma.organization.update({
            where: { id: req.user!.organization_id },
            data: { settings: { ...settings, geofencing: policy } as Prisma.InputJsonValue },
        });
        res.status(200).json({ policy });
    } catch (error) {
        console.error('Failed to update geofence policy:', error);
        res.status(500).json({ message: 'Unable to update geofence policy.' });
    }
};

export const listGeofenceZones = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const zones = await prisma.geofenceZone.findMany({ where: { organization_id: req.user!.organization_id }, orderBy: { name: 'asc' } });
        res.status(200).json({ zones });
    } catch (error) {
        console.error('Failed to list geofence zones:', error);
        res.status(500).json({ message: 'Unable to load geofence zones.' });
    }
};

export const createGeofenceZone = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const payload = normalizeZone(req.body ?? {});
        if (!payload) { res.status(400).json({ message: 'Valid name, rule, coordinates, and radius are required.' }); return; }
        const zone = await prisma.geofenceZone.create({
            data: { organization_id: req.user!.organization_id, created_by: req.user!.userId, name: payload.name, rule_type: payload.ruleType, latitude: payload.latitude, longitude: payload.longitude, radius_meters: payload.radiusMeters, is_active: payload.isActive },
        });
        res.status(201).json(zone);
    } catch (error) {
        console.error('Failed to create geofence zone:', error);
        res.status(500).json({ message: 'Unable to create geofence zone.' });
    }
};

export const updateGeofenceZone = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const zoneId = Array.isArray(req.params.zoneId) ? req.params.zoneId[0] : req.params.zoneId;
        const existing = await prisma.geofenceZone.findFirst({ where: { id: zoneId, organization_id: req.user!.organization_id } });
        if (!existing) { res.status(404).json({ message: 'Geofence zone not found.' }); return; }
        const payload = normalizeZone({
            name: req.body?.name ?? existing.name,
            rule_type: req.body?.rule_type ?? existing.rule_type,
            latitude: req.body?.latitude ?? existing.latitude,
            longitude: req.body?.longitude ?? existing.longitude,
            radius_meters: req.body?.radius_meters ?? existing.radius_meters,
            is_active: req.body?.is_active ?? existing.is_active,
        });
        if (!payload) { res.status(400).json({ message: 'The updated geofence zone is invalid.' }); return; }
        if (existing.is_active && !payload.isActive) {
            const policy = await getOrganizationGeofencePolicy(req.user!.organization_id);
            const activeZoneCount = await prisma.geofenceZone.count({ where: { organization_id: req.user!.organization_id, is_active: true } });
            if (policy.enabled && activeZoneCount <= 1) {
                res.status(409).json({ message: 'Disable geofencing before deactivating the final active zone.' });
                return;
            }
        }
        const zone = await prisma.geofenceZone.update({
            where: { id: existing.id },
            data: { name: payload.name, rule_type: payload.ruleType, latitude: payload.latitude, longitude: payload.longitude, radius_meters: payload.radiusMeters, is_active: payload.isActive },
        });
        res.status(200).json(zone);
    } catch (error) {
        console.error('Failed to update geofence zone:', error);
        res.status(500).json({ message: 'Unable to update geofence zone.' });
    }
};

export const deleteGeofenceZone = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const zoneId = Array.isArray(req.params.zoneId) ? req.params.zoneId[0] : req.params.zoneId;
        const existing = await prisma.geofenceZone.findFirst({ where: { id: zoneId, organization_id: req.user!.organization_id } });
        if (!existing) { res.status(404).json({ message: 'Geofence zone not found.' }); return; }
        if (existing.is_active) {
            const policy = await getOrganizationGeofencePolicy(req.user!.organization_id);
            const activeZoneCount = await prisma.geofenceZone.count({ where: { organization_id: req.user!.organization_id, is_active: true } });
            if (policy.enabled && activeZoneCount <= 1) {
                res.status(409).json({ message: 'Disable geofencing before deleting the final active zone.' });
                return;
            }
        }
        const result = await prisma.geofenceZone.deleteMany({ where: { id: zoneId, organization_id: req.user!.organization_id } });
        if (result.count === 0) { res.status(404).json({ message: 'Geofence zone not found.' }); return; }
        res.status(204).send();
    } catch (error) {
        console.error('Failed to delete geofence zone:', error);
        res.status(500).json({ message: 'Unable to delete geofence zone.' });
    }
};
