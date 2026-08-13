export const SERVICE_WORKER_PATH = '/sw.js';

export interface PwaRegistrationHandlers {
    onUpdateReady: (registration: ServiceWorkerRegistration) => void;
    onRegistrationError?: (error: unknown) => void;
}

export const registerPwa = async ({
    onUpdateReady,
    onRegistrationError,
}: PwaRegistrationHandlers): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) return null;

    try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH);

        if (registration.waiting && navigator.serviceWorker.controller) {
            onUpdateReady(registration);
        }

        registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) return;

            installing.addEventListener('statechange', () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                    onUpdateReady(registration);
                }
            });
        });

        return registration;
    } catch (error) {
        onRegistrationError?.(error);
        return null;
    }
};

export const activateWaitingServiceWorker = (
    registration: ServiceWorkerRegistration,
    onControllerChange: () => void,
): void => {
    if (!registration.waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true });
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
};
