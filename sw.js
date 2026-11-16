/* ============================================================
   Aniclipse service worker — PWA install pack (OG).
   Deliberately defensive, remembering the 2026-11-15 incident
   where a leftover service worker from another build caused
   confusion:
   - Fresh OG cache names; on activate EVERY other cache on
     this origin is deleted (legacy packs included), then the
     worker claims all clients.
   - NETWORK-FIRST for the app shell (navigations and the
     same-origin index.html / script.js / styles.css /
     manifest.json): a new push shows on the very next online
     open; the cache is only an offline fallback, so the user
     can never be trapped on a stale build.
   - CACHE-FIRST only for same-origin static images
     (favicon.png).
   - Only same-origin GET requests are handled at all. Every
     API call (AniList / AnimeThemes / AniSongDB / Firebase /
     Kitsu) is cross-origin or non-GET and passes straight
     through to the network, untouched.
   ============================================================ */

const SHELL_CACHE = 'aniclipse-og-shell-v1';
const IMAGE_CACHE = 'aniclipse-og-images-v1';
const KNOWN_CACHES = [SHELL_CACHE, IMAGE_CACHE];
const IMAGE_CACHE_MAX = 60;

const SHELL_FILES = [
    './',
    './index.html',
    './styles.css',
    './script.js',
    './favicon.png',
    './manifest.json'
];

function isShellRequest(request, url) {
    if (request.mode === 'navigate') return true;
    return /\.(html|js|css|json)$/i.test(url.pathname) || url.pathname.endsWith('/');
}

function isImageRequest(request, url) {
    if (request.destination === 'image') return true;
    return /\.(png|jpe?g|webp|gif|svg|avif|ico)$/i.test(url.pathname);
}

/* Network-first: always try the network so a fresh deploy can
   never be hidden by a stale cache; fall back to the cache
   only when the network fails (offline). */
function networkFirst(request) {
    return fetch(request).then((response) => {
        if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
    }).catch(() => {
        return caches.match(request).then((cached) => {
            if (cached) return cached;
            if (request.mode === 'navigate') return caches.match('./index.html');
            return Response.error();
        });
    });
}

/* Cache-first for same-origin static images (the app icon):
   serve the cached copy, otherwise fetch, store, and trim so
   the cache cannot grow without bound. */
function cacheFirstImage(request) {
    return caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((response) => {
                if (response && response.ok) {
                    const copy = response.clone();
                    cache.put(request, copy).then(() => trimImageCache(cache)).catch(() => {});
                }
                return response;
            });
        });
    });
}

function trimImageCache(cache) {
    return cache.keys().then((keys) => {
        if (keys.length <= IMAGE_CACHE_MAX) return;
        const excess = keys.slice(0, keys.length - IMAGE_CACHE_MAX);
        return Promise.all(excess.map((key) => cache.delete(key)));
    }).catch(() => {});
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => Promise.all(
                /* Guarded per-file: one failed precache must not
                   kill the whole install. */
                SHELL_FILES.map((file) => cache.add(file).catch(() => {}))
            ))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                /* Purge EVERY cache that is not this pack's own —
                   including any left behind by older builds. */
                keys.filter((key) => KNOWN_CACHES.indexOf(key) === -1)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    /* Only GET is ever handled — every API write passes
       through untouched by definition. */
    if (request.method !== 'GET') return;

    let url;
    try { url = new URL(request.url); } catch (e) { return; }

    /* Never intercept non-http(s) schemes (data:, blob:, …). */
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    /* Only same-origin requests are handled. All API traffic
       (anime databases, song sources, cloud sync) is
       cross-origin and goes straight to the network. */
    if (url.origin !== self.location.origin) return;

    if (isShellRequest(request, url)) {
        event.respondWith(networkFirst(request));
        return;
    }

    if (isImageRequest(request, url)) {
        event.respondWith(cacheFirstImage(request));
        return;
    }

    /* Everything else: let the browser handle it normally. */
});
