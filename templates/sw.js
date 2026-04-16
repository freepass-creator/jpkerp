/**
 * sw.js — JPK 모바일 Service Worker
 * 전략: 네트워크 우선 + 오프라인 폴백 (오래된 데이터 안보여주기)
 */
const VERSION = 'jpk-m-{{ v }}';
const SHELL = [
  '/m',
  '/static/css/tokens.css',
  '/static/css/mobile.css',
  '/static/manifest.webmanifest',
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.min.css',
  'https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css',
  'https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Firebase 실시간 DB/Storage 요청은 SW 패스
  const url = new URL(req.url);
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis')) return;
  if (req.method !== 'GET') return;

  // 네트워크 우선, 실패시 캐시
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy).catch(() => {}));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/m')))
  );
});
