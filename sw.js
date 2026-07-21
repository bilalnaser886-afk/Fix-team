// I Fix Team — Service Worker
// الوظيفة: تخزين ملفات النظام على الجهاز عشان يفتح ويشتغل من غير نت
const CACHE_NAME = 'ifixteam-v1';

const APP_SHELL = [
  './',
  'index.html',
  'dashboard.html',
  'track.html',
  'manifest.json',
  'logo.jpg',
  'favicon.ico',
  'favicon-32.png',
  'icon-192.png',
  'apple-touch-icon.png',
  'icon-512.png',
];

// التثبيت: تخزين ملفات النظام الأساسية
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// التفعيل: مسح الكاش القديم لو الإصدار اتغير
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);

  // طلبات Supabase (بيانات) متتخزنش أبداً — دي شغل طبقة الأوفلاين جوه التطبيق
  if(url.hostname.endsWith('.supabase.co')) return;

  // صفحات HTML: النت الأول (عشان التحديثات توصل)، ولو مفيش نت → النسخة المخزنة
  if(req.mode === 'navigate' || req.destination === 'document'){
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then(hit => hit || caches.match('dashboard.html').then(d => d || caches.match('index.html')))
        )
    );
    return;
  }

  // باقي الملفات (صور، خطوط، مكتبات CDN): الكاش الأول، ولو مش موجود → النت ويتخزن
  event.respondWith(
    caches.match(req).then(hit => {
      if(hit) return hit;
      return fetch(req).then(res => {
        if(res && (res.status === 200 || res.type === 'opaque')){
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
