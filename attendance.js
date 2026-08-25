// ============================================================
// I Fix Team — شاشة المواعيد المشتركة (attendance.js)
// ------------------------------------------------------------
// حضور · انصراف · بريك · استئناف — لكل موظف، من الموبايل بس.
//
// ⚠️ الترتيب — بعد common.js:
//     <script src="common.js"></script>
//     <script src="attendance.js"></script>
//
// الصفحة لازم توفّر:
//   • sb · esc            (من common.js)
//   • زرار في القايمة:     onclick="openAttendance()"
//   • عنصر:                <div id="attOverlay" class="overlay hidden">…</div>
//     (الشاشة بتتبني جواه بالكامل — مش محتاج تكتب أي HTML جواه)
//
// ============================================================
// 🔴 ٣ قواعد النظام ده قايم عليها:
//
// ١) **الوقت من السيرفر مش من التليفون.** إحنا هنا بنبعت النوع
//    والمكان وبس. الساعة اللي بتتسجّل هي ساعة قاعدة البيانات.
//    لو اعتمدنا على ساعة التليفون، أي حد يقدّمها ويسجّل حضور
//    وهو في البيت.
//
// ٢) **المسافة بتتحسب في السيرفر.** الصفحة بتوري المسافة
//    للمستخدم كمجاملة، لكن اللي بيرفض فعلاً هو قاعدة البيانات.
//
// ٣) **الموبايل بس.** الشاشة مش بتظهر على الكمبيوتر أصلاً —
//    لأن كمبيوتر المحل ثابت جوه اللوكيشن، فأي حد يقدر يسجّل
//    لأي حد من عليه.
// ============================================================

// ===== هل ده موبايل؟ =====
// بنجمع بين نوع الجهاز واللمس. الكمبيوتر اللي بشاشة لمس نادر
// في المحل، والأجهزة اللوحية بتعدّي — ودي مقبولة.
function attIsPhone(){
  try{
    const ua = navigator.userAgent || '';
    const mobileUA = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
    const touch = (navigator.maxTouchPoints || 0) > 0;
    return mobileUA && touch;
  }catch(e){ return false; }
}

// بتظهر زرار المواعيد لو الجهاز موبايل
function attSyncMenu(){
  const btns = document.querySelectorAll('.att-menu-btn');
  const show = attIsPhone();
  btns.forEach(b => { b.style.display = show ? '' : 'none'; });
}

// ============================================================
// ⚠️ الملف بينده نفسه — مش مستني الصفحة تفتكر.
// ------------------------------------------------------------
// أول نسخة كانت مستنية كل صفحة تنده attSyncMenu() بعد الدخول.
// كتبتها في hr.html ونسيتها في التلات صفحات التانية، فالزرار
// فضل مخفي عند الكل — دالة مكتوبة صح ومحدش بيندهها.
//
// دلوقتي الملف مسؤول عن نفسه. أي صفحة تحمّله وتحط الكلاس
// att-menu-btn على زرار، الزرار هيشتغل — من غير أي سطر إضافي.
//
// بننده مرتين عن قصد: مرة أول ما الصفحة تجهز، ومرة بعد ثانية
// عشان الصفحات اللي بتبني قايمتها بعد ما تقرا الأدوار من
// السيرفر (الزرار ساعتها بيبقى لسه ماتعملش).
// ============================================================
(function attBoot(){
  const go = () => { try{ attSyncMenu(); }catch(e){} };
  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', go, { once:true });
  else go();
  setTimeout(go, 1200);
  setTimeout(go, 3000);
})();

let _attState = { last_kind:null, last_at:null, work_date:null, punches:0 };
let _attSettings = { radius_m:75, lat:null, lng:null };
let _attBusy = false;

const ATT_LABELS = {
  in:     { t:'حضور',          icon:'🟢' },
  out:    { t:'انصراف',        icon:'🔴' },
  break:  { t:'بريك',          icon:'☕' },
  resume: { t:'استئناف العمل', icon:'▶️' }
};

// ============================================================
// البصمة / الفيس آي دي  (WebAuthn)
// ------------------------------------------------------------
// المتصفح ما بيقدرش يقرا البصمة مباشرة. الطريقة الوحيدة إننا
// نطلب من الجهاز "أثبت إن صاحبك موجود" — والجهاز بيفتح الفيس
// آي دي أو البصمة، ولو بايظة بينزّل لباسورد الجهاز لوحده.
//
// أول مرة = تسجيل (مرة واحدة على كل جهاز). بعد كده = تأكيد.
//
// ⚠️ ده **حاجز على الجهاز مش إثبات للسيرفر**. بيمنع زميلك ياخد
//    تليفونك ويسجّلك — وهي دي المشكلة الحقيقية في المحل.
//    الحاجز اللي السيرفر بيفرضه فعلاً هو اللوكيشن.
// ============================================================
const ATT_CRED_KEY = 'ifix-att-cred';

function attB64(buf){
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function attFromB64(s){
  s = s.replace(/-/g,'+').replace(/_/g,'/');
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i);
  return a.buffer;
}
function attRand(n){ const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }

function attBioSupported(){
  return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
}
function attCredFor(email){
  try{ return JSON.parse(localStorage.getItem(ATT_CRED_KEY) || '{}')[email] || null; }
  catch(e){ return null; }
}
function attSaveCred(email, id){
  try{
    const all = JSON.parse(localStorage.getItem(ATT_CRED_KEY) || '{}');
    all[email] = id;
    localStorage.setItem(ATT_CRED_KEY, JSON.stringify(all));
  }catch(e){}
}

// تسجيل البصمة أول مرة على الجهاز ده
async function attBioRegister(email){
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: attRand(32),
    rp: { name: 'I Fix Team' },
    user: { id: attRand(16), name: email, displayName: email },
    pubKeyCredParams: [{ type:'public-key', alg:-7 }, { type:'public-key', alg:-257 }],
    // platform = بصمة/وجه الجهاز نفسه، مش مفتاح خارجي
    authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required' },
    timeout: 60000,
    attestation: 'none'
  }});
  if(!cred) throw new Error('التسجيل اتلغى');
  attSaveCred(email, attB64(cred.rawId));
  return true;
}

// تأكيد البصمة قبل أي تسجيل
// بترجّع true (اتأكد) أو false (الجهاز مش داعم) — وبترمي لو المستخدم رفض
async function attBioVerify(email){
  if(!attBioSupported()) return false;
  let id = attCredFor(email);
  if(!id){
    const ok = confirm('أول مرة على الجهاز ده — هنسجّل بصمتك/وجهك مرة واحدة.\nكمّل؟');
    if(!ok) throw new Error('لازم تسجّل البصمة عشان تقدر تسجّل حضور');
    await attBioRegister(email);
    id = attCredFor(email);
  }
  const got = await navigator.credentials.get({ publicKey: {
    challenge: attRand(32),
    allowCredentials: [{ type:'public-key', id: attFromB64(id) }],
    userVerification: 'required',
    timeout: 60000
  }});
  if(!got) throw new Error('التأكيد فشل');
  return true;
}

// ============================================================
// الموقع
// ============================================================
function attGetPosition(){
  return new Promise((resolve, reject) => {
    if(!navigator.geolocation) return reject(new Error('جهازك مش بيدعم تحديد الموقع'));
    navigator.geolocation.getCurrentPosition(
      p => resolve(p),
      e => {
        // الرسايل الافتراضية إنجليزي وغامضة — بنترجمها لسبب واضح
        const msg = e.code === 1 ? 'لازم تسمح للتطبيق بالوصول لموقعك من إعدادات التليفون'
                  : e.code === 2 ? 'مقدرناش نحدد مكانك — اطلع لمكان مفتوح شوية وجرّب تاني'
                  : 'تحديد الموقع أخد وقت طويل — جرّب تاني';
        reject(new Error(msg));
      },
      { enableHighAccuracy:true, timeout:15000, maximumAge:0 }
    );
  });
}

// ============================================================
// التسجيل
// ============================================================
async function attPunch(kind){
  if(_attBusy) return;
  _attBusy = true;
  attRender('⏳ بنحدد مكانك…');
  try{
    const { data:{ session } } = await sb.auth.getSession();
    const email = ((session && session.user && session.user.email) || '').toLowerCase();
    if(!email) throw new Error('لازم تكون مسجّل دخول');

    // ١) الموقع الأول — لو برّه المحل مش هنتعب المستخدم بالبصمة
    const pos = await attGetPosition();

    // ٢) البصمة
    attRender('🔐 أكّد بصمتك…');
    let verified = false;
    try{ verified = await attBioVerify(email); }
    catch(e){ throw e; }   // المستخدم رفض → نوقف

    // ٣) السيرفر هو اللي بيقرر
    attRender('⏳ بنسجّل…');
    const { data, error } = await sb.rpc('hr_punch', {
      p_kind: kind,
      p_lat: pos.coords.latitude,
      p_lng: pos.coords.longitude,
      p_accuracy: pos.coords.accuracy,
      p_verified: verified,
      p_device: (navigator.userAgent || '').slice(0, 120)
    });
    // ⚠️ Supabase مبيرميش خطأ — بيرجّعه في .error. لو ما بصّيناش
    //    عليه، الفشل بيعدّي في صمت والموظف يفتكر إنه سجّل.
    if(error) throw new Error(error.message || 'فشل التسجيل');

    await attLoadState();
    attRender('');
    alert('✅ اتسجّل — ' + ATT_LABELS[kind].t + '\n' +
          new Date(data.at).toLocaleString('ar-EG', { timeZone:'Africa/Cairo' }));
  }catch(e){
    console.error('attPunch failed:', e);
    attRender('');
    alert('❌ ' + (e.message || e));
  }finally{
    _attBusy = false;
  }
}

// ============================================================
// القراءة
// ============================================================
async function attLoadState(){
  try{
    const { data, error } = await sb.rpc('hr_my_today');
    if(error) throw error;
    const r = Array.isArray(data) ? data[0] : data;
    _attState = r || { last_kind:null, last_at:null, work_date:null, punches:0 };
  }catch(e){
    console.error('hr_my_today failed:', e);
    _attState = { last_kind:null, last_at:null, work_date:null, punches:0 };
  }
  try{
    const { data } = await sb.from('hr_settings')
      .select('lat,lng,radius_m').eq('id',1).maybeSingle();
    if(data) _attSettings = data;
  }catch(e){}
}

// سجل الشهر بتاعي
async function attMyMonth(ym){
  const [y,m] = ym.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2,'0')}-01`;
  const to   = new Date(Date.UTC(y, m, 0)).toISOString().slice(0,10);
  const { data, error } = await sb.from('attendance')
    .select('kind,at,work_date,distance_m,verified')
    .gte('work_date', from).lte('work_date', to)
    .order('at', { ascending:true });
  if(error) throw error;
  return data || [];
}

// ============================================================
// الواجهة
// ============================================================
// أنهي زرار ينفع دلوقتي؟ نفس منطق قاعدة البيانات بالحرف —
// بس هنا عشان المستخدم يشوف الزرار مطفي بدل ما يدوس وياخد رفض.
function attAllowed(kind){
  const k = _attState.last_kind;
  if(kind === 'in')     return k === null || k === 'out';
  if(kind === 'out')    return k === 'in' || k === 'resume' || k === 'break';
  if(kind === 'break')  return k === 'in' || k === 'resume';
  if(kind === 'resume') return k === 'break';
  return false;
}

function attStatusText(){
  const k = _attState.last_kind;
  if(!k) return '⚪ لسه ما سجّلتش حضور النهاردة';
  const at = _attState.last_at
    ? new Date(_attState.last_at).toLocaleTimeString('ar-EG',
        { hour:'2-digit', minute:'2-digit', timeZone:'Africa/Cairo' })
    : '';
  const m = { in:'🟢 حاضر من', out:'🔴 منصرف الساعة', break:'☕ في بريك من', resume:'🟢 رجعت للشغل الساعة' };
  return (m[k] || '') + ' ' + at;
}

function attRender(busyMsg){
  const ov = document.getElementById('attOverlay');
  if(!ov) return;
  const btn = (k) => {
    const on = attAllowed(k) && !busyMsg;
    return `<button class="att-btn att-${k}" ${on ? '' : 'disabled'}
      onclick="attPunch('${k}')">${ATT_LABELS[k].icon} ${ATT_LABELS[k].t}</button>`;
  };
  ov.innerHTML = `
    <div class="att-page">
      <div class="att-head">
        <h2>⏰ المواعيد</h2>
        <button class="att-close" onclick="closeAttendance()">×</button>
      </div>
      <div class="att-body">
        <div class="att-status">${esc(attStatusText())}</div>
        ${busyMsg ? `<div class="att-busy">${esc(busyMsg)}</div>` : ''}
        <div class="att-grid">
          ${btn('in')}${btn('out')}${btn('break')}${btn('resume')}
        </div>
        <div class="att-note">
          📍 التسجيل من داخل المحل بس · 🔐 بيتطلب بصمتك أو وجهك
        </div>
        <div class="att-log-head">
          <b>سجلي</b>
          <input type="month" id="attMonth" value="${_attMonthValue()}" onchange="attRenderLog()">
        </div>
        <div id="attLog" class="att-log">جاري التحميل…</div>
      </div>
    </div>`;
  attRenderLog();
}

function _attMonthValue(){
  const d = _attState.work_date ? new Date(_attState.work_date) : new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

async function attRenderLog(){
  const box = document.getElementById('attLog');
  const sel = document.getElementById('attMonth');
  if(!box || !sel) return;
  box.textContent = 'جاري التحميل…';
  try{
    const rows = await attMyMonth(sel.value);
    if(!rows.length){ box.innerHTML = '<div class="att-empty">مفيش تسجيلات في الشهر ده</div>'; return; }
    // تجميع بالأيام — الموظف عايز يشوف يومه مش قايمة طويلة
    const days = {};
    rows.forEach(r => { (days[r.work_date] = days[r.work_date] || []).push(r); });
    box.innerHTML = Object.keys(days).sort().reverse().map(d => `
      <div class="att-day">
        <div class="att-day-h">${new Date(d).toLocaleDateString('ar-EG',
          { weekday:'long', day:'numeric', month:'long' })}</div>
        ${days[d].map(r => `<div class="att-row">
          <span>${ATT_LABELS[r.kind].icon} ${ATT_LABELS[r.kind].t}</span>
          <span>${new Date(r.at).toLocaleTimeString('ar-EG',
            { hour:'2-digit', minute:'2-digit', timeZone:'Africa/Cairo' })}</span>
        </div>`).join('')}
      </div>`).join('');
  }catch(e){
    console.error('attRenderLog failed:', e);
    box.innerHTML = '<div class="att-empty">مقدرناش نحمّل السجل</div>';
  }
}

async function openAttendance(){
  if(!attIsPhone()){
    alert('المواعيد بتتسجّل من الموبايل بس');
    return;
  }
  const ov = document.getElementById('attOverlay');
  if(!ov) return;
  ov.classList.remove('hidden');
  attRender('⏳ جاري التحميل…');
  await attLoadState();
  attRender('');
}
function closeAttendance(){
  const ov = document.getElementById('attOverlay');
  if(ov) ov.classList.add('hidden');
}

// ============================================================
// الاستايل — بيتحقن من هنا مرة واحدة
// بنحطه في الملف بدل كل صفحة، عشان الشكل ما يختلفش بين الصفحات
// ============================================================
(function attCss(){
  if(document.getElementById('attCss')) return;
  const s = document.createElement('style');
  s.id = 'attCss';
  // ⚠️ الشاشة دي بتشتغل في ٤ صفحات، وكل صفحة سمّية متغيراتها
  //    باسم مختلف: الداشبورد بيقول --surface وصفحة الفني بتقول
  //    --card. أول نسخة كانت بتقرا الأسماء الجديدة بس، فصفحة
  //    الفني رجعت للألوان الفاتحة الاحتياطية والكلام اختفى.
  //
  //    الحل: الشاشة **بتعرّف ألوانها بنفسها** من data-theme اللي
  //    كل الصفحات بتحطه على <html>. مش بتعتمد على أي متغير من
  //    الصفحة خالص — فأي صفحة جديدة هتشتغل صح من غير أي تعديل.
  s.textContent = `
  #attOverlay{
    --a-bg:#F1F5F9; --a-card:#FFFFFF; --a-line:#E2E8F0;
    --a-ink:#101014; --a-ink2:#334155; --a-mut:#64748B;
  }
  html[data-theme="dark"] #attOverlay{
    --a-bg:#131E29; --a-card:#1B2A3A; --a-line:#2F4356;
    --a-ink:#E9EFF5; --a-ink2:#C3D2DF; --a-mut:#92A6B8;
  }

  #attOverlay{position:fixed; inset:0; z-index:9400; background:var(--a-bg);
    overflow-y:auto; color:var(--a-ink);}
  #attOverlay.hidden{display:none;}
  .att-page{min-height:100%;}
  /* env(safe-area-inset-top) = النتش وشريط الساعة في الأيفون */
  .att-head{display:flex; align-items:center; gap:10px;
    padding:calc(14px + env(safe-area-inset-top)) 18px 14px;
    background:var(--a-card); border-bottom:1px solid var(--a-line);
    position:sticky; top:0; z-index:2;}
  .att-head h2{flex:1; min-width:0; margin:0; font-family:'Cairo',sans-serif; font-size:18px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--a-ink);}
  .att-close{flex:none; width:38px; height:38px; border:none; border-radius:10px;
    background:var(--a-bg); color:var(--a-ink); font-size:20px; cursor:pointer;}
  .att-body{padding:16px 18px 40px;}
  .att-status{background:var(--a-card); border:1px solid var(--a-line);
    border-radius:12px; padding:14px; font-weight:800; font-size:15px; text-align:center;
    color:var(--a-ink);}
  .att-busy{margin-top:10px; text-align:center; font-size:13px; color:var(--a-mut);}
  .att-grid{display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:14px 0;}
  .att-btn{padding:18px 10px; border:none; border-radius:14px; font-family:inherit;
    font-size:15px; font-weight:800; color:#fff; cursor:pointer;}
  .att-btn:disabled{opacity:.35; cursor:not-allowed;}
  .att-in{background:#16A34A;} .att-out{background:#DC2626;}
  .att-break{background:#B45309;} .att-resume{background:#0891A8;}
  .att-note{font-size:12.5px; line-height:1.9; color:var(--a-mut); text-align:center;}
  .att-log-head{display:flex; align-items:center; justify-content:space-between; gap:10px;
    margin:20px 0 10px; color:var(--a-ink);}
  .att-log-head input{border:1px solid var(--a-line); border-radius:9px; padding:8px 10px;
    font-family:inherit; background:var(--a-card); color:var(--a-ink);}
  .att-day{background:var(--a-card); border:1px solid var(--a-line);
    border-radius:12px; padding:12px 14px; margin-bottom:10px;}
  .att-day-h{font-weight:800; font-size:13.5px; margin-bottom:8px; color:var(--a-ink);}
  .att-row{display:flex; justify-content:space-between; font-size:13.5px; padding:5px 0;
    color:var(--a-ink2);}
  .att-empty{text-align:center; color:var(--a-mut); padding:24px; font-size:13.5px;}`;
  (document.head || document.documentElement).appendChild(s);
})();
