import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getStoredPrivacyMode } from '../utils/privacyMode';
import { recordRouteSession, recordVisibilityPulse } from '../utils/workSignals';

export const useWorkSignals = () => {
    const location = useLocation();
    const routeStartedAt = useRef(new Date());
    const visibleStartedAt = useRef(new Date());
    const previousPath = useRef(location.pathname);

    useEffect(() => {
        const now = new Date();

        recordRouteSession(
            previousPath.current,
            document.title || previousPath.current,
            routeStartedAt.current,
            now,
            getStoredPrivacyMode(),
        );

        previousPath.current = location.pathname;
        routeStartedAt.current = now;
    }, [location.pathname]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            const now = new Date();
            if (document.visibilityState === 'hidden') {
                recordVisibilityPulse(
                    location.pathname,
                    document.title || location.pathname,
                    visibleStartedAt.current,
                    now,
                    getStoredPrivacyMode(),
                );
                return;
            }

            visibleStartedAt.current = now;
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [location.pathname]);
};
