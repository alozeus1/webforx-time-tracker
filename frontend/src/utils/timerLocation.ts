import api from '../services/api';
import type { GeofencePolicySummary } from '../types/api';

export interface TimerLocationPayload {
    location?: {
        latitude: number;
        longitude: number;
        accuracy_meters: number | null;
    };
}

const requestPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 30_000,
    });
});

const locationRequiredError = (message: string) => ({ response: { status: 403, data: { message } } });

export const getTimerLocationPayload = async (): Promise<TimerLocationPayload> => {
    let policy: GeofencePolicySummary;
    try {
        const response = await api.get<{ policy: GeofencePolicySummary }>('/geofences/policy');
        policy = response.data.policy;
    } catch {
        // An unavailable optional policy endpoint must not regress existing timer starts.
        return {};
    }

    if (!policy.enabled || !policy.enforce_on_clock_in) return {};
    if (!navigator.geolocation) {
        throw locationRequiredError('This organization requires location verification, but this device does not provide geolocation.');
    }

    try {
        const position = await requestPosition();
        return {
            location: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy_meters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
            },
        };
    } catch {
        throw locationRequiredError('Location access is required to start a timer for this organization. Enable location permission and try again.');
    }
};
