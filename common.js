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

// ===== 👤 صفحة "حسابي" المشتركة =====
// الفني والديسباتشر بيفتحوا صفحات مستقلة عن الداشبورد، فبنحط
// الشاشة هنا مرة واحدة والصفحتين بتستخدموها.
//
// الاستخدام في الصفحة:
//   1) زرار في القايمة:  <button id="accountMenuBtn" class="hidden" onclick="openAccountShared()">👤 حسابي</button>
//   2) بعد تسجيل الدخول: syncAccountShared(email, name, roleLabel)
const SUBINFO_KEY = 'subscription-info';
let _accUser = { email:'', name:'', role:'' };
let _accInfo = {};

// بيظهر الزرار **بس** لو الشخص ده وصله منشور خطط الاشتراك
async function syncAccountShared(email, name, roleLabel){
  _accUser = { email:(email||'').toLowerCase(), name:name||'', role:roleLabel||'' };
  const btn = document.getElementById('accountMenuBtn');
  if(!btn) return;
  if(!_accUser.email){ btn.classList.add('hidden'); return; }
  const key = 'broadcast:user:' + _accUser.email;
  try{
    const { data, error } = await sb.from('app_data').select('value').eq('key', key).maybeSingle();
    if(error) throw error;
    let show = false;
    if(data && data.value){
      try{ show = JSON.parse(data.value).subPlan === true; }catch(e){}
      if(!show) console.info('[حسابي] فيه منشور شخصي بس مش منشور أسعار');
    }else{
      console.info('[حسابي] مفيش منشور شخصي على المفتاح:', key);
    }
    btn.classList.toggle('hidden', !show);
    // مش بنعتمد على الـ CSS لوحده — بنقفل العرض مباشرة كمان،
    // عشان لو الصفحة مفيهاش قاعدة .hidden يفضل الإخفاء شغّال.
    btn.style.display = show ? '' : 'none';
  }catch(e){
    console.error('[حسابي] فشلت قراءة المنشور:', e);
    btn.classList.add('hidden');
    btn.style.display = 'none';
  }
}

async function openAccountShared(){
  try{
    const { data } = await sb.from('app_data').select('value').eq('key', SUBINFO_KEY).maybeSingle();
    _accInfo = (data && data.value) ? (JSON.parse(data.value) || {}) : {};
  }catch(e){ _accInfo = {}; }

  let ov = document.getElementById('accSharedOv');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'accSharedOv';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99990;background:rgba(8,14,20,.6);'
      + 'display:flex;align-items:flex-end;justify-content:center;';
    ov.onclick = e => { if(e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
  }
  const P = PLANS.map(p =>
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;'
    + 'border:1px solid rgba(128,128,128,.3);border-radius:12px;padding:12px 14px;margin-bottom:8px;">'
    + '<div><b>' + esc(p.label) + '</b>'
    + (p.off ? ' <span style="background:#16A34A;color:#fff;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:800;">وفّر ' + p.off + '%</span>' : '')
    + '</div><div style="font-weight:800;font-size:13px;white-space:nowrap;">' + esc(planPrice(p)) + '</div></div>').join('');

  ov.innerHTML =
    '<div dir="rtl" style="width:100%;max-width:560px;max-height:90vh;overflow-y:auto;background:#0F172A;'
    + 'color:#E2E8F0;border-radius:18px 18px 0 0;padding:18px 16px 40px;font-family:inherit;">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">'
      + '<h3 style="margin:0;flex:1;font-size:16px;">👤 حسابي</h3>'
      + '<button onclick="document.getElementById(\'accSharedOv\').remove()" '
        + 'style="border:none;background:#1E293B;color:#E2E8F0;width:34px;height:34px;border-radius:10px;font-size:16px;cursor:pointer;">✕</button>'
    + '</div>'
    + '<div style="border:1px solid rgba(128,128,128,.3);border-radius:14px;padding:14px;margin-bottom:12px;line-height:2;">'
      + '<div>الاسم: <b>' + esc(_accUser.name || '—') + '</b></div>'
      + '<div>البريد: <span dir="ltr">' + esc(_accUser.email || '—') + '</span></div>'
      + (_accUser.role ? '<div>الصلاحية: <b>' + esc(_accUser.role) + '</b></div>' : '')
    + '</div>'
    + '<div style="font-weight:800;margin:16px 0 8px;">📦 خطط الاشتراك</div>' + P
    + '<div style="font-size:12.5px;opacity:.75;line-height:1.9;margin-bottom:16px;">'
      + '💳 سيتم إرسال طرق الدفع المتاحة على بريدكم الإلكتروني بعد تسجيل البيانات.</div>'
    + '<div style="font-weight:800;margin:16px 0 6px;">📝 بيانات التواصل للاشتراك</div>'
    + '<div style="font-size:12px;opacity:.75;margin-bottom:8px;">تقدر تعدّلها في أي وقت — التعديل بيوصل للإدارة على طول.</div>'
    + '<input id="acName"  placeholder="الاسم"            value="' + esc(_accInfo.name||'')  + '" style="' + _accIn() + '">'
    + '<input id="acPhone" placeholder="رقم الهاتف" dir="ltr" value="' + esc(_accInfo.phone||'') + '" style="' + _accIn() + '">'
    + '<input id="acEmail" placeholder="البريد الإلكتروني" dir="ltr" value="' + esc(_accInfo.email||'') + '" style="' + _accIn() + '">'
    + '<select id="acPlan" style="' + _accIn() + '">'
      + '<option value="">— الخطة المطلوبة (اختياري) —</option>'
      + PLANS.map(p => '<option value="' + esc(p.label) + '"' + (_accInfo.plan===p.label?' selected':'') + '>' + esc(p.label) + '</option>').join('')
    + '</select>'
    + '<button onclick="saveAccountShared()" style="width:100%;padding:13px;border:none;border-radius:12px;'
      + 'background:#0891A8;color:#fff;font:800 14px/1 inherit;cursor:pointer;margin-top:4px;">💾 حفظ البيانات</button>'
    + (_accInfo.at ? '<div style="font-size:12px;opacity:.7;margin-top:8px;">آخر تحديث: ' + new Date(_accInfo.at).toLocaleString('ar-EG') + '</div>' : '')
    + '</div>';
}
function _accIn(){
  return 'width:100%;padding:11px 13px;border-radius:11px;border:1px solid rgba(128,128,128,.35);'
    + 'background:#1E293B;color:#E2E8F0;font:inherit;font-size:13.5px;margin-bottom:8px;';
}

async function saveAccountShared(){
  const g = id => (document.getElementById(id)||{}).value || '';
  const name = g('acName').trim(), phone = g('acPhone').trim(), email = g('acEmail').trim();
  if(!name || !phone || !email){ alert('اكتب الاسم والرقم والإيميل'); return; }
  if(!/^\S+@\S+\.\S+$/.test(email)){ alert('الإيميل مش مظبوط'); return; }
  const payload = { name, phone, email, plan:g('acPlan'), at:new Date().toISOString(), by:_accUser.email };
  try{
    const { error } = await sb.from('app_data')
      .upsert({ key:SUBINFO_KEY, value:JSON.stringify(payload), updated_at:new Date().toISOString() });
    if(error) throw error;
    _accInfo = payload;
    alert('اتحفظت ✅ — هيتم إرسال طرق الدفع على بريدك');
    const ov = document.getElementById('accSharedOv'); if(ov) ov.remove();
  }catch(e){
    console.error('saveAccountShared failed:', e);
    // 42501 = الصلاحية رفضت الكتابة (RLS) — رسالة واضحة بدل كود غامض
    const perm = e && (e.code === '42501' || /row-level security/i.test(e.message || ''));
    alert(perm
      ? 'الحفظ اترفض من الصلاحيات — بلّغ الأدمن يشغّل ملف 15-subinfo-write.sql'
      : 'فشل الحفظ: ' + (e.message || e));
  }
}

// ===== تأمين النصوص قبل عرضها في الصفحة =====
// النسخة الأأمن: بتأمّن ٥ رموز (بما فيها ' المفردة) — بتمنع أي حقن HTML.
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
