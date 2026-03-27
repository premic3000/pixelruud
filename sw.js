// PixelRuud Service Worker v1.0
// Caches app shell for offline use

const CACHE_NAME = 'pixelruud-v1';
const CACHE_VERSION = '3.61';

// App Shell — alles was für den ersten Load nötig ist
const APP_SHELL = [
    '/app.html',
    '/index.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    // Leaflet
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
    // Chart.js
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

// Tile Cache — separate, mit Limit
const TILE_CACHE = 'pixelruud-tiles-v1';
const TILE_CACHE_MAX = 500; // max 500 Kartenkacheln

// ── Install: App Shell cachen ──────────────────────────────────────
self.addEventListener('install', event => {
    console.log('[SW] Installing PixelRuud SW', CACHE_VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching app shell');
                // Cache einzeln damit ein Fehler nicht alles blockiert
                return Promise.allSettled(
                    APP_SHELL.map(url => cache.add(url).catch(e => {
                        console.warn('[SW] Could not cache:', url, e.message);
                    }))
                );
            })
            .then(() => self.skipWaiting())
    );
});

// ── Activate: Alte Caches löschen ─────────────────────────────────
self.addEventListener('activate', event => {
    console.log('[SW] Activating', CACHE_VERSION);
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

// ── Fetch: Strategie je nach Request-Typ ──────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 1. Kartenkacheln → Cache First mit Limit
    if (isMapTile(url)) {
        event.respondWith(tileStrategy(event.request));
        return;
    }

    // 2. API-Calls (Railway Backend, BRouter, Nominatim) → Network Only
    if (isAPICall(url)) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 3. App Shell (HTML, JS, CSS) → Cache First, dann Network
    event.respondWith(cacheFirstStrategy(event.request));
});

// ── Strategie: Cache First ─────────────────────────────────────────
async function cacheFirstStrategy(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok && response.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        // Offline-Fallback
        const fallback = await caches.match('/app.html');
        return fallback || new Response('Offline — bitte Internetverbindung prüfen', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

// ── Strategie: Tile Cache mit Limit ───────────────────────────────
async function tileStrategy(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(TILE_CACHE);
            // Limit einhalten
            const keys = await cache.keys();
            if (keys.length >= TILE_CACHE_MAX) {
                // Älteste 50 löschen
                await Promise.all(keys.slice(0, 50).map(k => cache.delete(k)));
            }
            cache.put(request, response.clone());
        }
        return response;
    } catch (e) {
        return new Response('', { status: 503 });
    }
}

// ── Helper: Ist es eine Kartenkachel? ─────────────────────────────
function isMapTile(url) {
    return (
        url.hostname.includes('tile.openstreetmap.org') ||
        url.hostname.includes('tiles.stadiamaps.com') ||
        url.hostname.includes('tile.waymarkedtrails.org') ||
        url.pathname.match(/\/\d+\/\d+\/\d+\.(png|jpg|webp)$/)
    );
}

// ── Helper: Ist es ein API-Call? ──────────────────────────────────
function isAPICall(url) {
    return (
        url.hostname.includes('railway.app') ||
        url.hostname.includes('brouter.de') ||
        url.hostname.includes('nominatim.openstreetmap.org') ||
        url.hostname.includes('supabase.co') ||
        url.hostname.includes('graphhopper.com') ||
        url.hostname.includes('router.project-osrm.org') ||
        url.hostname.includes('open-elevation.com') ||
        url.hostname.includes('goatcounter.com')
    );
}
