/**
 * Web Forx Time Tracker — Service Worker
 * Strategy:
 *   - API requests (/api/) → Network-first (never cache auth/write calls)
 *   - Static assets (JS, CSS, images, fonts) → Cache-first with stale-while-revalidate
 *   - HTML navigation → Network-first with offline fallback to /index.html
 */

const CACHE_NAME = 'wfx-v1';
const STATIC_EXTS = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.woff', '.woff2', '.ttf', '.ico'];

// Install — pre-cache the shell
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            cache.addAll(['/', '/index.html'])
        )
    );
});

// Activate — remove old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Never intercept non-GET or cross-origin requests
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    // API calls — network-first, no cache
    if (url.pathname.startsWith('/api/')) return;

    // Static assets — cache-first
    const ext = url.pathname.substring(url.pathname.lastIndexOf('.'));
    if (STATIC_EXTS.includes(ext)) {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) {
                    // Refresh in background
                    event.waitUntil(
                        fetch(request).then(res => {
                            if (res.ok) caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
                        }).catch(() => {})
                    );
                    return cached;
                }
                return fetch(request).then(res => {
                    if (res.ok) caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
                    return res;
                });
            })
        );
        return;
    }

    // HTML navigation — network-first, offline → /index.html shell
    event.respondWith(
        fetch(request).then(res => {
            if (res.ok) caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
            return res;
        }).catch(() =>
            caches.match(request).then(cached => cached || caches.match('/index.html'))
        )
    );
});
