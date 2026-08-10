import React, { useEffect, useState } from 'react';
import { activateWaitingServiceWorker, registerPwa } from '../services/pwa';

const PwaStatus: React.FC = () => {
    const [online, setOnline] = useState(() => navigator.onLine);
    const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);

    useEffect(() => {
        const handleOnline = () => setOnline(true);
        const handleOffline = () => setOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        void registerPwa({
            onUpdateReady: setUpdate,
            onRegistrationError: (error) => console.warn('Service worker registration failed', error),
        });

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (!online) {
        return (
            <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900">
                Offline — cached screens may remain available, but timer changes require a connection and are not queued.
            </div>
        );
    }

    if (update) {
        return (
            <div role="status" className="flex items-center justify-center gap-3 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
                <span>A new version is ready.</span>
                <button
                    type="button"
                    className="rounded-md bg-blue-700 px-3 py-1 font-semibold text-white"
                    onClick={() => activateWaitingServiceWorker(update, () => window.location.reload())}
                >
                    Reload to update
                </button>
            </div>
        );
    }

    return null;
};

export default PwaStatus;
