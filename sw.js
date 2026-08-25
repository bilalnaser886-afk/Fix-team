// I Fix Team — Service Worker
// الوظيفة: تخزين ملفات النظام على الجهاز عشان يفتح ويشتغل من غير نت
//
// ⚠️ لو ضفت صفحة أو ملف جديد للنظام: زوّده في APP_SHELL تحت،
//    وزوّد رقم الإصدار (v4 → v5). تعديل ملف موجود مش محتاج تزويد الرقم —
//    ملفات الكود بتتقرا من النت الأول (شوف قسم fetch).
const CACHE_NAME = 'ifixteam-v27';

const APP_SHELL = [
  './',
  'index.html',
  'dashboard.html',
  'track.html',
  'my-devices.html',
  'dispatch.html',
  'dispatch-icon.png',
  'dispatch-icon-192.png',
  'dispatch-icon-512.png',
  'tech-icon.png',
  'tech-icon-192.png',
  'tech-icon-512.png',
  'admin.html',
  'checkout.html',
  'manifest.json',
  'i18n.js',
  'ai-invoice.js',
  'qr-scan.js',
  'jsQR.js',
  'fuzzy-search.js',
  'wholesale.js',
  'common.js',
  'points.js',
  'statuses.js',
  'accounts.js',
  'dock.js',
  'dock-tools.js',
  'assist.html',
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
      // reload = تجاهل كاش المتصفح نفسه وهات نسخة طازة من السيرفر.
      // addAll بتفشل كلها لو ملف واحد مش موجود، فبنخزّن كل ملف لوحده
      // عشان ملف ناقص ما يمنعش التثبيت كله.
      .then(cache => Promise.all(
        APP_SHELL.map(u =>
          cache.add(new Request(u, { cache: 'reload' })).catch(() => {})
        )
      ))
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

  const sameOrigin = url.origin === self.location.origin;
  const isDocument = req.mode === 'navigate' || req.destination === 'document';
  // ملفات الكود بتاعتنا (i18n.js / ai-invoice.js / أي css): أي تعديل لازم يوصل فوراً
  const isAppCode = sameOrigin && /\.(js|css)$/i.test(url.pathname);

  // صفحات HTML وملفات الكود: النت الأول (عشان التحديثات توصل)،
  // ولو مفيش نت → النسخة المخزنة
  if(isDocument || isAppCode){
    event.respondWith(
      fetch(req)
        .then(res => {
          // ما نخزّنش رد بايظ (404 أو صفحة خطأ) فوق نسخة شغالة
          if(res && res.status === 200){
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then(hit => hit || (isDocument
            ? caches.match('dashboard.html').then(d => d || caches.match('index.html'))
            : undefined))
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
