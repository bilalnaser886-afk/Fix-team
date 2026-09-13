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
// علامة «بصمة الموبايل ده بايظة» — لكل إيميل على الجهاز ده بس.
// بتخلص لوحدها بعد ATT_BIO_BROKEN_DAYS، وبعدها النظام يجرّب البصمة تاني
// (يمكن الموبايل اتصلّح أو اتحدّث).
const ATT_BIO_BROKEN_KEY  = 'ifix-att-bio-broken';
const ATT_BIO_BROKEN_DAYS = 7;

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

// ============================================================
// هل الجهاز ده قادر يتحقق من صاحبه أصلاً؟
// ------------------------------------------------------------
// ⚠️ ده أهم فحص في الملف كله.
//
//    فيه موبايلات مفيهاش بصمة ولا فيس آي دي خالص، وفيه موبايلات
//    البصمة فيها بايظة. لو سجّلنا الحضور على إن البصمة **شرط**،
//    الموظفين دول مش هيقدروا يسجّلوا حضور **أبداً** — وده أسوأ
//    بكتير من إنهم يسجّلوا من غير بصمة.
//
//    بنسأل المتصفح نفسه السؤال ده بدل ما نخمّنه من الأخطاء:
//        isUserVerifyingPlatformAuthenticatorAvailable()
//    بترجّع true لو الجهاز يقدر يتحقق — ببصمة أو وجه **أو رمز
//    قفل الشاشة**. يعني اللي بصمته بايظة وعنده رمز، هيتحقق برمزه
//    عادي والنظام مش هيحس بالفرق.
//
//    بترجّع false بس لما الجهاز **مالوش أي وسيلة تحقق خالص**.
//    ساعتها بنعدّي التسجيل ونعلّمه "من غير بصمة" عشان HR تشوفه.
//
// ⚠️ بنسأل مرة واحدة ونحتفظ بالإجابة — السؤال بياخد وقت على
//    بعض الأجهزة، وما ينفعش نأخّر الموظف مع كل ضغطة.
// ============================================================
let _attCanVerify = null;

async function attCanVerify(){
  if(_attCanVerify !== null) return _attCanVerify;
  if(!attBioSupported()){ _attCanVerify = false; return false; }
  try{
    const fn = window.PublicKeyCredential
             && window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable;
    // متصفح قديم مش عارف السؤال ده؟ بنجرّب عادي — لو فشل هنمسكه تحت
    if(typeof fn !== 'function'){ _attCanVerify = true; return true; }
    _attCanVerify = !!(await fn.call(window.PublicKeyCredential));
  }catch(e){
    console.warn('[المواعيد] مقدرناش نتأكد من قدرة الجهاز:', e);
    _attCanVerify = false;
  }
  return _attCanVerify;
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

function attBioBroken(email){
  try{
    const at = JSON.parse(localStorage.getItem(ATT_BIO_BROKEN_KEY) || '{}')[email];
    return !!at && (Date.now() - at) < ATT_BIO_BROKEN_DAYS * 86400000;
  }catch(e){ return false; }
}
function attMarkBioBroken(email, on){
  try{
    const all = JSON.parse(localStorage.getItem(ATT_BIO_BROKEN_KEY) || '{}');
    if(on) all[email] = Date.now(); else delete all[email];
    localStorage.setItem(ATT_BIO_BROKEN_KEY, JSON.stringify(all));
  }catch(e){}
}

// ============================================================
// 🔴 NotAllowedError = «لغيت» ولا «الموبايل رفض»؟
// ------------------------------------------------------------
// نظام البصمة (WebAuthn) **عن قصد** بيرجّع نفس الخطأ ده في ٣ حالات:
//   ١) الموظف لغى البصمة بإيده
//   ٢) الوقت خلص (أو نافذة البصمة مطلعتش خالص — بيحصل مع بصمات
//      تحت الشاشة في موبايلات أوبو/ريلمي القديمة)
//   ٣) مفتاح البصمة المحفوظ **مابقاش موجود** على الموبايل (الموظف
//      ضاف بصمة جديدة، برنامج تنظيف، تحديث Google Play Services…)
// ليه نفس الخطأ؟ خصوصية: عشان أي موقع ميقدرش يعرف إنت متسجّل
// عنده ولا لأ. (ده الرابط اللي بيطلع في الرسالة: privacy-considerations)
//
// ⚠️ الكود القديم كان بيعتبره دايماً «رفض» ويوقف. في الحالة (٣)
//    ده بيحبس الموظف **للأبد** — المفتاح القديم فاضل محفوظ في
//    الصفحة، وكل محاولة بتفشل بنفس الطريقة. (حصل فعلاً: موظف
//    واحد على Reno 2F والباقيين شغالين.)
//
// فبنسأل الموظف نفسه — هو الوحيد اللي يعرف إذا كان لغى ولا لأ.
// ============================================================
function attAskDeviceRefused(stage){
  return confirm(
    '❌ البصمة ما اتأكدتش.\n\n' +
    '• لو انت اللي لغيتها بإيدك ← دوس «إلغاء» وجرّب تاني.\n' +
    '• لو الموبايل رفض لوحده، أو نافذة البصمة مطلعتش أصلاً ← دوس «موافق»' +
    (stage === 'verify'
      ? ' وهنسجّل بصمتك من جديد على الموبايل ده.'
      : ' وهيتسجّل من غير بصمة (HR هتشوف علامة).')
  );
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
// بترجّع true (اتأكد) · false (الجهاز مش قادر — نعدّي بعلامة)
// وبترمي بس لو المستخدم **رفض** أو التأكيد فشل وهو قادر.
async function attBioVerify(email){
  // 🔴 الفحص الأول: الجهاز قادر أصلاً؟
  if(!(await attCanVerify())){
    console.info('[المواعيد] الجهاز مالوش وسيلة تحقق — التسجيل هيتم من غير بصمة');
    return false;
  }
  // الموظف قال قبل كده إن بصمة الموبايل ده بايظة (خلال آخر ٧ أيام)؟
  // نعدّي من غير ما نتعبه كل مرة — والتسجيل بيتعلّم «من غير بصمة».
  if(attBioBroken(email)){
    console.info('[المواعيد] بصمة الموبايل ده متعلّمة بايظة — من غير بصمة');
    return false;
  }

  let id = attCredFor(email);
  if(!id){
    const ok = confirm('أول مرة على الجهاز ده — هنسجّل بصمتك/وجهك مرة واحدة.\nكمّل؟');
    // المستخدم رفض بإيده → نوقف. ده قرار منه مش عطل في الجهاز.
    if(!ok) throw new Error('لازم تسجّل البصمة عشان تقدر تسجّل حضور');
    return await attRegisterOrFallback(email);
  }

  try{
    const got = await navigator.credentials.get({ publicKey: {
      challenge: attRand(32),
      allowCredentials: [{ type:'public-key', id: attFromB64(id) }],
      userVerification: 'required',
      timeout: 60000
    }});
    if(!got) throw new Error('التأكيد فشل');
    attMarkBioBroken(email, false);   // اشتغلت → لو كان فيه علامة قديمة نشيلها
    return true;
  }catch(e){
    // ⚠️ البصمة المسجّلة بقت مش صالحة بشكل صريح → نسجّل من جديد
    if(e && (e.name === 'InvalidStateError' || e.name === 'NotSupportedError')){
      attForget(email);
      throw new Error('بصمتك المسجّلة مابقتش صالحة — جرّب تاني وهنسجّلها من جديد');
    }
    // 🔴 الغامض: لغى ولا الموبايل رفض؟ (شوف الشرح فوق attAskDeviceRefused)
    if(e && e.name === 'NotAllowedError'){
      if(!attAskDeviceRefused('verify')) throw new Error('البصمة اتلغت — جرّب تاني');
      // المفتاح القديم غالباً اتمسح من الموبايل — نرميه ونسجّل واحد جديد.
      attForget(email);
      return await attRegisterOrFallback(email);
    }
    throw e;
  }
}

// تسجيل بصمة جديدة — ولو الموبايل مش راضي خالص، نعدّي «من غير بصمة».
// ✅ التسجيل نفسه **تأكيد حقيقي**: userVerification:'required' معناها
//    الموبايل مش هيعمل المفتاح غير لما صاحبه يحط بصمته/وشه/رمزه.
//    فلو نجح، بنرجّع true من غير ما نطلب البصمة مرة تانية.
async function attRegisterOrFallback(email){
  try{
    await attBioRegister(email);
    attMarkBioBroken(email, false);
    return !!attCredFor(email);
  }catch(e){
    console.warn('[المواعيد] تسجيل البصمة فشل:', e);
    // NotAllowedError هنا برضو غامض — نسأل تاني.
    // «إلغاء» = هو اللي لغى → نوقف. «موافق» = الموبايل رفض → نعدّي.
    if(e && e.name === 'NotAllowedError' && !attAskDeviceRefused('register')){
      throw new Error('لازم تسجّل البصمة عشان تقدر تسجّل حضور');
    }
    // ⚠️ الموبايل قال إنه قادر، بس فشل مرتين ورا بعض. ما نقفلش الباب:
    //    الموظف موجود في المحل فعلاً (اللوكيشن اتفحص قبلها على السيرفر)،
    //    ومنعه من الحضور عقاب على عطل مالوش فيه. التسجيل بيتعلّم
    //    «من غير بصمة» وHR بتشوفه، والموبايل بيتعلّم «بايظ» ٧ أيام.
    attMarkBioBroken(email, true);
    return false;
  }
}

// مسح البصمة المسجّلة على الجهاز ده
function attForget(email){
  try{
    const all = JSON.parse(localStorage.getItem(ATT_CRED_KEY) || '{}');
    delete all[email];
    localStorage.setItem(ATT_CRED_KEY, JSON.stringify(all));
  }catch(e){}
}

// ============================================================
// الموقع
// ------------------------------------------------------------
// ⚠️ الملف ده اتعدّل عشان مشاكل الأيفون. اقرا الشرح قبل ما تلمسه.
//
// ══ تلات مشاكل حقيقية على iOS، وحل كل واحدة ══
//
// (١) نافذة الإذن بتفتح في المكان الغلط
//     لما التطبيق يتثبّت على الشاشة الرئيسية، الأيفون ساعات بيفتح
//     نافذة "تسمح بالوصول لموقعك؟" في **سفاري** مش في التطبيق.
//     الموظف قدامه شاشة واقفة، والنافذة في مكان هو أصلاً مش فاتحه.
//
//     والأسوأ: في الحالة دي **الـ timeout بتاع المتصفح ما بيشتغلش** —
//     الطلب بيفضل معلّق للأبد. الشاشة بتقول "بنحدد مكانك…" وتقف.
//
//     الحل: مؤقّت مستقل بتاعنا إحنا. مابنعتمدش على مؤقّت المتصفح
//     لأنه هو نفسه اللي بيخون في الحالة دي.
//
// (٢) الدقة العالية بتفشل جوه المحل
//     enableHighAccuracy معناها "استنى إشارة GPS من القمر الصناعي".
//     والمحل مكان مقفول — الإشارة ضعيفة أو مفيش.
//
//     الحل: محاولتين. الأولى دقة عالية ووقت قصير، ولو فشلت
//     الثانية بدقة الشبكة (أبراج + واي فاي) — دي بتشتغل جوه
//     المباني وبتديك دقة ٥٠-٢٠٠ متر، وهي كافية لفحص إنه في المحل.
//
//     تشبيه: بتنادي على حد. لو ماردّش من أول نداية، مش معناه إنه
//     مش موجود — يمكن الصوت مش واصل. بتقرّب وتنادي تاني.
//
// (٣) الرسالة القديمة كانت بتقول "من إعدادات التليفون" — وخلاص
//     ودي معلومة مش كفاية. مكان الإعداد على الأيفون **مش واضح**
//     وفي مكانين مختلفين. دلوقتي بنقول المسار بالحرف.
// ============================================================

// الجهاز أيفون/آيباد؟ (بنستخدمها في الرسايل بس)
function attIsIOS(){
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
      || (/Mac/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
}

// التطبيق متثبّت على الشاشة الرئيسية؟
function attIsStandalone(){
  return (window.navigator && window.navigator.standalone === true)
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

// رسالة الرفض — بتفرق حسب الجهاز عشان الموظف يعرف يروح فين بالظبط
function attDeniedMsg(){
  if(attIsIOS()){
    let m = 'الموقع مقفول. افتح الإعدادات واعمل الآتي:\n\n'
          + '١) الخصوصية والأمان ← خدمات الموقع ← تأكد إنها مفتوحة\n'
          + '٢) في نفس القايمة انزل لـ Safari ← اختار «أثناء استخدام التطبيق»\n'
          + '٣) الإعدادات ← Safari ← الموقع ← اختار «اسمح»';
    if(attIsStandalone()){
      m += '\n\n📌 ولو فضلت مش شغّالة: افتح الموقع من سفاري نفسه مرة واحدة،'
         + ' وامسح «اسمح» لما يسألك، وبعدين ارجع للتطبيق.';
    }
    return m;
  }
  return 'الموقع مقفول. افتح إعدادات التليفون ← التطبيقات ← المتصفح ← الأذونات ← الموقع ← اسمح.';
}

// محاولة واحدة بإعدادات محدّدة، وبمؤقّت مستقل عننا
// ⚠️ ده جوهر الإصلاح: لو مؤقّت المتصفح ما اشتغلش، مؤقّتنا بيشتغل.
function attTryPosition(opts, ms){
  return new Promise((resolve, reject) => {
    let done = false;
    const watchdog = setTimeout(() => {
      if(done) return;
      done = true;
      const e = new Error('timeout');
      e.code = 3;                 // نفس كود المتصفح للوقت الطويل
      e._watchdog = true;         // عشان نعرف إن ده مؤقّتنا مش بتاعه
      reject(e);
    }, ms + 1500);                // بنديله فرصة يردّ الأول

    navigator.geolocation.getCurrentPosition(
      p => { if(done) return; done = true; clearTimeout(watchdog); resolve(p); },
      e => { if(done) return; done = true; clearTimeout(watchdog); reject(e); },
      opts
    );
  });
}

// ============================================================
// 🔴🔴 أهم دالة في الملف — اقرا التحذير ده قبل أي تعديل
// ------------------------------------------------------------
// الدالة دي **لازم تتنده فوراً وقت ضغطة الزرار، من غير أي
// await قبلها**. وده مش تفضيل — ده شرط في سفاري.
//
// ══ ليه؟ ══
// سفاري بيعتبر إن نافذة «تسمح بموقعك؟» لازم تكون نتيجة **مباشرة**
// لضغطة صابع المستخدم. وبيدّي الصفحة "تصريح" لحظي بعد كل ضغطة،
// والتصريح ده **بيروح** أول ما تستنى أي حاجة (await).
//
// فلو استنينا حاجة قبل ما نطلب الموقع، سفاري بيبص يلاقي التصريح
// راح، فيقول "الطلب ده مش جاي من المستخدم" — وبيرفضه، أو الأسوأ:
// **ما بيفتحش النافذة خالص** ولا بيرجّع خطأ. الشاشة تقف وبس.
//
// تشبيه: عندك تذكرة دخول صالحة لحظة الضغط بس. لو وقفت تعمل
// حاجة تانية الأول، التذكرة بتبوظ — وتوصل الباب يقولولك لأ.
//
// وده كان سبب إن الموظف على الأيفون **مبيتسألش عن الإذن أصلاً**.
//
// ══ القاعدة ══
// ✅ صح:  const p = attGetPosition();  ← أول سطر، من غير await
//         await حاجة تانية...
//         const pos = await p;
//
// ❌ غلط: await أي حاجة...
//         const pos = await attGetPosition();
//
// ⚠️ ولنفس السبب مافيش navigator.permissions.query قبل الطلب.
//    الفحص ده نفسه await، وكان هيقطع التصريح. بنستخدمه في رسالة
//    الخطأ بعد الفشل بس — ساعتها مفيش حاجة نخسرها.
// ============================================================
function attGetPosition(){
  if(!navigator.geolocation){
    return Promise.reject(new Error('جهازك مش بيدعم تحديد الموقع'));
  }

  // 🔴 أول حاجة تحصل — من غير أي انتظار قبلها
  const first = attTryPosition({ enableHighAccuracy:true, timeout:10000, maximumAge:0 }, 10000);

  return first.catch(e1 => {
    // الرفض الصريح مالوش لازمة نعيد معاه — مش هيتغيّر
    if(e1 && e1.code === 1) throw new Error(attDeniedMsg());

    // ---- المحاولة ٢: دقة الشبكة، وقت أطول ----
    // ⚠️ المحاولة دي مش محتاجة التصريح: الإذن يا اتاخد يا اترفض
    //    في المحاولة الأولى خلاص. دي بتجيب الموقع بطريقة تانية بس.
    //
    // maximumAge: قرايه عمرها أقل من دقيقة مقبولة — الموظف مش
    // هيتنقل كيلومتر في دقيقة وهو بيسجّل حضوره.
    if(typeof attRender === 'function') attRender('⏳ الإشارة ضعيفة — بنجرّب تاني…');

    return attTryPosition({ enableHighAccuracy:false, timeout:20000, maximumAge:60000 }, 20000)
      .catch(e2 => {
        if(e2 && e2.code === 1) throw new Error(attDeniedMsg());

        if(e2 && e2.code === 2){
          throw new Error('مقدرناش نحدد مكانك. اتأكد إن خدمات الموقع مفتوحة، واطلع ناحية شباك أو باب وجرّب تاني.');
        }

        // وقت طويل من غير رد — وده أشهر عرض للمشكلة على الأيفون
        let msg = 'تحديد الموقع أخد وقت طويل من غير رد.';
        if(attIsIOS()){
          msg += '\n\n📌 على الأيفون ده معناه غالباً إن الإذن مقفول أو النافذة'
               + ' فتحت في سفاري مش هنا.\n\n' + attDeniedMsg();
        }else{
          msg += ' اتأكد إن خدمات الموقع مفتوحة وجرّب تاني.';
        }
        throw new Error(msg);
      });
  });
}

// ============================================================
// التسجيل
// ============================================================
async function attPunch(kind){
  if(_attBusy) return;

  // ============================================================
  // 🚪 بوابة الانصراف — الصفحة نفسها بتقرر
  // ------------------------------------------------------------
  // الملف ده مشترك بين كل الأدوار، فمبيعرفش حاجة عن شغل أي صفحة.
  // هو بس بيسأل: «فيه حد عايز يوقّف الانصراف؟». لو الصفحة عرّفت
  // window.attBeforeOut ورجّعت true → الانصراف مبيتمّش (والصفحة
  // هي اللي بتعرض السبب). لو مش معرّفة → بيكمّل عادي.
  // مثال: شاشة الفني بتوقّفه لو فيه أجهزة مردّش على قطع غيارها.
  //
  // 🔴 لازم هنا **قبل** طلب الموقع ومن غير await — سفاري بيضيّع
  //    تصريح الموقع بعد أي انتظار (شوف التحذير تحت).
  // ⚠️ لو الدالة وقعت بخطأ، الانصراف بيكمّل: توقيف انصراف موظف
  //    بسبب باج (ساعاته تتحسب غلط) أخطر من إنه يعدّي مرة.
  // ============================================================
  // ⚠️ فحص البريك قبل أي حاجة — وبيرجع من غير await عشان تصريح
  //    الموقع في سفاري ما يضيعش (نفس سبب ترتيب السطور تحت).
  if(kind === 'out' && !_attAnswer && attNeedBreakAsk()){
    attShowBreakAsk();
    return;
  }

  if(kind === 'out' && typeof window.attBeforeOut === 'function'){
    let stop = false;
    try{ stop = window.attBeforeOut(_attState) === true; }
    catch(e){ console.error('attBeforeOut:', e); }
    if(stop) return;
  }

  _attBusy = true;
  attRender('⏳ بنحدد مكانك…');

  // ============================================================
  // 🔴 الترتيب هنا مقصود — متغيّروش
  // ------------------------------------------------------------
  // طلب الموقع **أول سطر**، قبل أي await خالص.
  //
  // سفاري بيدّي الصفحة تصريح لحظي بعد ضغطة الزرار، والتصريح ده
  // بيروح أول ما نستنى أي حاجة. والنسخة القديمة كانت بتستنى
  // getSession() الأول — فالتصريح كان بيضيع، وسفاري كان بيرفض
  // يفتح نافذة الإذن أصلاً. الشاشة تقف على "بنحدد مكانك…" وخلاص.
  //
  // دلوقتي بنطلب الموقع فوراً وبنمسك الوعد (promise)، وبنستنى
  // باقي الحاجات وهو شغّال في الخلفية. أسرع كمان — الاتنين
  // بيحصلوا مع بعض بدل واحد ورا التاني.
  // ============================================================
  const posPromise = attGetPosition();
  // ⚠️ بنعلّق ماسك فاضي دلوقتي عشان لو فشل قبل ما نوصل لـ await
  //    تحت، المتصفح ما يطبعش "رفض غير معالَج" في الكونسول.
  //    الخطأ الحقيقي بيتمسك تحت عادي.
  posPromise.catch(() => {});

  try{
    const { data:{ session } } = await sb.auth.getSession();
    const email = ((session && session.user && session.user.email) || '').toLowerCase();
    if(!email) throw new Error('لازم تكون مسجّل دخول');

    // ١) الموقع — كان بيتطلب فوق، دلوقتي بس بنستنى نتيجته
    const pos = await posPromise;

    // ٢) البصمة
    // ⚠️ الجهاز اللي مالوش بصمة بيعدّي على طول من غير ما نوقّفه،
    //    والتسجيل بيتعلّم "من غير بصمة" عشان HR تشوفه.
    const canBio = await attCanVerify();
    attRender(canBio ? '🔐 أكّد بصمتك…' : '⏳ بنسجّل…');
    let verified = false;
    // ⚠️ بنرمي بس لو المستخدم رفض. الجهاز اللي مش قادر بيرجّع
    //    false من غير ما يرمي، فالتسجيل بيكمّل عادي.
    verified = await attBioVerify(email);

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

    // الانصراف تم ✅ — دلوقتي بس ننفّذ إقرار البريك (خصم/إعلان).
    // 🔴 بعد النجاح مش قبله: اللي برّه نطاق المحل مكانش ينفع ياخد
    //    خصم وهو أصلاً ما نجحش ينصرف.
    if(kind === 'out' && _attAnswer){
      const ans = _attAnswer; _attAnswer = null;
      await attApplyAnswer(ans);
      await attLoadState();
    }
    attRender('');

    // ⚠️ التنبيه بيتحط في **نفس الرسالة** مش في alert تانية.
    //    اتنين ورا بعض على الموبايل: الأولى بتتقفل بالغلط والتانية
    //    بتبان من غير سياق — والموظف يفتكر إن فيه حاجة بايظة.
    let extra = '';
    try{ extra = await attDayWarning(kind); }catch(e){ console.error('attDayWarning:', e); }

    alert('✅ اتسجّل — ' + ATT_LABELS[kind].t + '\n' +
          new Date(data.at).toLocaleString('ar-EG', { timeZone:'Africa/Cairo' }) +
          extra);

    // ⚠️ خصم التأخير بيتولد **لحظة التسجيل**، مش من HR. فمفيش
    //    حاجة في قاعدة البيانات تنبّه شاشة «مرتبك» إنها تحدّث
    //    نفسها (الريل تايم بتاعها بيسمع على جدول الخصومات اليدوية
    //    بس). بنندهها بإيدينا هنا — ولو الملف مش محمّل في الصفحة
    //    دي، السطر بيعدّي من غير ما يعمل حاجة.
    if(typeof payLoad === 'function'){
      try{ await payLoad(); }catch(e){ console.error('payLoad after punch:', e); }
    }
  }catch(e){
    console.error('attPunch failed:', e);
    attRender('');
    alert('❌ ' + (e.message || e));
  }finally{
    _attBusy = false;
  }
}


// ============================================================
// ⚠️ التنبيه لحظة التسجيل
// ------------------------------------------------------------
// المشكلة اللي بيحلها: خصم التأخير بيتحسب تلقائي، فالموظف كان
// بيكتشفه آخر الشهر لما ياخد مرتبه ناقص. ووقتها بقى فات الأوان
// على أي كلام.
//
// دلوقتي:
//   • سجّل حضور وهو متأخر بعد الاحتياطي → بيعرف الخصم فوراً
//   • سجّل انصراف وساعاته ناقصة → بيعرف ناقصه كام قبل ما يمشي
//
// 🔴 الأرقام دي **مش محسوبة هنا**. جاية من hr_my_day_status في
//    السيرفر، اللي بتنده hr_late_penalties. لو حسبناها هنا كنا
//    بقينا ٣ نسخ من نفس القاعدة (HR · مرتبك · المواعيد) — وأول
//    تعديل على واحدة يخلّي التلاتة بيقولوا كلام مختلف.
//
// ⚠️ الدالة دي **مبتوقّعش التسجيل أبداً**. لو فشلت، التسجيل
//    اتم خلاص والرسالة بتطلع من غير السطر الزيادة وبس. التنبيه
//    خدمة إضافية مش شرط.
// ============================================================
async function attDayWarning(kind){
  // البريك والاستئناف: الوردية لسه شغّالة، فأي كلام عن نقص
  // ساعات دلوقتي هيبقى مضلّل.
  if(kind !== 'in' && kind !== 'out') return '';

  const { data, error } = await sb.rpc('hr_my_day_status',
    { p_date: _attState.work_date || null });
  if(error) throw error;

  const r = Array.isArray(data) ? data[0] : data;
  if(!r) return '';

  const hm = m => {
    m = Math.max(0, Math.round(Number(m) || 0));
    return Math.floor(m / 60) + ' ساعة و ' + (m % 60) + ' دقيقة';
  };
  const clock = m => {
    const v = ((Number(m) % 1440) + 1440) % 1440;
    return String(Math.floor(v / 60)).padStart(2, '0') + ':' +
           String(v % 60).padStart(2, '0');
  };

  // ---- حضور ----
  if(kind === 'in'){
    if(r.waived) return '';                       // HR شالت الخصم خلاص
    if(!(Number(r.penalty) > 0)) return '';       // مفيش خصم = مفيش داعي نخوّفه
    // ⚠️ counted_min مش «ميعادك» — ده الوقت اللي بيتحسب منه شغلك،
    //    وبيساوي وقت وصولك لو كنت متأخر. الميعاد الحقيقي هو
    //    shift_min. الخلط بينهم كان بيطلع «حضرت ١٨ وميعادك ١٨»
    //    على يوم فيه خصم — كلام متناقض.
    const shift = (r.shift_min != null) ? r.shift_min : r.counted_min;
    return '\n\n⚠️ إنت متأخر النهاردة.\n'
         + 'ميعادك ' + clock(shift) + ' وحضرت ' + clock(r.arrived_min) + '.\n'
         + '💸 هيتخصم منك ' + Number(r.penalty) + ' ج.م.\n'
         + 'شوف التفاصيل في شاشة «مرتبك».';
  }

  // ---- انصراف ----
  // ⚠️ بنجيب تفاصيل اليوم من hr_overtime مش من hr_my_day_status،
  //    لأننا محتاجين البريك المسموح عشان نقول للموظف الحضور
  //    المطلوب كامل (شغل + بريك) مش الشغل لوحده. الموظف اللي
  //    بيقرا «المطلوب ٩ ساعات» وهو عارف إنه بيقعد ١٠ بيتلخبط.
  // صياغة عربي مظبوطة: «١٠ ساعات» مش «10 ساعة و 0 دقيقة»
  const hmAr = m => {
    m = Math.max(0, Math.round(Number(m) || 0));
    const H = Math.floor(m / 60), M = m % 60;
    const unit = (n, one, two, few, many) =>
      n === 1 ? one : n === 2 ? two : (n <= 10 ? n + ' ' + few : n + ' ' + many);
    const hs = H ? unit(H, 'ساعة', 'ساعتين', 'ساعات', 'ساعة') : '';
    const ms = M ? unit(M, 'دقيقة', 'دقيقتين', 'دقايق', 'دقيقة') : '';
    return hs && ms ? hs + ' و' + ms : (hs || ms || 'صفر');
  };

  let d = null;
  try{
    const { data:ov, error:e2 } = await sb.rpc('hr_overtime',
      { p_email:null, p_from:_attState.work_date, p_to:_attState.work_date });
    if(!e2 && ov && ov.length) d = ov[0];
  }catch(e){ console.error('hr_overtime (warning):', e); }

  const short = Number((d && d.short_min) != null ? d.short_min : r.short_min) || 0;
  if(!(short > 0)) return '';

  const need   = Number((d && d.need_min) != null ? d.need_min : r.need_min) || 0;
  const worked = Number((d && d.worked_min) != null ? d.worked_min : r.worked_min) || 0;
  const allow  = Number((d && d.break_allow_min) || 0);

  return '\n\n⚠️ ساعاتك ناقصة النهاردة.\n'
       + 'المطلوب منك تقعد ' + hmAr(need + allow)
       + (allow ? ' (' + hmAr(need) + ' شغل + ' + hmAr(allow) + ' بريك)' : '') + '.\n'
       + 'وإنت اشتغلت ' + hmAr(worked) + '.\n'
       + '⏳ فلسه عليك ' + hmAr(short) + '.';
}

// ============================================================
// القراءة
// ============================================================
let _attErr = '';   // آخر خطأ في قراءة الحالة

async function attLoadState(){
  _attErr = '';
  try{
    const { data, error } = await sb.rpc('hr_my_today');
    if(error) throw error;
    const r = Array.isArray(data) ? data[0] : data;
    _attState = r || { last_kind:null, last_at:null, work_date:null, punches:0 };
    await attLoadNoBreak();   // ☕🚫 هل أعلن «مطلعتش بريك» لليوم ده؟
    await attLoadDayKinds();  // أنواع تسجيلات اليوم — لفحص البريك
  }catch(e){
    // ⚠️ الفشل الصامت هنا كان أخطر من الخطأ نفسه.
    //    لما قراءة الحالة كانت بتفشل، الصفحة كانت بتحط قيم فاضية
    //    وتعرض "لسه ما سجّلتش حضور" — رسالة **منطقية وغلط**،
    //    والموظف يفتكر إن حضوره ضاع والأزرار بايظة.
    //    دلوقتي بنقول إن فيه مشكلة، مش بنخترع حالة.
    console.error('hr_my_today failed:', e);
    _attErr = (e && e.message) ? e.message : String(e);
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
    // ⚠️ manual_by = ختم «اتكتب من شؤون العاملين». الموظف لازم
    //    يشوفه في سجله. سجل بيتعدّل من غير ما صاحبه يعرف = سجل
    //    مالوش قيمة كدليل.
    .select('kind,at,work_date,distance_m,verified,manual_by')
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
  // فيه خطأ في القراءة؟ نقفل كل حاجة — التسجيل على حالة مش
  // متأكدين منها ممكن يعمل صفوف غلط في السجل
  if(_attErr) return false;
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
        ${_attErr ? `<div class="att-warn">⚠️ مقدرناش نقرا حالتك — الأزرار مقفولة عشان
          ما نسجّلش حاجة غلط.<br><span class="att-warn-d">${esc(_attErr)}</span></div>` : ''}
        ${busyMsg ? `<div class="att-busy">${esc(busyMsg)}</div>` : ''}
        <div class="att-grid">
          ${btn('in')}${btn('out')}${btn('break')}${btn('resume')}
        </div>
        <!-- ☕🚫 إعلان «مطلعتش بريك» — ده **مش تسجيل حضور**، ده
             معلومة لـ HR وقت المراجعة ومالهاش أي تأثير على الساعات.
             بيبان بس لو الوردية مفتوحة (حاضر أو راجع من بريك). -->
        ${_attNoBreakBtn(busyMsg)}
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

// ============================================================
// ☕🚫 «مطلعتش بريك»
// ------------------------------------------------------------
// إعلان من الموظف إنه ما أخدش بريك النهاردة، عشان HR تشوفه وهي
// بتراجع. 🔴 مش بيتسجّل في سجل الحضور: أي تسجيل مش «حضور/استئناف»
// بيقفل عدّاد الساعات، والزرار ده المفروض ميأثرش على أي حساب.
// ============================================================
let _attNoBreak = false;   // اتسجّل لليوم ده؟

function _attNoBreakBtn(busyMsg){
  // الوردية لازم تكون مفتوحة — مفيش معنى للإعلان قبل الحضور
  const open = _attState.last_kind && _attState.last_kind !== 'out';
  if(!open) return '';
  // أخد بريك فعلاً؟ الزرار ملوش لازمة (والسيرفر هيرفضه برضه).
  // ⚠️ بنبص على تسجيلات اليوم كلها مش على آخر واحدة بس — اللي
  //    راح بريك ورجع واشتغل، آخر تسجيل عنده «استئناف»، وقبل كده
  //    كان الزرار بيختفي. بس اللي راح بريك ورجع وبعدين... الحالة
  //    الوحيدة اللي كانت بتعدّي هي إن يومه فيه بريك وهو بيقول
  //    مطلعتش — وده اللي بنقفله هنا.
  if((_attDayKinds || []).includes('break')) return '';
  if(_attNoBreak){
    return `<button class="att-nobreak done" disabled>✅ متسجّل: مطلعتش بريك النهاردة</button>`;
  }
  return `<button class="att-nobreak" ${busyMsg ? 'disabled' : ''}
    onclick="attNoBreak()">☕🚫 مطلعتش بريك النهاردة</button>`;
}

async function attNoBreak(){
  if(_attBusy) return;
  if(!confirm('تأكيد: إنت ما أخدتش بريك النهاردة؟\nده هيتسجّل لشؤون العاملين.')) return;
  _attBusy = true;
  attRender('⏳ بنسجّل…');
  try{
    const { data, error } = await sb.rpc('hr_declare_no_break');
    // ⚠️ Supabase مبيرميش خطأ — بيرجّعه في .error
    if(error) throw error;
    _attNoBreak = true;
    alert('✅ اتسجّل — شؤون العاملين هتشوفه في يوم ' + (data || ''));
  }catch(e){
    alert('❌ ' + ((e && e.message) || e));
  }finally{
    _attBusy = false;
    attRender();
  }
}

// بنقرا حالة اليوم مع حالة الحضور — عشان الزرار يبان متسجّل
// لو الموظف قفل الصفحة وفتحها تاني
async function attLoadNoBreak(){
  _attNoBreak = false;
  if(!_attState.work_date) return;
  try{
    const { data, error } = await sb.from('hr_no_break')
      .select('work_date').eq('work_date', _attState.work_date).limit(1);
    if(error) throw error;
    _attNoBreak = !!(data && data.length);
  }catch(e){
    // مش مشكلة تمنع الشاشة — أسوأ حاجة إن الزرار يبان مرة زيادة
    console.error('attLoadNoBreak:', e);
  }
}

// ============================================================
// ⚠️ إنذار البريك وقت الانصراف
// ------------------------------------------------------------
// بيانات البريك ناقصة؟ بنسأل الأول بدل ما اليوم يتقفل غلط.
//   ☕ طلعت ورجعت    → خصم ضعف مدة البريك من الساعات (مفيش فلوس)
//   🚫 مطلعتش بريك   → انصراف عادي
//   🚶 طلعت ومرجعتش  → انصراف من وقت البريك، مفيش فلوس
// ============================================================
let _attDayKinds = [];     // أنواع تسجيلات يوم الوردية
let _attAnswer   = null;   // إجابة مستنية تتنفذ بعد الانصراف

async function attLoadDayKinds(){
  _attDayKinds = [];
  if(!_attState.work_date) return;
  try{
    const { data, error } = await sb.from('attendance')
      .select('kind,at').eq('work_date', _attState.work_date).order('at', { ascending:true });
    if(error) throw error;
    _attDayKinds = (data || []).map(r => r.kind);
  }catch(e){
    // مش بنوقف الانصراف بسبب ده — أسوأ حاجة إن السؤال ما يطلعش
    console.error('attLoadDayKinds:', e);
  }
}

// محتاجين نسأل؟
function attNeedBreakAsk(){
  if(_attNoBreak) return false;                 // أعلن بالزرار خلاص
  const k = _attDayKinds || [];
  const nBreak  = k.filter(x => x === 'break').length;
  const nResume = k.filter(x => x === 'resume').length;
  if(nBreak === 0) return true;                 // ما سجّلش بريك خالص
  if(nBreak > nResume) return true;             // طلع بريك وما رجعش
  return false;                                 // بريك مكتمل — تمام
}

function attShowBreakAsk(){
  let box = document.getElementById('attAskBox');
  if(!box){
    box = document.createElement('div');
    box.id = 'attAskBox';
    document.body.appendChild(box);
  }
  // 🔴 فيه ضغطة «بريك» متسجّلة النهاردة؟ يبقى «مطلعتش بريك» كذب
  //    صريح ضد السجل — بنشيل الاختيار خالص بدل ما نسيبه ونرفضه
  //    بعدين. (السيرفر بيرفضه كمان، الشاشة مش حماية لوحدها.)
  const hasBreak = (_attDayKinds || []).includes('break');
  box.innerHTML = `
    <div class="att-ask-bg" onclick="attCloseAsk(event)">
      <div class="att-ask" onclick="event.stopPropagation()">
        <div class="att-ask-h">⚠️ بيانات البريك ناقصة</div>
        <p class="att-ask-p">${hasBreak
          ? 'إنت سجّلت <b>بريك</b> النهاردة وما سجّلتش استئناف.<br>قول حصل إيه:'
          : 'ما سجّلتش بريك واستئناف النهاردة.<br>قول حصل إيه عشان نقفل يومك صح:'}</p>
        <button class="att-ask-b took" onclick="attAnswerBreak('took_returned')">☕ طلعت ورجعت</button>
        ${hasBreak ? '' :
          `<button class="att-ask-b none" onclick="attAnswerBreak('no_break')">🚫 مطلعتش بريك</button>`}
        <button class="att-ask-b left" onclick="attAnswerBreak('left_no_return')">🚶 طلعت ومرجعتش</button>
        ${hasBreak ? `<p class="att-ask-n">🔒 «مطلعتش بريك» مش متاح — فيه بريك متسجّل عليك النهاردة.</p>` : ''}
        <button class="att-ask-x" onclick="attCloseAsk()">إلغاء</button>
      </div>
    </div>`;
}
function attCloseAsk(ev){
  if(ev && ev.target !== ev.currentTarget) return;
  const box = document.getElementById('attAskBox');
  if(box) box.remove();
}

async function attAnswerBreak(ans){
  attCloseAsk();

  // 🚶 طلعت ومرجعتش — مفيش انصراف عادي، السيرفر بيسجّله بوقت البريك
  if(ans === 'left_no_return'){
    if(!confirm('هنسجّل انصرافك من وقت ما دوست بريك.\nالساعات بعد كده مش هتتحسب. تمام؟')) return;
    _attBusy = true; attRender('⏳ بنسجّل…');
    try{
      const { data, error } = await sb.rpc('hr_checkout_at_break');
      // ⚠️ Supabase مبيرميش خطأ — بيرجّعه في .error
      if(error) throw error;
      if(data === 'no_break_punch'){
        alert('⚠️ إنت ما دوستش بريك أصلاً، فمعندناش وقت نسجّل عليه الانصراف.\nيومك هيفضل مفتوح — كلّم الإدارة تظبطه.');
      }else{
        alert('✅ اتسجّل انصرافك من وقت البريك.');
      }
      await attLoadState();
    }catch(e){
      alert('❌ ' + ((e && e.message) || e));
    }finally{
      _attBusy = false; attRender();
    }
    return;
  }

  // ☕ / 🚫 — الانصراف العادي الأول (موقع + بصمة)، والنتيجة بعده
  if(ans === 'took_returned'){
    if(!confirm('هيتخصم من ساعاتك ضعف مدة البريك. متأكد؟')) return;
  }
  _attAnswer = ans;
  attPunch('out');     // بيعدّي من الفحص دلوقتي لأن _attAnswer اتحطت
}

// بتتنفذ بعد ما الانصراف ينجح
async function attApplyAnswer(ans){
  try{
    const { data, error } = await sb.rpc('hr_break_answer', { p_answer: ans });
    if(error) throw error;
    const mins = Number((data && data.hours_min) || 0);
    const amt  = Number((data && data.amount) || 0);
    // 🔕 «مطلعتش بريك» مبيطلعش أي رسالة عن قصد — مفيش خصم أصلاً
    if(mins){
      alert('اتسجّل ✅\n• اتخصم من ساعاتك: ' + Math.round(mins) + ' دقيقة');
    }else if(amt){
      alert('اتسجّل ✅\n• وخصم: ' + amt + ' ج.م (هتلاقيه في «مرتبك»)');
    }
  }catch(e){
    // ⚠️ الانصراف اتم خلاص — فمش هنخوّف الموظف برسالة فشل كبيرة،
    //    بس لازم نقول بوضوح إن الإقرار ما اتسجّلش عشان يبلّغ.
    console.error('hr_break_answer:', e);
    alert('⚠️ انصرافك اتسجّل، بس إقرار البريك ما اتسجّلش.\nقول لشؤون العاملين.');
  }
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
          <span>${ATT_LABELS[r.kind].icon} ${ATT_LABELS[r.kind].t}
            ${r.manual_by ? '<span class="att-manual">✍️ اتكتب من شؤون العاملين</span>' : ''}</span>
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
  .att-warn{margin-top:10px; background:rgba(180,83,9,.14); color:#B45309;
    border:1px solid rgba(180,83,9,.35); border-radius:11px; padding:11px 13px;
    font-size:12.5px; line-height:1.9; text-align:center;}
  html[data-theme="dark"] #attOverlay .att-warn{color:#FBBF24;}
  .att-warn-d{display:block; margin-top:5px; font-size:11px; opacity:.8; direction:ltr;
    word-break:break-word;}
  .att-grid{display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:14px 0;}
  /* نفس شكل أزرار الحضور بالظبط — لون واحد مصمت وخط أبيض.
     بنّي أغمق شوية من زرار البريك عشان يتفرق عنه بالبصر. */
  .att-nobreak{width:100%; border:none; border-radius:14px; padding:18px 10px;
    font-family:inherit; font-size:15px; font-weight:800; color:#fff;
    background:#7C4A12; cursor:pointer; margin-bottom:14px;}
  .att-nobreak:disabled{opacity:.35; cursor:not-allowed;}
  .att-nobreak.done{background:#166534; opacity:1;}
  .att-btn{padding:18px 10px; border:none; border-radius:14px; font-family:inherit;
    font-size:15px; font-weight:800; color:#fff; cursor:pointer;}
  .att-btn:disabled{opacity:.35; cursor:not-allowed;}
  .att-in{background:#16A34A;} .att-out{background:#DC2626;}
  .att-break{background:#B45309;} .att-resume{background:#0891A8;}
  .att-note{font-size:12.5px; line-height:1.9; color:var(--a-mut); text-align:center;}
  /* ⚠️ سؤال البريك */
  .att-ask-bg{position:fixed; inset:0; z-index:99990; background:rgba(6,11,17,.72);
    display:flex; align-items:center; justify-content:center; padding:20px;}
  .att-ask{width:100%; max-width:380px; background:var(--a-card,#1B2A3A); color:var(--a-ink,#E9EFF5);
    border:1px solid var(--a-line,#2F4356); border-radius:18px; padding:20px 18px 16px; text-align:center;}
  .att-ask-h{font-size:16.5px; font-weight:800; color:#FBBF24; margin-bottom:8px;}
  .att-ask-p{font-size:13.5px; line-height:1.9; color:var(--a-ink2,#C3D2DF); margin:0 0 16px;}
  .att-ask-b{display:block; width:100%; border:none; border-radius:13px; padding:15px 10px;
    font-family:inherit; font-size:14.5px; font-weight:800; color:#fff; cursor:pointer; margin-bottom:9px;}
  .att-ask-b.took{background:#B45309;} .att-ask-b.none{background:#166534;}
  .att-ask-b.left{background:#4C1D95;}
  .att-ask-x{display:block; width:100%; border:none; background:none; color:var(--a-mut,#92A6B8);
    font:700 13px/1 inherit; padding:10px; cursor:pointer;}
  .att-ask-n{font-size:12px; line-height:1.8; color:var(--a-mut,#92A6B8); margin:4px 0 0;}
  .att-log-head{display:flex; align-items:center; justify-content:space-between; gap:10px;
    margin:20px 0 10px; color:var(--a-ink);}
  .att-log-head input{border:1px solid var(--a-line); border-radius:9px; padding:8px 10px;
    font-family:inherit; background:var(--a-card); color:var(--a-ink);}
  .att-day{background:var(--a-card); border:1px solid var(--a-line);
    border-radius:12px; padding:12px 14px; margin-bottom:10px;}
  .att-day-h{font-weight:800; font-size:13.5px; margin-bottom:8px; color:var(--a-ink);}
  .att-row{display:flex; justify-content:space-between; font-size:13.5px; padding:5px 0;
    color:var(--a-ink2);}
  .att-empty{text-align:center; color:var(--a-mut); padding:24px; font-size:13.5px;}
  .att-manual{display:inline-block; margin-inline-start:6px; font-size:10.5px;
    font-weight:800; color:#2B6CB0; background:rgba(43,108,176,.13);
    border-radius:6px; padding:1px 6px;}
  html[data-theme="dark"] #attOverlay .att-manual{color:#7BA9DC;}`;
  (document.head || document.documentElement).appendChild(s);
})();
