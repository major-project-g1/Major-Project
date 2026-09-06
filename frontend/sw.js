const STATIC_CACHE = 'cyberforensics-static-v3';
const RUNTIME_CACHE = 'cyberforensics-runtime-v3';
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then(resp => {
                    const copy = resp.clone();
                    caches.open(RUNTIME_CACHE).then(cache => cache.put(req, copy));
                    return resp;
                })
                .catch(async () => {
                    const cache = await caches.open(RUNTIME_CACHE);
                    return (await cache.match(req)) ||
                        (await caches.match('./index.html'));
                })
        );
        return;
    }

    // Always check for updated application code first. Cached JavaScript can
    // otherwise keep an old auth flow active after deployment.
    if (req.url.endsWith('/app.js') || req.url.endsWith('/style.css')) {
        event.respondWith(
            fetch(req)
                .then(resp => {
                    const copy = resp.clone();
                    caches.open(STATIC_CACHE).then(cache => cache.put(req, copy));
                    return resp;
                })
                .catch(() => caches.match(req))
        );
        return;
    }

    event.respondWith(
        caches.match(req).then(cached => {
            if (cached) return cached;
            return fetch(req).then(resp => {
                const copy = resp.clone();
                caches.open(RUNTIME_CACHE).then(cache => cache.put(req, copy));
                return resp;
            });
        })
    );
});
