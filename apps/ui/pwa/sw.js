// Service worker for the installed web app: keeps the app shell (HTML, scripts, styles, fonts, icons)
// so the viewer opens fast and starts offline. It only handles same-origin GET requests: GitHub API
// calls go to api.github.com and are never cached, and the token lives in localStorage, not here.
// The guide under ./guide/ is a separate site and is left alone.

const CACHE = "researchtree-shell-v1";
const SCOPE = new URL(self.registration.scope).pathname;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch (e) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  if (url.pathname.startsWith(SCOPE + "guide/")) return;

  if (request.mode === "navigate") {
    // Always try the network first so a new deploy shows up; the query (?repo=, ?code=) is not part of the key.
    event.respondWith(networkFirst(request, SCOPE));
  } else if (url.pathname.startsWith(SCOPE + "assets/")) {
    // Built files have content hashes in their names, so a cached copy never goes stale.
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request, request));
  }
});
