// ============================================================
// I Fix Team — كود مشترك بين كل الصفحات (common.js)
// ------------------------------------------------------------
// الفكرة ببساطة: الحاجات اللي كانت متكرّرة في كل ملف (الاتصال بقاعدة
// البيانات، تحديد البيئة، شريط التجربة، تأمين النصوص) بنكتبها هنا
// **مرة واحدة بس**. أي تعديل هنا بيسري على كل الصفحات على طول.
//
// ⚠️ الترتيب مهم — لازم يتحمّل بعد مكتبة supabase-js وقبل كود الصفحة:
//     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//     <script src="common.js"></script>
//     <script> ...كود الصفحة... </script>
//
// ⚠️ أي صفحة بتضيف common.js لازم **تشيل** من كودها التعريفات دي:
//     SUPABASE_ENVS · PROD_HOSTS · APP_ENV · sb · esc  (+ شريط STAGING)
//     لو فضلت متعرّفة في الصفحة كمان، المتصفح هيقول
//     "Identifier already declared" والصفحة **كلها هتقع**.
// ============================================================

// ===== إعدادات البيئة: إنتاج / تجريبي (Staging) =====
// نطاق الإنتاج بس بيستخدم قاعدة الإنتاج. أي نطاق تاني (تجريبي/معاينة/
// لوكال) بيستخدم Staging تلقائياً — عشان مستحيل نشر تجريبي يلمس
// بيانات الإنتاج بالغلط.
const SUPABASE_ENVS = {
  production: {
    url: "https://ujpnewqqdkmiedtwvdsy.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqcG5ld3FxZGttaWVkdHd2ZHN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MzI0ODEsImV4cCI6MjEwMDAwODQ4MX0.PVreBU_ONzAsHO58AJgXVUhuZjvz0quJU8OTxEVcjDc"
  },
  staging: {
    url: "https://farfaazxogpvxmujnedu.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcmZhYXp4b2dwdnhtdWpuZWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNDc2MzQsImV4cCI6MjEwMDYyMzYzNH0.uCWokM2rtM20PPCVGCfsW5X0WkDYi2Bl3jcqiogBsME"
  }
};

// نطاقات الإنتاج بس. أي دومين مش في القايمة = staging.
// ⚠️ عن قصد مش بنحط دومين المعاينة (assistant.fix-team.pages.dev) هنا،
//    عشان النسخة القديمة عليه ما تلمسش قاعدة الإنتاج بالغلط.
//    لو جبت دومين مخصص (زي ifixteam.com) زوّده هنا.
const PROD_HOSTS = ["fix-team.pages.dev"];
const APP_ENV = PROD_HOSTS.includes(location.hostname) ? "production" : "staging";
const sb = supabase.createClient(SUPABASE_ENVS[APP_ENV].url, SUPABASE_ENVS[APP_ENV].key);

// شريط أصفر تحت الشاشة لو إحنا على بيئة التجربة — عشان تفرّق بسرعة
// إنك مش على الإنتاج.
if (APP_ENV === "staging") {
  addEventListener("DOMContentLoaded", function () {
    var b = document.createElement("div");
    b.textContent = "🧪 بيئة تجريبية — STAGING";
    b.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#B45309;color:#fff;text-align:center;font:700 12px/1.7 system-ui,sans-serif;padding:5px;";
    document.body.appendChild(b);
  });
}

// ===== خطط الاشتراك =====
// ⚠️ الأسعار وسعر الصرف هنا **مرة واحدة بس**. بيظهروا في المنشور،
//    وفي صفحة "حسابي"، وفي لوحة الأدمن.
//
// 🔧 عايز تغيّر سعر الدولار؟ غيّر الرقم اللي تحت وارفع common.js. خلاص.
//    وعايز تغيّر سعر خطة؟ غيّر رقم usd بتاعها هنا.
const USD_RATE = 50;   // ← سعر الدولار بالجنيه (غيّره من هنا لما يتغيّر)
const PLANS = [
  { key:'monthly', label:'شهري',   months:1, usd:270,  off:0  },
  { key:'quarter', label:'٣ شهور', months:3, usd:770,  off:5  },
  { key:'half',    label:'٦ شهور', months:6, usd:1458, off:10 },
];
// تنسيق السعر: بالدولار وجنبه ما يعادله بالمصري
function planPrice(p){
  const egp = Math.round(p.usd * USD_RATE);
  return '$' + p.usd.toLocaleString('en-US') + ' (ما يعادل ' + egp.toLocaleString('en-US') + ' ج.م)';
}

// ===== شاشة إيقاف الخدمة =====
// بتظهر لما الفترة المجانية تخلص والاشتراك مش مفعّل. رسالة واحدة
// لكل الصفحات، وأول ما يدوس "فهمت" بيتسجّل خروج ويتقفل.
//
// 🔧 لو رجعت تستخدم صفحة الدفع بعدين: نادي showServiceStopped(true)
//    وهتوديه لـ checkout.html بدل الخروج.
function showServiceStopped(toCheckout){
  if (document.getElementById('svcStopOv')) return;
  const ov = document.createElement('div');
  ov.id = 'svcStopOv';
  ov.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;background:#0B1220;color:#fff;' +
    'display:flex;align-items:center;justify-content:center;padding:24px;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;';
  ov.innerHTML =
    '<div dir="rtl" style="max-width:420px;text-align:center;">' +
      '<div style="font-size:52px;margin-bottom:10px;">⛔</div>' +
      '<h2 style="margin:0 0 10px;font-size:21px;font-weight:900;">تم إيقاف الخدمة</h2>' +
      '<p style="margin:0 0 22px;font-size:15px;line-height:2;opacity:.9;">' +
        'انتهت مدة الاشتراك الحالية.<br>برجاء الاشتراك لاستئناف الخدمة.' +
      '</p>' +
      '<button id="svcStopOk" style="width:100%;padding:14px;border:none;border-radius:12px;' +
        'background:#0891A8;color:#fff;font:900 15px/1 inherit;cursor:pointer;">فهمت</button>' +
    '</div>';
  document.body.appendChild(ov);
  document.getElementById('svcStopOk').onclick = async function(){
    this.disabled = true;
    this.textContent = 'جاري الإغلاق…';
    if (toCheckout) { window.location.href = 'checkout.html'; return; }
    try { await sb.auth.signOut(); } catch (e) {}
    try { window.close(); } catch (e) {}          // بيقفل التطبيق المثبّت
    window.location.href = 'index.html';          // احتياطي لو ما اتقفلش
  };
}

// ===== تأمين النصوص قبل عرضها في الصفحة =====
// النسخة الأأمن: بتأمّن ٥ رموز (بما فيها ' المفردة) — بتمنع أي حقن HTML.
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
