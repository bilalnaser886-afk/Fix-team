// I Fix Team — Service Worker
// الوظيفة: تخزين ملفات النظام على الجهاز عشان يفتح ويشتغل من غير نت
//
// ⚠️ لو ضفت صفحة أو ملف جديد للنظام: زوّده في APP_SHELL تحت،
//    وزوّد رقم الإصدار (v4 → v5). تعديل ملف موجود مش محتاج تزويد الرقم —
//    ملفات الكود بتتقرا من النت الأول (شوف قسم fetch).
const CACHE_NAME = 'ifixteam-v58';

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
  'hr.html',
  'staff.html',
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
  'label.js',
  'attendance.js',
  'payroll.js',
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

// ============================================================
// 🔔 الإشعارات خارج التطبيق (Web Push)
// ------------------------------------------------------------
// الـ service worker ده بيفضل شغّال حتى والتطبيق مقفول — وده
// السبب الوحيد اللي بيخلّي الإشعار يوصل وإنت برّه التطبيق.
// السيرفر بيبعت الرسالة **له هو**، مش للصفحة.
//
// ⚠️ userVisibleOnly=true في الاشتراك معناها وعد للمتصفح:
//    «كل رسالة توصل، هطلّع منها إشعار مرئي». لو استقبلنا رسالة
//    وما طلّعناش إشعار، المتصفح بيلغي الاشتراك بعد كام مرة.
//    عشان كده showNotification بتتنده **دايماً**، حتى لو البيانات
//    جت بايظة — بنطلّع رسالة عامة بدل ما نسكت.
// ============================================================
self.addEventListener('push', (event) => {
  let d = {};
  try{ d = event.data ? event.data.json() : {}; }catch(e){ d = {}; }

  const title = d.title || 'تحديث جديد';
  const opts  = {
    body:  d.body || 'افتح التطبيق للتفاصيل',
    icon:  'icon-192.png',
    badge: 'icon-192.png',
    dir:   'rtl',
    lang:  'ar',
    // tag واحد = الإشعار الجديد بيستبدل القديم بدل ما يتكوّم ٢٠ إشعار
    tag:   d.tag || 'ifix-payroll',
    renotify: true,
    data:  { url: d.url || 'index.html' }
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

// ============================================================
// الدوس على الإشعار
// ------------------------------------------------------------
// ⚠️ لو التطبيق مفتوح في الخلفية، بنركّز عليه بدل ما نفتح تبويب
//    جديد. من غير الفحص ده الموظف بيلاقي نسختين من التطبيق
//    مفتوحين — وفي وضع الشاشة الرئيسية النسخة الجديدة مالهاش
//    زرار رجوع خالص.
// ============================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || 'index.html';
  event.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
      for(const c of list){
        if(c.url.indexOf(self.location.origin) === 0 && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
