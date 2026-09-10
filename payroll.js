// ============================================================
// I Fix Team — شاشة «مرتبك» المشتركة (payroll.js)
// ------------------------------------------------------------
// الموظف بيشوف خصوماته وأسبابها. يدوس «فهمت» فالخصم يختفي —
// **والمجموع تحت بيفضل زي ما هو**.
//
// ⚠️ الترتيب — بعد common.js:
//     <script src="common.js"></script>
//     <script src="payroll.js"></script>
//
// الصفحة لازم توفّر حاجتين بس:
//   • زرار في القايمة:  class="pay-menu-btn" onclick="openPayroll()"
//   • عنصر فاضي:        <div id="payOverlay" class="hidden"></div>
//
// وخلاص. الباقي (الاستايل · الجرس · البانر · العدّاد) الملف
// بيعمله بنفسه.
//
// ============================================================
// 🔴 ٤ قواعد الملف قايم عليها:
//
// ١) **الموبايل بس.** زي شاشة المواعيد. كمبيوتر المحل مشترك،
//    فمرتب أي حد يبقى مكشوف لأي حد قاعد عليه.
//
// ٢) **«فهمت» بيعلّم مش بيمسح.** الصف بيفضل في قاعدة البيانات
//    للأبد. لو مسحناه، المجموع هيقل ومحدش هيعرف ليه.
//
// ٣) **المجموع من السيرفر مش من الجافاسكريبت.** الشاشة بتحمّل
//    آخر ٣٠٠ خصم بس. لو جمعنا اللي محمّل هيبقى ناقص في صمت.
//    دالة hr_my_deduction_totals بتعدّ على كل الصفوف.
//
// ٤) **الملف مش بيعتمد على أي متغيّر من الصفحة.** بيقرا
//    data-theme من <html> ويعرّف ألوانه بنفسه — نفس درس
//    attendance.js. أي صفحة جديدة هتشتغل من غير أي تعديل.
// ============================================================

// ⚙️ مفتاح الإشعارات خارج التطبيق (VAPID public key).
//    سيبه فاضي = كل حاجة تشتغل عادي **من غير** إشعار خارجي.
//    عايز تشغّله؟ اقرا 34-push-subscriptions.sql — فيه الخطوات.
const PAY_VAPID_PUBLIC_KEY = '';

let _payRows   = [];
let _payTotals = { total_all:0, total_month:0, unseen_count:0, unseen_amount:0,
                   salary:0, has_salary:false, net_month:0 };
let _payErr    = '';
let _payBusy   = false;
let _payLoaded = false;

// ===== هل ده موبايل؟ =====
// ⚠️ نفس منطق attIsPhone بالحرف — بس متكرّر عن قصد عشان
//    payroll.js يشتغل حتى في صفحة مش محمّلة attendance.js.
//    التكرار هنا أرخص من اعتماد صامت بيقع.
function payIsPhone(){
  try{
    const ua = navigator.userAgent || '';
    const mobileUA = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
    const touch = (navigator.maxTouchPoints || 0) > 0;
    return mobileUA && touch;
  }catch(e){ return false; }
}

function payMoney(n){
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0,
                                     maximumFractionDigits: 2 });
}
// esc جاية من common.js — بس بنحط بديل لو الصفحة نسيت تحمّله
const _payEsc = (s) => (typeof esc === 'function')
  ? esc(s)
  : String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// ============================================================
// القراءة
// ============================================================
async function payLoad(){
  _payErr = '';
  try{
    // ⚠️ ترتيب قبل قص. لو قصّينا ٣٠٠ الأول وبعدين رتّبنا، أحدث
    //    خصم ممكن ما يظهرش خالص — نفس الدرس اللي وقعنا فيه قبل كده.
    const { data, error } = await sb.from('hr_deductions')
      .select('id,amount,reason,work_date,created_at,seen_at')
      .order('created_at', { ascending: false })
      .limit(300);
    if(error) throw error;
    _payRows = data || [];

    const t = await sb.rpc('hr_my_deduction_totals');
    if(t.error) throw t.error;
    const r = Array.isArray(t.data) ? t.data[0] : t.data;
    _payTotals = r || { total_all:0, total_month:0, unseen_count:0, unseen_amount:0,
                        salary:0, has_salary:false, net_month:0 };
    _payLoaded = true;
  }catch(e){
    // ⚠️ الفشل الصامت هنا خطر: الشاشة تقول «مفيش خصومات ✅»
    //    والموظف يفتكر إنه سليم وهو متخصوم. بنقول فيه مشكلة.
    console.error('payLoad failed:', e);
    _payErr    = (e && e.message) ? e.message : String(e);
    _payRows   = [];
    _payTotals = { total_all:0, total_month:0, unseen_count:0, unseen_amount:0,
                   salary:0, has_salary:false, net_month:0 };
    _payLoaded = false;
  }
  paySyncBadge();
}

// ============================================================
// الجرس: البانر في الصفحة الرئيسية + العدّاد على زرار القايمة
// ------------------------------------------------------------
// البانر بيتحقن تحت .topbar مباشرة. الصفحات التلاتة كلها
// بتبدأ بـ <div class="topbar">، ولو صفحة جديدة مالهاش topbar
// بيتحط في أول الـ body — مفيش حالة بيختفي فيها في صمت.
// ============================================================
function paySyncBadge(){
  const show = payIsPhone();
  const n    = Number(_payTotals.unseen_count || 0);

  // (١) زرار القايمة: يظهر على الموبايل بس، وعليه العدد
  document.querySelectorAll('.pay-menu-btn').forEach(b => {
    b.style.display = show ? '' : 'none';
    if(!b.dataset.payLabel) b.dataset.payLabel = b.textContent.trim();
    b.textContent = b.dataset.payLabel + (n ? ` (${n})` : '');
  });

  // (٢) نقطة حمرا على زرار الثلاث نقط — عشان القايمة مقفولة
  const kebab = document.querySelector('.kebab-btn, .menu-btn, .icon-btn');
  if(kebab){
    let dot = kebab.querySelector('.pay-dot');
    if(show && n){
      if(!dot){
        kebab.style.position = kebab.style.position || 'relative';
        dot = document.createElement('span');
        dot.className = 'pay-dot';
        kebab.appendChild(dot);
      }
    }else if(dot){ dot.remove(); }
  }

  // (٣) البانر
  payRenderBanner(show && n > 0);
}

function payRenderBanner(on){
  let bar = document.getElementById('payBanner');
  if(!on){ if(bar) bar.remove(); return; }
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'payBanner';
    bar.onclick = () => openPayroll();
    const top = document.querySelector('.topbar');
    if(top && top.parentNode) top.parentNode.insertBefore(bar, top.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
  }
  bar.innerHTML =
    '<span class="pay-bell">🔔</span>' +
    '<span class="pay-bn-txt">حصل تحديث في شاشة <b>مرتبك</b> — يرجى الاطلاع عليه</span>' +
    '<span class="pay-bn-go">افتح ›</span>';
}

// ============================================================
// الشاشة
// ============================================================
async function openPayroll(){
  if(!payIsPhone()){
    alert('شاشة «مرتبك» بتتفتح من الموبايل بس');
    return;
  }
  const ov = document.getElementById('payOverlay');
  if(!ov){ console.error('payroll: العنصر #payOverlay مش موجود في الصفحة'); return; }
  ov.classList.remove('hidden');
  payRender('⏳ جاري التحميل…');
  await payLoad();
  payRender('');
}
function closePayroll(){
  const ov = document.getElementById('payOverlay');
  if(ov) ov.classList.add('hidden');
}

function payRender(busyMsg){
  const ov = document.getElementById('payOverlay');
  if(!ov) return;

  // ⚠️ اللي لسه ما اتقراش فوق، والمقروء تحت في قسم مطوي.
  //    الموظف لما يفتح لازم يشوف الجديد على طول.
  const unseen = _payRows.filter(r => !r.seen_at);
  const seen   = _payRows.filter(r =>  r.seen_at);

  ov.innerHTML = `
    <div class="pay-page">
      <div class="pay-head">
        <h2>💰 مرتبك</h2>
        <button class="pay-close" onclick="closePayroll()">×</button>
      </div>
      <div class="pay-body">

        ${_payErr ? `<div class="pay-warn">⚠️ مقدرناش نقرا خصوماتك — الأرقام تحت
          <b>مش مضمونة</b>. حدّث الصفحة أو كلّم الإدارة.
          <span class="pay-warn-d">${_payEsc(_payErr)}</span></div>` : ''}

        ${busyMsg ? `<div class="pay-busy">${_payEsc(busyMsg)}</div>` : ''}

        ${unseen.length ? `
          <div class="pay-sec">🔔 خصومات جديدة — اقراها ودوس «فهمت»</div>
          ${unseen.map(payCard).join('')}
        ` : (busyMsg || _payErr ? '' : `
          <div class="pay-ok">✅ مفيش خصومات جديدة</div>
        `)}

        <!-- ⚠️ الكشف تحت الكروت عن قصد: هو اللي بيفضل بعد ما كل
             الكروت تختفي. لو حطيناه فوق، الشاشة كانت هتبان فاضية
             تماماً لما يقرا كل حاجة. -->
        ${payTotalsHtml()}

        ${seen.length ? `
          <button class="pay-more" onclick="payToggleOld()">
            <span id="payOldArrow">▾</span> الخصومات اللي قريتها (${seen.length})
          </button>
          <div id="payOld" class="pay-old hidden">
            ${seen.map(payCard).join('')}
          </div>` : ''}

        ${payPushBtnHtml()}

        <div class="pay-note">
          الخصم بيتكتب من شؤون العاملين. لو شايف إن فيه خصم غلط،
          كلّم الإدارة — الشاشة دي للعرض بس.
        </div>
      </div>
    </div>`;
}

// ============================================================
// كشف المرتب
// ------------------------------------------------------------
// ⚠️ has_salary مش نفس salary > 0.
//    مرتب = صفر معناه «HR كتبته صفر».
//    مفيش مرتب خالص معناه «لسه ماتحددش».
//    لو خلطناهم، الموظف اللي HR نسيت تكتب مرتبه هيقرا «مرتبك ٠
//    ج.م» — وده أسوأ بكتير من إننا نقوله «لسه ماتحددش».
// ============================================================
function payTotalsHtml(){
  const t   = _payTotals;
  const has = !!t.has_salary;
  const ded = Number(t.total_month || 0);

  // مفيش مرتب متحدد؟ نوري الخصومات بس — ومنخترعش صافي
  if(!has){
    return `
    <div class="pay-tot">
      <div class="pay-tot-big">
        <span class="pay-tot-n">${payMoney(ded)}</span>
        <span class="pay-tot-c">ج.م</span>
      </div>
      <div class="pay-tot-l">إجمالي خصومات ${_payMonthName()}</div>
      <div class="pay-tot-hint">💵 مرتبك لسه ماتحددش في النظام —
        كلّم شؤون العاملين.</div>
      <div class="pay-tot-all">وإجمالي كل الخصومات من أول الشغل:
        <b>${payMoney(t.total_all)} ج.م</b></div>
    </div>`;
  }

  const net = Number(t.net_month || 0);
  return `
  <div class="pay-tot">
    <div class="pay-tot-l" style="margin:0 0 4px;">صافي مرتب ${_payMonthName()}</div>
    <div class="pay-tot-big">
      <span class="pay-tot-n net">${payMoney(net)}</span>
      <span class="pay-tot-c net">ج.م</span>
    </div>

    <div class="pay-calc">
      <div><span>المرتب</span><b>${payMoney(t.salary)}</b></div>
      <div><span>− الخصومات</span><b class="minus">${payMoney(ded)}</b></div>
      <div class="eq"><span>= الصافي</span><b>${payMoney(net)}</b></div>
    </div>

    <div class="pay-tot-all">وإجمالي كل الخصومات من أول الشغل:
      <b>${payMoney(t.total_all)} ج.م</b></div>
  </div>`;
}

function _payMonthName(){
  return new Date().toLocaleDateString('ar-EG', { month:'long', year:'numeric' });
}

function payCard(r){
  const isNew = !r.seen_at;
  const d = new Date(r.created_at).toLocaleDateString('ar-EG',
    { weekday:'long', day:'numeric', month:'long' });
  const t = new Date(r.created_at).toLocaleTimeString('ar-EG',
    { hour:'2-digit', minute:'2-digit', timeZone:'Africa/Cairo' });
  return `
  <div class="pay-card${isNew ? ' new' : ''}">
    <div class="pay-card-top">
      <div class="pay-amt">− ${payMoney(r.amount)} <small>ج.م</small></div>
      <div class="pay-when">${_payEsc(d)}<br><span>${_payEsc(t)}</span></div>
    </div>
    <div class="pay-why"><b>السبب:</b> ${_payEsc(r.reason)}</div>
    ${isNew
      ? `<button class="pay-ok-btn" onclick="payAck('${_payEsc(r.id)}')">👍 فهمت</button>`
      : `<div class="pay-seen">✔️ قريته ${new Date(r.seen_at).toLocaleDateString('ar-EG',
           { day:'numeric', month:'long' })}</div>`}
  </div>`;
}

function payToggleOld(){
  const box = document.getElementById('payOld');
  const arw = document.getElementById('payOldArrow');
  if(!box) return;
  box.classList.toggle('hidden');
  if(arw) arw.textContent = box.classList.contains('hidden') ? '▾' : '▴';
}

// ============================================================
// «فهمت»
// ============================================================
async function payAck(id){
  if(_payBusy) return;
  _payBusy = true;
  try{
    const { error } = await sb.rpc('hr_ack_deduction', { p_id: id });
    // ⚠️ Supabase مبيرميش خطأ — بيرجّعه في .error. لو ما فحصناش
    //    السطر ده، الكارت هيختفي من الشاشة والصف في قاعدة البيانات
    //    هيفضل «جديد» — ويرجع تاني أول ما يقفل ويفتح.
    if(error) throw error;
    await payLoad();
    payRender('');
  }catch(e){
    console.error('payAck failed:', e);
    alert('❌ مقدرناش نسجّل إنك قريته: ' + (e.message || e));
  }finally{
    _payBusy = false;
  }
}

// ============================================================
// الإشعار خارج التطبيق (Web Push)
// ------------------------------------------------------------
// ⚠️ ٣ شروط لازم تتحقق كلها، ولو واحد ناقص الزرار مبيظهرش:
//   • المفتاح PAY_VAPID_PUBLIC_KEY متملّي فوق
//   • المتصفح بيدعم Push
//   • **على الأيفون:** التطبيق متثبّت على الشاشة الرئيسية.
//     دي قاعدة آبل مش قرارنا — سفاري بيرفض الإشعارات من التبويب
//     العادي خالص. عشان كده بنقول للموظف يثبّت بدل ما نسيبه
//     يدوس زرار مش هيشتغل.
// ============================================================
function payPushSupported(){
  return !!(PAY_VAPID_PUBLIC_KEY
    && 'serviceWorker' in navigator
    && 'PushManager'   in window
    && 'Notification'  in window);
}
function payIsStandalone(){
  return (window.navigator && window.navigator.standalone === true)
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}
function payIsIOS(){
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
      || (/Mac/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
}

function payPushBtnHtml(){
  if(!PAY_VAPID_PUBLIC_KEY) return '';

  if(payIsIOS() && !payIsStandalone()){
    return `<div class="pay-push-hint">📲 عشان يوصلك إشعار وإنت برّه التطبيق،
      لازم تضيف الموقع للشاشة الرئيسية الأول:<br>
      دوس <b>مشاركة</b> ⬆️ تحت ← <b>إضافة إلى الشاشة الرئيسية</b> ←
      وافتحه من الأيقونة، وارجع هنا.</div>`;
  }
  if(!payPushSupported()) return '';

  if(Notification.permission === 'granted'){
    return `<div class="pay-push-on">🔔 الإشعارات شغّالة على الجهاز ده</div>`;
  }
  if(Notification.permission === 'denied'){
    return `<div class="pay-push-hint">🔕 إشعارات الموقع مقفولة من إعدادات
      المتصفح. افتحها وارجع هنا.</div>`;
  }
  return `<button class="pay-push-btn" onclick="payEnablePush()">
    🔔 فعّل الإشعارات — يوصلك خبر الخصم وإنت برّه التطبيق</button>`;
}

// 🔴 لازم تتنده **من ضغطة زرار مباشرة**. طلب إذن الإشعارات زي
//    طلب الموقع بالظبط: المتصفح بيديك تصريح لحظي بعد الضغطة،
//    والتصريح بيروح لو استنيت حاجة قبله. عشان كده requestPermission
//    أول سطر — قبل أي await.
async function payEnablePush(){
  if(!payPushSupported()){ alert('جهازك مش بيدعم الإشعارات'); return; }
  try{
    const perm = await Notification.requestPermission();   // 🔴 أول سطر
    if(perm !== 'granted'){
      alert('الإشعارات مقفولة. تقدر تفتحها من إعدادات المتصفح في أي وقت.');
      payRender(''); return;
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: payUrlB64ToU8(PAY_VAPID_PUBLIC_KEY)
      });
    }

    const { data:{ session } } = await sb.auth.getSession();
    const email = ((session && session.user && session.user.email) || '').toLowerCase();
    if(!email) throw new Error('مش مسجّل دخول');

    const j = sub.toJSON();
    const { error } = await sb.from('push_subscriptions').upsert({
      endpoint:   sub.endpoint,
      user_email: email,
      p256dh:     j.keys.p256dh,
      auth:       j.keys.auth,
      ua:         (navigator.userAgent || '').slice(0, 300)
    }, { onConflict: 'endpoint' });
    if(error) throw error;

    alert('✅ تمام — هيوصلك إشعار على الجهاز ده أول ما يحصل خصم');
    payRender('');
  }catch(e){
    console.error('payEnablePush failed:', e);
    alert('❌ مقدرناش نفعّل الإشعارات: ' + (e.message || e));
  }
}

// المفتاح بيتكتب Base64-URL، والمتصفح عايزه بايتات
function payUrlB64ToU8(s){
  const pad  = '='.repeat((4 - s.length % 4) % 4);
  const b64  = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw  = atob(b64);
  const out  = new Uint8Array(raw.length);
  for(let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// ============================================================
// ⚠️ الملف بينده نفسه — مش مستني الصفحة تفتكر
// ------------------------------------------------------------
// نفس درس attendance.js: أول نسخة منه كانت مستنية كل صفحة تنده
// دالة التهيئة، فالزرار فضل مخفي في التلات صفحات وواحدة بس
// اشتغلت. دلوقتي الملف مسؤول عن نفسه.
//
// بننده أكتر من مرة عن قصد، عشان الصفحات اللي بتبني قايمتها
// بعد ما تقرا الأدوار من السيرفر.
// ============================================================
(function payBoot(){
  if(!payIsPhone()) return;          // الكمبيوتر: الملف بيسكت خالص

  const refresh = async () => {
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session) return;           // لسه ما دخلش — مفيش داعي نقرا
      await payLoad();
    }catch(e){ console.error('payBoot refresh failed:', e); }
  };

  const sync = () => { try{ paySyncBadge(); }catch(e){} };

  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', sync, { once:true });
  else sync();
  setTimeout(sync, 1200);
  setTimeout(sync, 3000);

  setTimeout(refresh, 1500);

  // ⚠️ لما الموظف يرجع للتطبيق بعد ما كان مقفول، بنقرا تاني.
  //    من غير ده الخصم اللي اتعمل وهو برّه مش هيبان غير لما
  //    يقفل التطبيق ويفتحه — وده ممكن يعدّي أيام.
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') refresh();
  });

  // خصم جديد وهو فاتح التطبيق؟ البانر يطلع على طول.
  // ⚠️ ده **إضافة** مش أساس: لو الريل تايم مش شغّال، الفحص اللي
  //    فوق (visibilitychange) بيغطّي. مفيش حالة الخبر بيضيع فيها.
  setTimeout(async () => {
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session) return;
      const em = (session.user.email || '').toLowerCase();
      sb.channel('pay-' + em)
        .on('postgres_changes',
            { event:'INSERT', schema:'public', table:'hr_deductions' },
            () => refresh())
        .subscribe();
    }catch(e){ console.error('payroll realtime failed:', e); }
  }, 2500);
})();

// ============================================================
// الاستايل — بيتحقن من هنا مرة واحدة
// ------------------------------------------------------------
// ⚠️ الشاشة دي بتشتغل في ٣ صفحات وكل صفحة سمّية متغيراتها باسم
//    مختلف. عشان كده بتعرّف ألوانها بنفسها من data-theme اللي كل
//    الصفحات بتحطه على <html> — مش بتعتمد على أي متغيّر منها.
// ============================================================
(function payCss(){
  if(document.getElementById('payCss')) return;
  const s = document.createElement('style');
  s.id = 'payCss';
  s.textContent = `
  #payOverlay, #payBanner{
    --p-bg:#F1F5F9; --p-card:#FFFFFF; --p-line:#E2E8F0;
    --p-ink:#101014; --p-ink2:#334155; --p-mut:#64748B;
    --p-red:#DC2626; --p-red-bg:#FEF2F2; --p-green:#16A34A;
  }
  html[data-theme="dark"] #payOverlay, html[data-theme="dark"] #payBanner{
    --p-bg:#131E29; --p-card:#1B2A3A; --p-line:#2F4356;
    --p-ink:#E9EFF5; --p-ink2:#C3D2DF; --p-mut:#92A6B8;
    --p-red:#F0554A; --p-red-bg:rgba(240,85,74,.14); --p-green:#4ADE80;
  }

  /* ===== البانر في الصفحة الرئيسية ===== */
  #payBanner{display:flex; align-items:center; gap:9px; cursor:pointer;
    background:#B45309; color:#fff; padding:11px 14px;
    font:800 13px/1.6 'Tajawal',system-ui,sans-serif; text-align:start;}
  #payBanner .pay-bell{font-size:16px; animation:payRing 2.2s ease-in-out infinite;}
  #payBanner .pay-bn-txt{flex:1; min-width:0;}
  #payBanner .pay-bn-go{flex:none; background:rgba(255,255,255,.2);
    border-radius:8px; padding:5px 10px; font-size:12px; white-space:nowrap;}
  @keyframes payRing{0%,88%,100%{transform:rotate(0)}
    91%{transform:rotate(14deg)} 95%{transform:rotate(-14deg)}}
  @media (prefers-reduced-motion:reduce){ #payBanner .pay-bell{animation:none;} }

  /* ===== النقطة على زرار الثلاث نقط ===== */
  .pay-dot{position:absolute; top:5px; inset-inline-end:5px; width:9px; height:9px;
    border-radius:50%; background:#DC2626; box-shadow:0 0 0 2px rgba(255,255,255,.75);
    pointer-events:none;}

  /* ===== الشاشة ===== */
  #payOverlay{position:fixed; inset:0; z-index:9400; background:var(--p-bg);
    overflow-y:auto; color:var(--p-ink);
    font-family:'Tajawal',system-ui,sans-serif;}
  #payOverlay.hidden{display:none;}
  .pay-page{min-height:100%;}
  /* env(safe-area-inset-top) = النتش وشريط الساعة في الأيفون */
  .pay-head{display:flex; align-items:center; gap:10px;
    padding:calc(14px + env(safe-area-inset-top)) 18px 14px;
    background:var(--p-card); border-bottom:1px solid var(--p-line);
    position:sticky; top:0; z-index:2;}
  .pay-head h2{flex:1; min-width:0; margin:0; font-family:'Cairo',sans-serif;
    font-size:18px; color:var(--p-ink);}
  .pay-close{flex:none; width:38px; height:38px; border:none; border-radius:10px;
    background:var(--p-bg); color:var(--p-ink); font-size:20px; cursor:pointer;}
  .pay-body{padding:16px 18px 44px;}

  .pay-busy{text-align:center; font-size:13px; color:var(--p-mut); padding:14px;}
  .pay-warn{background:rgba(180,83,9,.14); color:#B45309;
    border:1px solid rgba(180,83,9,.35); border-radius:11px; padding:12px 14px;
    font-size:12.5px; line-height:1.9; margin-bottom:14px;}
  html[data-theme="dark"] #payOverlay .pay-warn{color:#FBBF24;}
  .pay-warn-d{display:block; margin-top:5px; font-size:11px; opacity:.8;
    direction:ltr; word-break:break-word;}
  .pay-ok{text-align:center; color:var(--p-green); font-weight:800; font-size:15px;
    background:var(--p-card); border:1px solid var(--p-line);
    border-radius:13px; padding:22px 14px;}
  .pay-sec{font-weight:900; font-size:13.5px; color:var(--p-red); margin-bottom:10px;}

  .pay-card{background:var(--p-card); border:1px solid var(--p-line);
    border-radius:14px; padding:14px; margin-bottom:11px;}
  .pay-card.new{border-color:var(--p-red); background:var(--p-red-bg);}
  .pay-card-top{display:flex; align-items:flex-start; justify-content:space-between; gap:10px;}
  .pay-amt{font-family:'Cairo',sans-serif; font-weight:900; font-size:25px;
    color:var(--p-red); line-height:1.2;}
  .pay-amt small{font-size:13px; font-weight:700;}
  .pay-when{text-align:end; font-size:11.5px; color:var(--p-mut); line-height:1.7;}
  .pay-when span{opacity:.8;}
  .pay-why{margin-top:9px; font-size:14px; line-height:1.9; color:var(--p-ink2);
    word-break:break-word;}
  .pay-why b{color:var(--p-ink);}
  .pay-ok-btn{width:100%; margin-top:12px; border:none; border-radius:12px;
    padding:13px; background:var(--p-green); color:#fff;
    font:900 15px/1 'Tajawal',system-ui,sans-serif; cursor:pointer;}
  .pay-seen{margin-top:9px; font-size:11.5px; color:var(--p-mut);}

  .pay-tot{margin-top:18px; background:var(--p-card); border:1px solid var(--p-line);
    border-radius:16px; padding:18px 16px; text-align:center;}
  .pay-tot-big{display:flex; align-items:baseline; justify-content:center; gap:6px;}
  .pay-tot-n{font-family:'Cairo',sans-serif; font-weight:900; font-size:36px;
    color:var(--p-red); line-height:1;}
  .pay-tot-c{font-size:15px; font-weight:800; color:var(--p-red); opacity:.85;}
  .pay-tot-l{margin-top:7px; font-size:13px; font-weight:800; color:var(--p-ink2);}
  .pay-tot-n.net{color:var(--p-green);}
  .pay-tot-c.net{color:var(--p-green);}
  .pay-tot-hint{margin-top:9px; font-size:12px; line-height:1.9; color:var(--p-mut);}
  .pay-calc{margin-top:14px; padding-top:12px; border-top:1px dashed var(--p-line);
    text-align:start;}
  .pay-calc div{display:flex; justify-content:space-between; align-items:baseline;
    gap:10px; padding:5px 0; font-size:14px; color:var(--p-ink2);}
  .pay-calc b{font-family:'Cairo',sans-serif; font-weight:900; font-size:16px;
    color:var(--p-ink);}
  .pay-calc b.minus{color:var(--p-red);}
  .pay-calc .eq{margin-top:5px; padding-top:8px; border-top:1px solid var(--p-line);}
  .pay-calc .eq b{color:var(--p-green); font-size:18px;}
  .pay-tot-all{margin-top:9px; padding-top:9px; border-top:1px solid var(--p-line);
    font-size:12px; color:var(--p-mut); line-height:1.9;}
  .pay-tot-all b{color:var(--p-ink2);}

  .pay-more{width:100%; margin-top:14px; border:1px solid var(--p-line);
    background:var(--p-card); color:var(--p-ink2); border-radius:12px; padding:12px;
    font:800 13px/1 'Tajawal',system-ui,sans-serif; cursor:pointer;}
  .pay-old{margin-top:11px;}
  .pay-old.hidden{display:none;}

  .pay-push-btn{width:100%; margin-top:16px; border:none; border-radius:12px;
    padding:14px 12px; background:#0891A8; color:#fff;
    font:800 13.5px/1.5 'Tajawal',system-ui,sans-serif; cursor:pointer;}
  .pay-push-on{margin-top:16px; text-align:center; font-size:12.5px;
    color:var(--p-green); font-weight:800;}
  .pay-push-hint{margin-top:16px; background:var(--p-card);
    border:1px solid var(--p-line); border-radius:12px; padding:13px 14px;
    font-size:12.5px; line-height:2; color:var(--p-ink2);}

  .pay-note{margin-top:18px; font-size:12px; line-height:2; color:var(--p-mut);
    text-align:center;}`;
  (document.head || document.documentElement).appendChild(s);
})();
