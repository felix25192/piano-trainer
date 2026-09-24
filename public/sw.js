/*
 * The service worker: what makes a deploy safe and the recordings offline.
 *
 * The problem it exists for. Every build names its code after its contents —
 * `main-D5S2LXl4.js` — and GitHub Pages deletes the old files on each deploy.
 * A home-screen app that kept yesterday's `index.html` then asks for a file
 * that is gone, React never starts, and what is left on screen is the
 * background colour. Pulling down to refresh fixed it; this fixes it for good.
 *
 * Three rules, one per kind of file:
 *
 * Pages come from the network first. The newest `index.html` is what names
 * the right code, so it is always asked for, and the cached one is only the
 * answer when there is no network at all.
 *
 * Code comes from the cache first. A hashed file never changes under its
 * name, so once fetched it is good forever — and it has to stay available for
 * as long as a cached page still names it. What no cached page names any more
 * is thrown away, or every deploy would leave another megabyte and a half on
 * the device.
 *
 * Recordings and scores come from the cache first too, and the thirty
 * recordings are fetched as soon as this is installed: 1.9 MB, and then the
 * first passage played back works without a connection. That used to be the
 * one thing that needed the network.
 *
 * Plain JavaScript in `public/`, not TypeScript in `src/`: it has to sit at a
 * fixed address above the code it serves, with no hash in its name, and it
 * touches nothing the app decides. It knows no audio, no score and no engine.
 */

const PAGES = "pages-v1";
const CODE = "code-v1";
const MEDIA = "media-v1";

/** Where the app lives: "/piano-trainer/" when published. */
const BASE = new URL(self.registration.scope).pathname;

/** The recordings in `public/piano/`, one every minor third from A0. */
const RECORDINGS = [
  "A0", "C1", "Ds1", "Fs1", "A1", "C2", "Ds2", "Fs2", "A2", "C3", "Ds3", "Fs3",
  "A3", "C4", "Ds4", "Fs4", "A4", "C5", "Ds5", "Fs5", "A5", "C6", "Ds6", "Fs6",
  "A6", "C7", "Ds7", "Fs7", "A7", "C8",
].map((name) => `${BASE}piano/${name}.mp3`);

self.addEventListener("install", (event) => {
  /*
   * One by one and allowed to fail, rather than all or nothing. A single
   * recording that does not arrive must not keep the worker from starting;
   * it is fetched and kept the first time it is played instead.
   */
  event.waitUntil(
    caches
      .open(MEDIA)
      .then((cache) => Promise.allSettled(RECORDINGS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const current = [PAGES, CODE, MEDIA];
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !current.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  const path = url.pathname.slice(BASE.length);

  if (request.mode === "navigate" || path === "" || path.endsWith(".html")) {
    event.respondWith(page(request));
  } else if (path.startsWith("assets/")) {
    event.respondWith(kept(CODE, request));
  } else if (path.startsWith("piano/") || path.startsWith("scores/")) {
    event.respondWith(kept(MEDIA, request));
  }
});

/** Network first; the cached page only when there is no network. */
async function page(request) {
  const cache = await caches.open(PAGES);
  try {
    // "no-cache" revalidates with the server instead of taking the browser's
    // own copy, which GitHub Pages lets live for ten minutes.
    const response = await fetch(request, { cache: "no-cache" });
    if (response.ok) {
      await cache.put(request, response.clone());
      await pruneCode();
    }
    return response;
  } catch (offline) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw offline;
  }
}

/** Cache first; fetched and kept on the first request. */
async function kept(name, request) {
  const cache = await caches.open(name);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

/**
 * Throws away the code no cached page names any more.
 *
 * The pages are read rather than a list kept here, because the pages are the
 * only thing that knows which build they belong to. A page that is not
 * cached yet — the device test before its first visit — fetches its own code
 * when it is opened.
 */
async function pruneCode() {
  const pages = await caches.open(PAGES);
  const named = new Set();
  for (const request of await pages.keys()) {
    const response = await pages.match(request);
    const html = response ? await response.text() : "";
    for (const match of html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)) {
      named.add(new URL(match[1], request.url).pathname);
    }
  }

  const code = await caches.open(CODE);
  for (const request of await code.keys()) {
    if (!named.has(new URL(request.url).pathname)) await code.delete(request);
  }
}
