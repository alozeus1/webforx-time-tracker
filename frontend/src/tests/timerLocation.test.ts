import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import { getTimerLocationPayload } from '../utils/timerLocation';

vi.mock('../services/api', () => ({ default: { get: vi.fn() } }));

describe('timer geofence location payload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not request location while geofencing is disabled', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { policy: { enabled: false, enforce_on_clock_in: true, max_accuracy_meters: 500 } } });
        const getCurrentPosition = vi.fn();
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });

        await expect(getTimerLocationPayload()).resolves.toEqual({});
        expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it('captures coordinates only when clock-in enforcement is enabled', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: { policy: { enabled: true, enforce_on_clock_in: true, max_accuracy_meters: 500 } } });
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude: 29.7604, longitude: -95.3698, accuracy: 20 } } as GeolocationPosition) },
        });

        await expect(getTimerLocationPayload()).resolves.toEqual({ location: { latitude: 29.7604, longitude: -95.3698, accuracy_meters: 20 } });
    });
});
