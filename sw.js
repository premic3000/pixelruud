// PixelRuud Service Worker
// Version: 20260328-0900
// ⚠️ WICHTIG: Bei jedem Deploy diese Datei ebenfalls pushen!
// CACHE_NAME Timestamp aktualisieren → Browser löscht alten Cache automatisch
// Format: YYYYMMDD-HHMM
const CACHE_NAME = 'pixelruud-20260410-0747';
const TILE_CACHE = 'pixelruud-tiles-v1';
const TILE_CACHE_MAX = 500;

// Nur eigene Dateien cachen beim Install — CDN kommt später on-demand
const APP_SHELL = [
    '/app.html',
    '/index.html',
];

// ── Install ────────────────────────────────────────────────────────
self.addEventListener('install', event => {
    console.log('[SW] Installing 20260327-2147');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // Jeden URL einzeln — Fehler bei einem blockiert nicht den Rest
            return Promise.allSettled(
                APP_SHELL.map(url =>
                    cache.add(url).catch(e =>
                        console.warn('[SW] Skip:', url, e.message)
                    )
                )
            );
        }).then(() => {
            console.log('[SW] Install complete, skipping waiting');
            return self.skipWaiting();
        })
    );
});

// ── Activate ───────────────────────────────────────────────────────
self.addEventListener('activate', event => {
    console.log('[SW] Activating 20260327-2147');
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME && k !== TILE_CACHE)
                    .map(k => {
                        console.log('[SW] Deleting old cache:', k);
                        return caches.delete(k);
                    })
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch ──────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Nur GET cachen
    if (event.request.method !== 'GET') return;

    // API-Calls → immer Network
    if (isAPICall(url)) return;

    // Kartenkacheln → Cache First mit Limit
    if (isMapTile(url)) {
        event.respondWith(tileStrategy(event.request));
        return;
    }

    // Alles andere → Cache First, dann Network
    event.respondWith(cacheFirstStrategy(event.request));
});

async function cacheFirstStrategy(request) {
    try {
        const cached = await caches.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        const cached = await caches.match('/app.html');
        return cached || new Response('Offline', { status: 503 });
    }
}

async function tileStrategy(request) {
    try {
        const cached = await caches.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response && response.ok) {
            const cache = await caches.open(TILE_CACHE);
            const keys = await cache.keys();
            if (keys.length >= TILE_CACHE_MAX) {
                await Promise.all(keys.slice(0, 50).map(k => cache.delete(k)));
            }
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        return new Response('', { status: 503 });
    }
}

function isMapTile(url) {
    return (
        url.hostname.includes('tile.openstreetmap.org') ||
        url.hostname.includes('tiles.stadiamaps.com') ||
        url.hostname.includes('tile.waymarkedtrails.org') ||
        url.pathname.match(/\/\d+\/\d+\/\d+\.(png|jpg|webp)$/)
    );
}

function isAPICall(url) {
    return (
        url.hostname.includes('railway.app') ||
        url.hostname.includes('brouter.de') ||
        url.hostname.includes('nominatim.openstreetmap.org') ||
        url.hostname.includes('supabase.co') ||
        url.hostname.includes('graphhopper.com') ||
        url.hostname.includes('router.project-osrm.org') ||
        url.hostname.includes('open-elevation.com') ||
        url.hostname.includes('goatcounter.com') ||
        url.hostname.includes('anthropic.com')
    );
}
