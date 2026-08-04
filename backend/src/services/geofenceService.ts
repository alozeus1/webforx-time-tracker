import prisma from '../config/db';

export interface GeofencePolicy {
    enabled: boolean;
    enforce_on_clock_in: boolean;
    max_accuracy_meters: number;
}

export interface TimerLocationInput {
    latitude: number;
    longitude: number;
    accuracy_meters: number | null;
}

export const DEFAULT_GEOFENCE_POLICY: GeofencePolicy = {
    enabled: false,
    enforce_on_clock_in: true,
    max_accuracy_meters: 500,
};

export const resolveGeofencePolicy = (settings: unknown): GeofencePolicy => {
    const root = settings && typeof settings === 'object' && !Array.isArray(settings)
        ? settings as Record<string, unknown>
        : {};
    const raw = root.geofencing && typeof root.geofencing === 'object' && !Array.isArray(root.geofencing)
        ? root.geofencing as Record<string, unknown>
        : {};
    const maxAccuracy = Number(raw.max_accuracy_meters);
    return {
        enabled: raw.enabled === true,
        enforce_on_clock_in: raw.enforce_on_clock_in !== false,
        max_accuracy_meters: Number.isFinite(maxAccuracy) ? Math.min(5000, Math.max(25, Math.round(maxAccuracy))) : DEFAULT_GEOFENCE_POLICY.max_accuracy_meters,
    };
};

export const getOrganizationGeofencePolicy = async (organizationId: string) => {
    const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
    return resolveGeofencePolicy(organization?.settings);
};

const toRadians = (degrees: number) => degrees * Math.PI / 180;

export const distanceMeters = (latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) => {
    const earthRadiusMeters = 6_371_000;
    const deltaLatitude = toRadians(latitudeB - latitudeA);
    const deltaLongitude = toRadians(longitudeB - longitudeA);
    const a = Math.sin(deltaLatitude / 2) ** 2
        + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
    return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const normalizeTimerLocation = (body: Record<string, unknown>): TimerLocationInput | null => {
    const raw = body.location && typeof body.location === 'object' && !Array.isArray(body.location)
        ? body.location as Record<string, unknown>
        : {};
    const latitude = Number(raw.latitude);
    const longitude = Number(raw.longitude);
    const accuracy = raw.accuracy_meters === null || raw.accuracy_meters === undefined ? null : Number(raw.accuracy_meters);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
    if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0)) return null;
    return { latitude, longitude, accuracy_meters: accuracy };
};

export const evaluateClockInGeofence = async (organizationId: string, location: TimerLocationInput | null) => {
    const policy = await getOrganizationGeofencePolicy(organizationId);
    if (!policy.enabled || !policy.enforce_on_clock_in) {
        return { policy, allowed: true, zoneId: null as string | null, reason: null as string | null };
    }
    if (!location) return { policy, allowed: false, zoneId: null, reason: 'Location permission is required to clock in for this organization.' };
    if (location.accuracy_meters !== null && location.accuracy_meters > policy.max_accuracy_meters) {
        return { policy, allowed: false, zoneId: null, reason: `Location accuracy must be within ${policy.max_accuracy_meters} meters.` };
    }

    const zones = await prisma.geofenceZone.findMany({ where: { organization_id: organizationId, is_active: true } });
    if (zones.length === 0) return { policy, allowed: false, zoneId: null, reason: 'Geofencing is enabled but no active zones are configured.' };

    const matches = zones.filter((zone) => distanceMeters(location.latitude, location.longitude, zone.latitude, zone.longitude) <= zone.radius_meters);
    const denied = matches.find((zone) => zone.rule_type === 'deny');
    if (denied) return { policy, allowed: false, zoneId: denied.id, reason: `Clock-in is blocked inside ${denied.name}.` };

    const allowZones = zones.filter((zone) => zone.rule_type === 'allow');
    if (allowZones.length > 0) {
        const allowed = matches.find((zone) => zone.rule_type === 'allow');
        if (!allowed) return { policy, allowed: false, zoneId: null, reason: 'You are outside the approved clock-in locations.' };
        return { policy, allowed: true, zoneId: allowed.id, reason: null };
    }
    return { policy, allowed: true, zoneId: null, reason: null };
};
