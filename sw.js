/* RIG shell. Two rules from Almanac, kept:
 * 1. Never cache /api/.
 * 2. Bypass the HTTP cache for the shell (cache: reload) so a tap on the
 *    version pill actually gets the new build.
 */
const VERSION = "rig-shell-v1";

self.addEventListener("message", (e) => {
  if (e.data?.type === "VERSION") {
    e.source?.postMessage({ type: "VERSION", version: VERSION });
  }
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (e) => {
  const base = self.registration.scope;
  const assets = ["", "index.html", "styles.css", "app.js", "manifest.json", "icon.svg"]
    .map((p) => new URL(p, base).href);
  e.waitUntil(
    caches.open(VERSION).then((c) =>
      Promise.all(
        assets.map((u) =>
          fetch(u, { cache: "reload" }).then((r) => {
            if (!r.ok) throw new Error("shell fetch failed: " + u + " " + r.status);
            return c.put(u, r);
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request, { cache: "reload" })
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
