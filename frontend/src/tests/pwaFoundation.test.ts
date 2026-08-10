import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import serviceWorkerRaw from '../../public/sw.js?raw';
import mainRaw from '../main.tsx?raw';
import pwaRegistrationRaw from '../services/pwa.ts?raw';
import { OFFLINE_TIMER_QUEUE_ENABLED, queueOfflineTimerMutation } from '../services/offlineTimerQueue';
import PwaStatus from '../components/PwaStatus';
import { activateWaitingServiceWorker } from '../services/pwa';

describe('PWA platform foundation', () => {
    it('uses a versioned cache and never intercepts non-GET or cross-origin writes', () => {
        expect(serviceWorkerRaw).toContain("const CACHE_PREFIX = 'wfx-shell-'");
        expect(serviceWorkerRaw).toContain("new Set(['wfx-v1'])");
        expect(serviceWorkerRaw).toContain("request.method !== 'GET'");
        expect(serviceWorkerRaw).toContain('url.origin !== self.location.origin');
        expect(serviceWorkerRaw).not.toContain("self.skipWaiting();\n    event.waitUntil");
    });

    it('keeps offline timer mutation persistence disabled by default', async () => {
        expect(OFFLINE_TIMER_QUEUE_ENABLED).toBe(false);
        await expect(queueOfflineTimerMutation({
            idempotencyKey: 'mutation-1',
            operation: 'start',
            createdAt: new Date(0).toISOString(),
            expectedServerRevision: 'revision-1',
            payload: {},
        })).rejects.toThrow(/disabled/i);
    });

    it('has one service-worker registration path', () => {
        expect(mainRaw).not.toContain('serviceWorker.register');
        expect(pwaRegistrationRaw.match(/serviceWorker\.register/g)).toHaveLength(1);
    });

    it('arms controller reload only when the user activates a waiting update', () => {
        const addEventListener = vi.fn();
        const postMessage = vi.fn();
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: { addEventListener },
        });
        const reload = vi.fn();

        activateWaitingServiceWorker({ waiting: { postMessage } } as unknown as ServiceWorkerRegistration, reload);

        expect(addEventListener).toHaveBeenCalledWith('controllerchange', reload, { once: true });
        expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(addEventListener.mock.invocationCallOrder[0]).toBeLessThan(postMessage.mock.invocationCallOrder[0]);
        Reflect.deleteProperty(navigator, 'serviceWorker');
    });

    it('truthfully tells users offline timer changes are not queued', () => {
        render(createElement(PwaStatus));
        fireEvent(window, new Event('offline'));
        expect(screen.getByRole('status')).toHaveTextContent(/timer changes require a connection and are not queued/i);

        fireEvent(window, new Event('online'));
        expect(screen.queryByText(/timer changes require a connection/i)).not.toBeInTheDocument();
    });
});
