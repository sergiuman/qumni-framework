const CACHE_NAME = 'momentum-v8';
const ASSETS = [
    './',
    './index.html',
    './app.php',
    './app.js',
    './styles.css',
    './manifest.json',
    './assets/icon-192.png',
    './assets/icon-512.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // Use catch() so failing to cache one file doesn't break the whole SW
            return Promise.all(
                ASSETS.map(async url => {
                    try {
                        const response = await fetch(url);
                        if (response.ok || response.type === 'opaque') {
                            const responseToCache = response.redirected ? await cleanResponse(response) : response;
                            await cache.put(url, responseToCache);
                        }
                    } catch (err) {
                        console.log('Failed to cache:', url, err);
                    }
                })
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    // Only intercept GET requests, leave POST (like audio uploads) alone
    if (e.request.method !== 'GET') return;
    // Don't intercept API calls
    if (e.request.url.includes('api.php')) return;

    e.respondWith(
        caches.match(e.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(e.request).then(async response => {
                // Safari workaround for "Response served by service worker has redirections"
                if (response.redirected) {
                    return await cleanResponse(response);
                }
                return response;
            });
        })
    );
});

function cleanResponse(response) {
    const clonedResponse = response.clone();

    // Create a new response with the same body and headers, but not marked as redirected
    const bodyPromise = 'body' in clonedResponse ?
        Promise.resolve(clonedResponse.body) :
        clonedResponse.blob();

    return bodyPromise.then((body) => {
        return new Response(body, {
            headers: clonedResponse.headers,
            status: clonedResponse.status,
            statusText: clonedResponse.statusText,
        });
    });
}
