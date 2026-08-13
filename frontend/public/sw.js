/**
 * Web Forx Time Tracker service worker.
 *
 * Timer/API writes are deliberately never intercepted or queued. The cached shell is
 * read-only while offline; server state remains the source of truth.
 */

const CACHE_PREFIX = 'wfx-shell-';
const CACHE_VERSION = '2026-08-platform-v2';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const LEGACY_CACHE_NAMES = new Set(['wfx-v1']);
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/favicon.png'];
const STATIC_EXTENSIONS = new Set(['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.woff', '.woff2', '.ttf', '.ico']);

self.addEventListener('install', (event) => {
    // Do not skip waiting here. The page tells the user when a new shell is ready,
    // preventing a running session from unexpectedly switching asset versions.
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys
                .filter((key) => (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) || LEGACY_CACHE_NAMES.has(key))
                .map((key) => caches.delete(key)),
        );
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Cross-origin traffic includes the production API. Non-GET traffic includes all
    // timer mutations. Let the browser handle both directly and never cache them.
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/')) return;

    const extension = url.pathname.includes('.')
        ? url.pathname.slice(url.pathname.lastIndexOf('.')).toLowerCase()
        : '';

    if (STATIC_EXTENSIONS.has(extension)) {
        event.respondWith((async () => {
            const cached = await caches.match(request);
            const refreshed = fetch(request).then(async (response) => {
                if (response.ok && response.type === 'basic') {
                    await (await caches.open(CACHE_NAME)).put(request, response.clone());
                }
                return response;
            });

            if (cached) {
                event.waitUntil(refreshed.catch(() => undefined));
                return cached;
            }

            return refreshed;
        })());
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                if (response.ok && response.type === 'basic') {
                    await (await caches.open(CACHE_NAME)).put('/index.html', response.clone());
                }
                return response;
            } catch {
                const shell = await caches.match('/index.html');
                return shell || Response.error();
            }
        })());
    }
});
