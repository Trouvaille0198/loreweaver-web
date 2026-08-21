// Loreweaver Web service worker — offline-first app shell.
//
// The web client is a pure SPA: everything it needs to boot lives in hashed
// assets under /assets/, and the server's --web mode serves them with
// Cache-Control: immutable. So the shell is small and safe to cache:
//   - the index.html entry (precache, network-first so deploys win fast)
//   - every /assets/* hashed file (cache-first, they never change)
//   - the manifest + icons
//
// The game itself lives on a WebSocket — no request goes through this worker,
// so a stale worker can never cut a live table.

const PRECACHE = "loreweaver-web-v1"
const PRECACHE_URLS = ["/", "/index.html", "/manifest.webmanifest", "/icon.png", "/apple-touch-icon.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== PRECACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Hashed build assets are immutable — cache-first, no revalidation.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        const copy = response.clone()
        void caches.open(PRECACHE).then((cache) => cache.put(request, copy))
        return response
      })),
    )
    return
  }

  // The HTML entry and anything else: network-first, cache as fallback — a
  // deploy must reach the next visitor immediately, not after a stale shell.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone()
        void caches.open(PRECACHE).then((cache) => cache.put(request, copy))
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match("/index.html"))),
  )
})
