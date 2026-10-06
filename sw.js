// Offline support: precache the app shell; data is network-first (so yearly
// updates arrive promptly), CDN libraries and fonts are cache-first.
const VERSION = 'wtg-v2';
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'css/print.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'js/app.js',
  'js/lib/data.js', 'js/lib/gazetteer.js', 'js/lib/util.js', 'js/lib/libs.js', 'js/lib/strings.js',
  'js/core/dates.js', 'js/core/season.js', 'js/core/score.js', 'js/core/holidays.js', 'js/core/prices.js',
  'js/ui/strip.js', 'js/ui/map.js', 'js/ui/charts.js', 'js/ui/search.js', 'js/ui/cards.js', 'js/ui/share.js',
  'js/views/home.js', 'js/views/country.js', 'js/views/finder.js', 'js/views/compare.js',
  'js/views/saved.js', 'js/views/plan.js', 'js/views/about.js',
  'data/index.json', 'data/meta.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.includes('/data/')) e.respondWith(networkFirst(req));
    else if (req.mode === 'navigate') e.respondWith(networkFirst(req));
    else e.respondWith(staleWhileRevalidate(req));
  } else if (/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    e.respondWith(cacheFirst(req));
  }
});
