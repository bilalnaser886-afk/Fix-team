// ============================================================
// I Fix Team — محرك طباعة الليبل المشترك (label.js)
// ------------------------------------------------------------
// اتنقل من dashboard.html عشان صفحة الديسباتشر تستخدمه كمان.
// الطباعة الحرارية شغل دقيق (مقاسات ومليمترات وهامش الباركود)،
// ونسخه في صفحتين معناه إن أي ظبط في الطابعة يتعمل مرتين —
// وأكيد مرة هتتنسى.
//
// ⚠️ الترتيب — بعد common.js و i18n.js:
//     <script src="common.js"></script>
//     <script src="i18n.js"></script>
//     <script src="label.js"></script>
//
// الصفحة لازم توفّر:  sb · esc (common.js) · t (i18n.js) · devices
//
// وبتوفّر اختيارياً — ولو مش موجودة فيه بدائل جوه الملف:
//   isFeatureEnabled · shortDateTime · fixDigitsInput · showError · enDigits
//
// ⚠️ التعريفات اللي تحت اتشالت من dashboard.html — متعرّفهاش في
//    مكانين وإلا المتصفح هيقول "Identifier already declared"
//    والصفحة **كلها** هتقع.
// ============================================================


// ============================================================
// الاستايل — بيتحقن من هنا مرة واحدة
// ------------------------------------------------------------
// ⚠️ محطوط في الملف مش في كل صفحة، عشان معاينة الليبل تطلع
//    **نفس الشكل بالظبط** في الداشبورد والديسباتشر. لو اتنسخ
//    في صفحتين، أول ظبط في المقاسات هيتعمل في واحدة وينسى التانية.
//
// ⚠️ ألوان الليبل نفسه ثابتة عن قصد (أبيض وأسود) — ده ورق
//    هيتطبع، مالوش علاقة بالوضع الغامق. الإطار المتقطّع بس هو
//    اللي بياخد لون الثيم.
// ============================================================
(function lblCss(){
  if(document.getElementById('lblCss')) return;
  const s = document.createElement('style');
  s.id = 'lblCss';
  s.textContent = `
  .print-label{
    background:#fff; color:#101014; border:2px dashed var(--border,var(--line,#CBD5E1));
    border-radius:10px; padding:16px; width:270px; margin:0 auto 16px; text-align:center;
  }
  .label-row-title{font-weight:800; font-family:'Cairo',-apple-system,'SF Arabic',sans-serif; font-size:15px; margin-bottom:4px;}
  .label-row{font-size:12px; color:#334155; margin-bottom:2px;}
  .label-row.mono{font-family:monospace; font-size:11px;}
  .label-id{font-size:10px; color:#94A3B8; margin-top:8px; font-family:monospace;}
  /* الخلفية البيضا والحشو = الهامش المطلوب للقراءة (quiet zone)،
     عشان المعاينة على الشاشة تتمسح زي الليبل المطبوع */
  #qrHolder{display:flex; justify-content:center; margin:10px 0;}
  #qrHolder img, #qrHolder canvas{background:#fff; padding:12px; box-sizing:content-box;}
  .label-size-row{display:flex; gap:8px; align-items:flex-end; margin:10px 0 6px; flex-wrap:wrap;}
  .label-size-row label{flex:1; min-width:90px; font-size:12px;
    color:var(--muted,#64748B);}
  .label-size-row input{width:100%; border:1px solid var(--border,var(--line,#E2E8F0));
    background:var(--surface,var(--card,#fff)); color:var(--ink,#101014);
    border-radius:8px; padding:9px 10px; font-size:15px; font-family:inherit; text-align:center;}
  .label-hint{font-size:11.5px; color:var(--muted,#64748B); line-height:1.6; margin-bottom:8px;}`;
  (document.head || document.documentElement).appendChild(s);
})();

// ===== بدائل آمنة للحاجات اللي مش في كل صفحة =====
function lblEnDigits(s){
  if(typeof enDigits === 'function') return enDigits(s);
  return String(s == null ? '' : s)
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
}
function lblFixDigits(el){
  if(typeof fixDigitsInput === 'function') return fixDigitsInput(el);
  if(el) el.value = lblEnDigits(el.value);
}
// ⚠️ لو الصفحة مش عارفة تسأل عن المفتاح، بنفترض **مقفول** — يعني
//    الطباعة الصامتة مش هتشتغل والمستخدم ياخد نافذة الطباعة
//    العادية. الافتراض المقفول أأمن من المفتوح.
function lblFeature(k){
  try{ return (typeof isFeatureEnabled === 'function') ? isFeatureEnabled(k) : false; }
  catch(e){ return false; }
}
function lblShortDate(iso){
  if(typeof shortDateTime === 'function') return shortDateTime(iso);
  const d = new Date(iso);
  if(isNaN(d)) return '';
  return d.toLocaleDateString('ar-EG', { day:'numeric', month:'short' })
       + ' · ' + d.toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' });
}
function lblErr(msg){
  try{ if(typeof showError === 'function') return showError(msg); }catch(e){}
  if(msg) alert(msg);
}
function lblToast(msg){
  try{ if(typeof showImportDone === 'function') return showImportDone(msg); }catch(e){}
  try{ if(typeof toast === 'function') return toast(msg); }catch(e){}
  if(msg) alert(msg);
}

const LABEL_SIZE_KEY = 'ifix_label_size';
let labelDeviceId = null;

function getLabelSize(){
  try{
    const v = JSON.parse(localStorage.getItem(LABEL_SIZE_KEY));
    if(v && v.w > 0 && v.h > 0) return v;
  }catch(e){}
  return { w: 37, h: 25 };   // مقاس ليبل I Fix Team — عدّله من الخانات لو اتغير
}

function saveLabelSize(){
  const w = parseFloat(lblEnDigits(document.getElementById('lblW').value)) || 0;
  const h = parseFloat(lblEnDigits(document.getElementById('lblH').value)) || 0;
  if(w > 0 && h > 0){
    try{ localStorage.setItem(LABEL_SIZE_KEY, JSON.stringify({ w, h })); }catch(e){}
  }
}

function renderLabelInto(containerId, d){
  labelDeviceId = d.id;
  const sz = getLabelSize();
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <div class="print-label" id="printLabel">
      <div class="label-row-title">${esc(d.shopName || '—')}</div>
      <div class="label-row" style="font-weight:800;">${esc(d.customerName)}</div>
      <div class="label-row" style="font-weight:800;">${esc(d.deviceType)} ${esc(d.model)}</div>
      ${d.status==='returned' ? `<div class="label-row" style="font-weight:900;">🔁 ${t('ui.returnMark')}</div>` : ''}
      ${(d.status==='returned' && (d.discoveredFault || d.returnComplaint))
        ? `<div class="label-row">${esc(d.discoveredFault || d.returnComplaint)}</div>`
        : (d.reportedIssue ? `<div class="label-row">${esc(d.reportedIssue)}</div>` : '')}
      <div class="label-row">${esc(lblShortDate(d.intakeDate))}</div>
      <div id="qrHolder"></div>
      <div style="font-family:'Cairo',-apple-system,'SF Arabic',sans-serif; font-weight:900; font-size:13px; letter-spacing:.5px;">I FIX TEAM</div>
      ${d.conditionNotes ? `<div style="border-top:1px solid var(--border-strong); margin-top:8px; padding-top:6px; font-size:${d.conditionNotes.length > 60 ? 9 : d.conditionNotes.length > 30 ? 10 : 11}px; font-weight:700; line-height:1.5; text-align:right;">${esc(d.conditionNotes)}</div>` : ''}
    </div>
    <div class="label-size-row">
      <label>${t('ui.labelW')}<input id="lblW" type="text" inputmode="decimal" value="${sz.w}" oninput="lblFixDigits(this)" onchange="saveLabelSize()" /></label>
      <label>${t('ui.labelH')}<input id="lblH" type="text" inputmode="decimal" value="${sz.h}" oninput="lblFixDigits(this)" onchange="saveLabelSize()" /></label>
    </div>
    <div class="label-hint">${t('ui.labelHint')}</div>
    <button class="btn-primary" style="width:100%;justify-content:center;" onclick="printLabel()">🖨 ${t('ui.printingLabel')}</button>
  `;
  drawQr(d.id);
}

// رسم الباركود — بيحمّل المكتبة لو مش موجودة ويحاول تاني
function drawQr(text, attempt){
  attempt = attempt || 0;
  const holder = document.getElementById('qrHolder');
  if(!holder) return;

  if(window.QRCode){
    try{
      holder.innerHTML = '';
      new QRCode(holder, { text: text, width:110, height:110, correctLevel: QRCode.CorrectLevel.M });
    }catch(e){
      holder.innerHTML = `<div style="font-size:11px;color:var(--danger);">${t('ui.barcodeError')}</div>`;
    }
    return;
  }

  if(attempt === 0){
    // محاولة تحميل المكتبة من جديد (ممكن تكون فشلت أول مرة)
    holder.innerHTML = `<div style="font-size:11px;color:var(--muted-2);">⏳ ${t('ui.barcodePrep')}</div>`;
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    sc.onload = () => drawQr(text, 1);
    sc.onerror = () => drawQr(text, 3);
    document.head.appendChild(sc);
    setTimeout(() => { if(!window.QRCode) drawQr(text, 3); }, 6000);
    return;
  }

  if(attempt === 1){
    // المكتبة اتحمّلت دلوقتي
    setTimeout(() => drawQr(text, window.QRCode ? 0 : 3), 100);
    return;
  }

  holder.innerHTML = `<div style="font-size:11px;color:var(--danger);line-height:1.7;">
    ❌ ${t('ui.barcodeFail')}<br>
    <span style="color:var(--muted-2);font-size:10.5px;">${t('ui.cdnHint')}</span>
  </div>`;
}

// نجيب صورة الـ QR الجاهزة من المعاينة عشان نحطها في نافذة الطباعة
function grabQrDataUrl(){
  const holder = document.getElementById('qrHolder');
  if(!holder) return '';
  const img = holder.querySelector('img');
  if(img && img.src && img.src.startsWith('data:')) return img.src;
  const canvas = holder.querySelector('canvas');
  if(canvas){
    try{ return canvas.toDataURL('image/png'); }catch(e){}
  }
  return '';
}

// ============================================================
// الطباعة الصامتة المباشرة (عبر وكيل محلي على الكمبيوتر)
// الفكرة: المتصفح يرسم الليبل كصورة (عشان العربي والخطوط تطلع مظبوطة)،
// والوكيل على الكمبيوتر يطبعها على طول من غير نافذة طباعة.
// لو الوكيل مش شغال أو حصل أي مشكلة → بنرجع لنافذة الطباعة العادية.
// ============================================================
const PRINT_AGENT_URL = 'http://localhost:9123';
// الوكيل بيشتغل على كمبيوتر المحل بس. من الموبايل الطباعة بتروح
// للسحابة، ونافذة الطباعة العادية مالهاش لازمة — الطابعة أصلاً
// مش متوصلة بالموبايل.
const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const PX_PER_MM = 8;   // ≈203 نقطة/بوصة وهو دقة طابعات الليبل الحرارية

// بنرسم الليبل بـ3 أضعاف الدقة وبعدين نصغّره — الرسام بياخد راحته في
// تشكيل الحروف العربية والنتيجة أنضف بكتير من الرسم على المقاس النهائي.
const LABEL_SS = 4;
// الطابعة الحرارية بتطبع أسود أو أبيض بس، مبتعرفش رمادي. لو سبنا لها
// الحواف الرمادية بتحوّلها نقط متفرقة والكلام بيطلع مغبّش — فبنحسمها
// إحنا: أي بكسل أغمق من الحد ده يبقى أسود صافي، وغير كده أبيض صافي.
// لو الخط طلع رفيع زوّد الرقم شوية (0.70)، ولو طلع تخين قلّله (0.55).
const INK_THRESHOLD = 0.62;

function loadImg(src){
  return new Promise((res, rej) => {
    if(!src) return res(null);
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

// بيتأكد إن خط Tajawal اتحمّل فعلاً قبل الرسم. لو رسمنا والخط لسه
// جاي من النت، الكانفس بيقع على خط احتياطي وشكل العربي بيبوظ.
async function ensureLabelFont(){
  if(!document.fonts || !document.fonts.load) return;
  try{
    await Promise.all([
      document.fonts.load('700 20px Cairo'),
      document.fonts.load('900 20px Cairo'),
      document.fonts.load('500 20px Tajawal'),
      document.fonts.load('700 20px Tajawal')
    ]);
    await document.fonts.ready;
  }catch(e){}
}

// كود QR بدقة عالية مخصوص للطباعة. الكود اللي في المعاينة 110 بكسل بس،
// وتصغيره لمقاس الليبل بيخبط حواف المربعات ويصعّب القراءة.
async function hiResQr(text, px){
  if(!window.QRCode || !text) return null;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden;';
  document.body.appendChild(box);
  try{
    new QRCode(box, { text:String(text), width:px, height:px, correctLevel:QRCode.CorrectLevel.M });
    await new Promise(r => setTimeout(r, 80));
    const cv = box.querySelector('canvas');
    if(cv) return cv.toDataURL('image/png');
    const im = box.querySelector('img');
    return (im && im.src) ? im.src : null;
  }catch(e){ return null; }
  finally{ box.remove(); }
}

// بيرسم نفس محتوى الليبل على canvas ويرجّع صورة PNG
// ⚠️ التخطيط هنا لازم يفضل مطابق لـ browserPrintLabel() بالظبط:
//    الكود على اليمين والنصوص على الشمال، نفس الخطوط ونفس المقاسات.
//    أي تعديل في الاتنين لازم يتعمل في التاني.
async function renderLabelImage(d, sz, qrDataUrl){
  await ensureLabelFont();

  const S = LABEL_SS;
  const W = Math.round(sz.w * PX_PER_MM), H = Math.round(sz.h * PX_PER_MM);
  const mm = v => v * PX_PER_MM;                 // مليمتر → بكسل

  // نفس معادلات المقاسات الموجودة في browserPrintLabel بالحرف
  const cond = (d.conditionNotes || '').trim();
  const k    = cond ? 0.90 : 1;
  const padMm = Math.max(0.8, sz.h * 0.045);
  const pad   = mm(padMm);
  const qrSz  = mm(Math.min(sz.h * 0.62, sz.w * 0.32));
  const fShop  = mm(Math.max(2.2, sz.h * 0.148 * k));
  const fCust  = mm(Math.max(1.9, sz.h * 0.122 * k));
  const fDev   = mm(Math.max(1.9, sz.h * 0.122 * k));
  const fIssue = mm(Math.max(1.7, sz.h * 0.100 * k));
  const fDate  = mm(Math.max(1.5, sz.h * 0.090 * k));
  const fBrand = mm(Math.max(1.4, sz.h * 0.088 * k));

  const stripWmm = sz.w - (padMm * 2);
  const stripHmm = Math.max(2.6, sz.h * 0.20);
  let fCond = 0;
  if(cond){
    const ideal = Math.sqrt((stripWmm * stripHmm) / (cond.length * 0.52 * 1.25));
    fCond = mm(Math.min(sz.h * 0.078, Math.max(0.95, ideal)));
  }

  // نرسم بـ3 أضعاف الدقة، والتصغير والحسم بيحصلوا في الآخر
  const c = document.createElement('canvas');
  c.width = W * S; c.height = H * S;
  const x = c.getContext('2d');
  x.scale(S, S);
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#000';
  x.textBaseline = 'middle';

  const setFont = (weight, size, fam) => { x.font = `${weight} ${size}px ${fam}, sans-serif`; };
  // قص النص بثلاث نقط — نفس شغل text-overflow:ellipsis
  const fit = (txt, maxW) => {
    if(!txt) return '';
    if(x.measureText(txt).width <= maxW) return txt;
    let out = String(txt);
    while(out.length > 1 && x.measureText(out + '…').width > maxW) out = out.slice(0, -1);
    return out + '…';
  };

  // ============ شريط حالة الجهاز تحت ============
  const condMargin = mm(sz.h * 0.012);
  const condPadTop = mm(sz.h * 0.012);
  const condBorder = Math.max(1, Math.round(mm(0.18)));
  let topBottom = H - pad;

  if(cond){
    setFont(700, fCond, 'Tajawal');
    x.direction = 'rtl'; x.textAlign = 'right';
    const lineH = fCond * 1.25;
    const maxW  = W - pad * 2;
    const words = cond.split(/\s+/);
    const lines = [];
    let ln = '';
    for(const wd of words){
      const test = ln ? ln + ' ' + wd : wd;
      if(x.measureText(test).width > maxW && ln){ lines.push(ln); ln = wd; }
      else ln = test;
    }
    if(ln) lines.push(ln);
    const room = mm(stripHmm) - condBorder - condPadTop;
    const shown = lines.slice(0, Math.max(1, Math.floor(room / lineH)));
    const blockH = condBorder + condPadTop + shown.length * lineH;
    const bTop = H - pad - blockH;

    x.fillRect(pad, bTop, W - pad * 2, condBorder);
    let ly = bTop + condBorder + condPadTop;
    for(const l of shown){ x.fillText(l, W - pad, ly + lineH / 2); ly += lineH; }
    topBottom = bTop - condMargin;
  }

  // ============ الجزء العلوي — الكل متمركز رأسياً ============
  const topMid = (pad + topBottom) / 2;

  // عمود الكود على اليمين
  // ⚠️ الهامش الأبيض حوالين الكود (quiet zone).
  //    مواصفة QR بتفرض ٤ مربعات فاضية على كل ناحية، وقارئ
  //    الموبايل بيرفض الكود من غيرها حتى لو مطبوع مظبوط تماماً.
  //    مكتبة qrcodejs بترسم المصفوفة بس من غير أي هامش، فاللي كان
  //    موجود هو الحشو الخارجي وحده:
  //        على الجنب = pad         ≈ ٢.٤ مربع
  //        من تحت    = brandMargin ≈ ١.٢ مربع   ← الأسوأ
  //    وده كان بيخلي القراءة بالموبايل تفشل على ليبل سليم.
  //
  //    الحل: نرسم الكود جوه مربعه مزوّد بالهامش الناقص، والحشو
  //    الخارجي بيكمّل الباقي. كود الجهاز = 'dev_' + ١٣ رقم =
  //    ١٧ بايت بتصحيح M → نسخة ٢ = ٢٥ مربع.
  //        quiet + pad = 4×مربع   و   مربع = (qrSz - 2·quiet)/25
  //        ⇒ quiet = (4·qrSz - 25·pad) / 33
  //    وسقف أخير: المربع الواحد مايقلّش عن ٣ نقط طابعة، وإلا
  //    الليبل الصغير يطلع كود مهروس. على المقاسات دي بناخد أكبر
  //    هامش نقدر عليه من غير ما نضحّي بوضوح المربعات.
  const QR_MODS   = 25;
  const QR_MIN_MOD = 3;                      // نقط الطابعة (PX_PER_MM = 8 ≈ 203dpi)
  const qrQuiet   = Math.max(0, Math.min(
                      qrSz * 0.20,
                      (4 * qrSz - QR_MODS * pad) / (QR_MODS + 8),
                      (qrSz - QR_MODS * QR_MIN_MOD) / 2));
  // الهامش تحت الكود لازم يبقى زي اللي على الجنب على الأقل
  const brandMargin = Math.max(mm(sz.h * 0.022), pad);
  const qrBoxH = qrSz + brandMargin + fBrand;
  const qrX = W - pad - qrSz;
  const qrY = topMid - qrBoxH / 2;
  const qrImg = await loadImg((await hiResQr(d.id, Math.round(qrSz) * S * 2)) || qrDataUrl);
  if(qrImg) x.drawImage(qrImg, qrX + qrQuiet, qrY + qrQuiet,
                               qrSz - qrQuiet * 2, qrSz - qrQuiet * 2);
  setFont(900, fBrand, 'Cairo');
  x.direction = 'ltr'; x.textAlign = 'center';
  try{ x.letterSpacing = mm(0.15).toFixed(2) + 'px'; }catch(e){}
  x.fillText('I FIX TEAM', qrX + qrSz / 2, qrY + qrSz + brandMargin + fBrand / 2);
  try{ x.letterSpacing = '0px'; }catch(e){}

  // النصوص على الشمال (المسافة بين العمودين = نفس الحشو)
  const infoR = W - pad - qrSz - pad;
  const infoW = infoR - pad;
  const rows = [
    { t: d.shopName || '',                            f: fShop,  w: 900, fam: 'Cairo' },
    { t: d.customerName || '',                        f: fCust,  w: 700, fam: 'Cairo' },
    { t: `${d.deviceType||''} ${d.model||''}`.trim(), f: fDev,   w: 700, fam: 'Cairo' }
  ];
  const _ret = d.status === 'returned';
  const _issue = (_ret && (d.discoveredFault || d.returnComplaint)) ? (d.discoveredFault || d.returnComplaint) : d.reportedIssue;
  if(_ret) rows.push({ t: t('ui.returnMark'), f: fIssue, w: 900, fam: 'Tajawal' });
  if(_issue) rows.push({ t: _issue, f: fIssue, w: 700, fam: 'Tajawal' });
  rows.push({ t: lblShortDate(d.intakeDate), f: fDate, w: 700, fam: 'Tajawal', ltr: true });

  // ⚠️ مقاسات الخط محسوبة من ارتفاع الليبل بس، مالهاش أي علاقة
  //    بطول النص الفعلي. والنتيجة إن ليبل باسم قصير ('الساحر')
  //    بيسيب نص الليبل فاضي والحروف أصغر من اللازم.
  //    وعلى طابعة ٢٠٣ نقطة الحجم هو الوضوح بعينه: حرف ٢.٢مم =
  //    ١٨ نقطة، و٢.٩مم = ٢٣ نقطة — فرق واضح في حروف العربي.
  //    بنكبّر كل السطور بنفس النسبة لحد ما توصل لحد العرض أو
  //    الارتفاع، أيهما أقرب.
  //    الحد الأدنى ١ — يعني مابنصغّرش أبداً، والنص الطويل بيفضل
  //    يتقص بالنقط زي ما هو. والسقف ١.٣٥ عشان الشكل مايختلش.
  let kFit = 1;
  try{
    let wK = Infinity;
    for(const r of rows){
      if(!r.t) continue;
      setFont(r.w, r.f, r.fam);
      const tw = x.measureText(r.t).width;
      if(tw > 0) wK = Math.min(wK, infoW / tw);
    }
    if(!isFinite(wK)) wK = 1;
    const baseH = rows.reduce((sum, r) => sum + r.f * 1.3, 0);
    const hK = baseH > 0 ? (topBottom - pad) / baseH : 1;
    kFit = Math.max(1, Math.min(hK, wK, 1.35));
  }catch(e){ kFit = 1; }
  if(kFit > 1.01) for(const r of rows) r.f *= kFit;

  const infoH = rows.reduce((sum, r) => sum + r.f * 1.3, 0);
  let ry = topMid - infoH / 2;
  x.textAlign = 'right';
  for(const r of rows){
    const lineH = r.f * 1.3;
    setFont(r.w, r.f, r.fam);
    x.direction = r.ltr ? 'ltr' : 'rtl';       // التاريخ بيتكتب من الشمال لليمين
    if(r.t) x.fillText(fit(r.t, infoW), infoR, ry + lineH / 2);
    ry += lineH;
  }

  // ============ التصغير لدقة الطابعة + حسم الرمادي ============
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const o = out.getContext('2d');
  o.fillStyle = '#fff'; o.fillRect(0, 0, W, H);
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = 'high';
  o.drawImage(c, 0, 0, W, H);

  try{
    const id = o.getImageData(0, 0, W, H), p = id.data, th = INK_THRESHOLD * 255;
    for(let i = 0; i < p.length; i += 4){
      const v = (p[i]*0.299 + p[i+1]*0.587 + p[i+2]*0.114) < th ? 0 : 255;
      p[i] = p[i+1] = p[i+2] = v; p[i+3] = 255;
    }
    o.putImageData(id, 0, 0);
  }catch(e){ /* لو المتصفح منع قراءة الكانفس، بنطبع من غير الحسم */ }

  return out.toDataURL('image/png');
}

// بيحاول يطبع صامت عبر الوكيل المحلي (لو على نفس الكمبيوتر)؛ بيرجّع true لو نجح
// الوكيل شغال على نفس الجهاز؟
// /health بيرد فوراً، فمهلة قصيرة تكفي. ولو الوكيل مش موجود
// الاتصال بيفشل فوراً أصلاً.
async function printAgentAlive(){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1200);
  try{
    const res = await fetch(PRINT_AGENT_URL + '/health', { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  }catch(e){
    clearTimeout(timer);
    return false;
  }
}

async function trySilentPrintLocal(image, sz, ref, jobId){
  // الموبايل مالوش وكيل محلي — بنوفّر ثانية ونص انتظار وخطأ
  // في الكونسول مع كل طباعة
  if(IS_MOBILE) return false;
  // ⚠️ الفحص الأول مهم: من غيره كنّا بنبعت أمر الطباعة
  // ونقطع الاتصال بعد 1.2 ثانية — والوكيل يكمّل طباعة،
  // وإحنا نفتكر إنه فشل ونبعت الأمر تاني عبر السحابة = ليبلين.
  if(!(await printAgentAlive())) return false;

  // الوكيل موجود — نديه وقته. الطباعة الحرارية بتاخد ثواني.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try{
    const res = await fetch(PRINT_AGENT_URL + '/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, widthMm: sz.w, heightMm: sz.h, ref, jobId }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if(!res.ok) return false;
    const out = await res.json().catch(() => ({}));
    return out && out.ok === true;
  }catch(e){
    clearTimeout(timer);
    return false;
  }
}

// بيبعت أمر طباعة عبر قاعدة البيانات — بيشتغل من أي جهاز (موبايل، تابلت، كمبيوتر تاني)
// لأن الوكيل بيراقب القاعدة نفسها، مش لازم يكون على نفس الجهاز اللي بتدوس منه
async function trySilentPrintCloud(image, sz, ref, jobId){
  jobId = jobId || ('pj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
  const key = 'print-job:' + jobId;
  try{
    const { error } = await sb.from('app_data').upsert({
      key, value: JSON.stringify({ image, widthMm: sz.w, heightMm: sz.h, ref, jobId, status: 'pending', createdAt: Date.now() }),
      updated_at: new Date().toISOString()
    });
    if(error) throw error;
  }catch(e){ return false; }

  // نستنى الوكيل يستلم الأمر ويطبع — بنسأل كل شوية لحد ما ياخد نتيجة نهائية أو الوقت يخلص
  // ⚠️ ٣٠ ثانية مش ١٢. دورة سؤال الوكيل لوحدها ٤ ثواني
  //    (POLL_MS في print-agent.js)، والطباعة الحرارية بتاخد
  //    ثواني كمان. ١٢ كانت بتنتهي والوكيل لسه بيطبع — فالمستخدم
  //    يشوف رسالة فشل والليبل بيطلع من الطابعة بعدها بثانيتين.
  const deadline = Date.now() + 30000;
  let result = false;
  let seen = false;              // شفنا الأمر في القاعدة قبل كده؟
  while(Date.now() < deadline){
    await new Promise(r => setTimeout(r, 800));
    try{
      const { data } = await sb.from('app_data').select('value').eq('key', key).maybeSingle();
      if(!data){
        // ⚠️ الصف اختفى. الوكيل هو الوحيد اللي بيقدر يمسح أمر
        //    شغّال (سياسة الحذف مقصورة على print-job:%)، فاختفاؤه
        //    بعد ما شفناه معناه إنه طبع وخلص ومسحه.
        //    من غير الشرط ده كنا بنفضل مستنيين ٣٠ ثانية ونقول
        //    "مقدرناش نوصل للطابعة" والليبل خارج من الطابعة فعلاً.
        //    ⚠️ لازم نكون شفناه الأول: لو اختفى من أول لفة يبقى
        //    الكتابة نفسها ماوصلتش، وده فشل حقيقي مش نجاح.
        if(seen){ result = true; break; }
        continue;
      }
      seen = true;
      const job = JSON.parse(data.value);
      if(job.status === 'done'){ result = true; break; }
      if(job.status === 'failed'){ result = false; break; }
    }catch(e){ /* هنكمّل المحاولة لحد ما الوقت يخلص */ }
  }
  try{ await sb.from('app_data').delete().eq('key', key); }catch(e){}   // تنظيف — سواء نجحت أو لأ
  return result;
}

async function trySilentPrint(d, sz, qrDataUrl){
  const image = await renderLabelImage(d, sz, qrDataUrl);
  const ref = devRef(d);
  // رقم واحد للمحاولتين — لو المحلية طبعت والرد ضاع، الوكيل
  // بيعرف من الرقم إن الأمر السحابي نفس الليبل ويتجاهله. طبقة تانية.
  const jobId = 'lb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  // أول محاولة: الوكيل على نفس الجهاز (أسرع بكتير لو موجود)
  if(await trySilentPrintLocal(image, sz, ref, jobId)) return true;
  // تاني محاولة: عبر السحابة — من أي جهاز حتى لو بعيد عن الطابعة
  return await trySilentPrintCloud(image, sz, ref, jobId);
}

// شريط بيبان طول ما الطباعة السحابية شغالة. من غيره المستخدم
// بيستنى نص دقيقة من غير أي إشارة، بيفتكر إن الزرار مااشتغلش،
// وبيدوس تاني — فيطلع ليبلين.
function showPrintBusy(msg){
  let el = document.getElementById('printBusyBar');
  if(!msg){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div');
    el.id = 'printBusyBar';
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99998;background:#0F766E;color:#fff;'
      + 'text-align:center;font:800 14px/1.7 inherit;padding:12px 14px;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
}

async function printLabel(){
  const dv = devices.find(x => x.id === labelDeviceId);
  if(dv && lblFeature('silent_label_print')){
    saveLabelSize();
    lblErr('');
    showPrintBusy(t('print.sending'));
    let ok = false;
    try{ ok = await trySilentPrint(dv, getLabelSize(), grabQrDataUrl()); }
    finally{ showPrintBusy(''); }
    if(ok){
      lblToast(t('print.silentDone'));
      // نقفل معاينة الليبل بعد الطباعة (مفيش دالة closeLabel — الليبل معروض داخل الصفحة)
      ['detailLabelArea','addLabelArea'].forEach(idA => {
        const el = document.getElementById(idA); if(el) el.innerHTML = '';
      });
      return;
    }
    // ⚠️ على الموبايل مابنفتحش نافذة الطباعة العادية: سفاري
    //    بيمنع النوافذ المنبثقة فبتطلع رسالة تانية فوق الأولى،
    //    وحتى لو فتحت مفيش طابعة ليبل متوصلة بالموبايل.
    //    رسالة واحدة واضحة أنفع من اتنين مالهمش لازمة.
    if(IS_MOBILE){ lblErr(t('print.cloudFailed')); return; }
    lblErr(t('print.silentFailed'));
  }
  browserPrintLabel();
}

function browserPrintLabel(){
  saveLabelSize();
  const d = devices.find(x => x.id === labelDeviceId);
  if(!d){ alert(t('msg.labelError')); return; }

  const sz = getLabelSize();
  const qr = grabQrDataUrl();

  // المقاسات بتتحسب من ارتفاع الليبل — فأي مقاس يطلع مظبوط
  const pad   = Math.max(0.8, sz.h * 0.045).toFixed(2);
  const qrSz  = Math.min(sz.h * 0.62, sz.w * 0.32).toFixed(2);
  const cond = (d.conditionNotes || '').trim();
  const k = cond ? 0.90 : 1;   // لو فيه شريط حالة تحت، نصغّر الباقي شوية عشان يوسع

  const fShop = Math.max(2.2, sz.h * 0.148 * k).toFixed(2);   // اسم المحل — الأكبر
  const fCust = Math.max(1.9, sz.h * 0.122 * k).toFixed(2);   // اسم العميل
  const fDev  = Math.max(1.9, sz.h * 0.122 * k).toFixed(2);   // نوع الجهاز والموديل
  const fIssue= Math.max(1.7, sz.h * 0.100 * k).toFixed(2);   // المشكلة
  const fDate = Math.max(1.5, sz.h * 0.090 * k).toFixed(2);   // تاريخ الدخول
  const fBrand= Math.max(1.4, sz.h * 0.088 * k).toFixed(2);   // اسم I FIX TEAM تحت الباركود

  // الهامش الأبيض حوالين الكود — نفس معادلة renderLabelImage بالحرف.
  // ⚠️ أي تعديل هنا لازم يتعمل في المكانين وإلا الليبل يطلع مختلف
  //    حسب مسار الطباعة (وكيل صامت / نافذة متصفح).
  const QR_MODS  = 25;
  const QR_MIN_MOD = 3 / PX_PER_MM;          // ٣ نقط طابعة، بالمليمتر
  const _qs = parseFloat(qrSz), _pd = parseFloat(pad);
  const qrQuiet  = Math.max(0, Math.min(
                     _qs * 0.20,
                     (4 * _qs - QR_MODS * _pd) / (QR_MODS + 8),
                     (_qs - QR_MODS * QR_MIN_MOD) / 2)).toFixed(2);
  const brandGap = Math.max(sz.h * 0.022, parseFloat(pad)).toFixed(2);

  // خط حالة الجهاز بيصغّر لوحده كل ما الكلام يكتر عشان يوسع في الشريط
  const stripW = sz.w - (parseFloat(pad) * 2);          // العرض المتاح
  const stripH = Math.max(2.6, sz.h * 0.20);            // الارتفاع المسموح للشريط
  let fCond = 0;
  if(cond){
    // تقدير: كل حرف عربي ≈ 0.52 من حجم الخط، وارتفاع السطر 1.25
    const ideal = Math.sqrt((stripW * stripH) / (cond.length * 0.52 * 1.25));
    fCond = Math.min(sz.h * 0.078, Math.max(0.95, ideal)).toFixed(2);
  }

  // ⚠️ الطباعة من **إطار مخفي جوه الصفحة**، مش نافذة جديدة.
  //    نفس علاج كشف الحساب و PDF بالظبط:
  //      • window.open على الأيفون بيفتح صفحة جديدة، ولما التطبيق
  //        مثبّت (standalone) مفيش زرار رجوع — المستخدم بيتحبس
  //        في صفحة about:blank فاضية.
  //      • والتأخير (setTimeout) بيخلي سفاري يعتبرها "طباعة
  //        تلقائية" ويرفضها أو يطلب إذن كل مرة.
  //    دلوقتي الصفحة ما بتتحركش من مكانها، والطباعة بتتنده في
  //    نفس لحظة الضغط.
  lblPrintHtml(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>ليبل ${esc(devRef(d))}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&family=Tajawal:wght@500;700&display=swap" rel="stylesheet">
<style>
  @page{ size: ${sz.w}mm ${sz.h}mm; margin: 0; }
  *{ margin:0; padding:0; box-sizing:border-box; }
  html, body{ width:${sz.w}mm; height:${sz.h}mm; overflow:hidden; }
  body{
    font-family:'Tajawal',-apple-system,'SF Arabic','Segoe UI',Tahoma,sans-serif; color:#000; background:#fff;
    padding:${pad}mm; display:flex; flex-direction:column;
  }
  .top{ display:flex; align-items:center; gap:${pad}mm; flex:1; min-height:0; overflow:hidden; }
  .cond{
    flex-shrink:0; font-size:${fCond}mm; font-weight:700; line-height:1.25;
    border-top:0.18mm solid #000; padding-top:${(sz.h*0.012).toFixed(2)}mm;
    margin-top:${(sz.h*0.012).toFixed(2)}mm; max-height:${stripH.toFixed(2)}mm;
    overflow:hidden; word-break:break-word;
  }
  .qrbox{
    flex-shrink:0; display:flex; flex-direction:column; align-items:center;
    width:${qrSz}mm;
  }
  .qr{ width:${qrSz}mm; height:${qrSz}mm; padding:${qrQuiet}mm; background:#fff; }
  .qr img{ width:100%; height:100%; display:block; }
  .brand{
    font-family:'Cairo',-apple-system,'SF Arabic',sans-serif; font-weight:900; font-size:${fBrand}mm;
    letter-spacing:.15mm; margin-top:${brandGap}mm;
    white-space:nowrap; direction:ltr;
  }
  .info{ flex:1; min-width:0; line-height:1.3; }
  .shop{
    font-family:'Cairo',-apple-system,'SF Arabic',sans-serif; font-weight:900; font-size:${fShop}mm;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .cust{
    font-family:'Cairo',-apple-system,'SF Arabic',sans-serif; font-weight:700; font-size:${fCust}mm;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .dev{
    font-family:'Cairo',-apple-system,'SF Arabic',sans-serif; font-weight:700; font-size:${fDev}mm;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .issue{
    font-size:${fIssue}mm; font-weight:700;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .date{
    font-size:${fDate}mm; font-weight:700; direction:ltr; text-align:right;
    white-space:nowrap; overflow:hidden;
  }
</style></head><body>
  <div class="top">
  <div class="qrbox">
    ${qr ? `<div class="qr"><img src="${qr}" alt=""></div>` : ''}
    <div class="brand">I FIX TEAM</div>
  </div>
  <div class="info">
    <div class="shop">${esc(d.shopName || '')}</div>
    <div class="cust">${esc(d.customerName || '')}</div>
    <div class="dev">${esc(d.deviceType)} ${esc(d.model)}</div>
    ${d.reportedIssue ? `<div class="issue">${esc(d.reportedIssue)}</div>` : ''}
    <div class="date">${esc(lblShortDate(d.intakeDate))}</div>
  </div>
  </div>
  ${cond ? `<div class="cond">${esc(cond)}</div>` : ''}
</body></html>`);
}

// ============================================================
// الطباعة — من جوه الصفحة
// ------------------------------------------------------------
// ⚠️ من غير أي setTimeout. الأيفون بيسمح بالطباعة **بس** لو جت
//    في نفس اللحظة اللي المستخدم دس فيها. أي تأخير بيخليها
//    "طباعة تلقائية" وبيترفض.
//
//    الاستايل مكتوب جوه الصفحة (<style>) فبيتقرا فوراً وشكل
//    الليبل بيطلع مظبوط. الخط الخارجي هو اللي ممكن ما يلحقش —
//    وساعتها بيطلع بخط النظام، وده أرحم من رسالة إذن كل مرة.
// ============================================================
function lblPrintHtml(html){
  const old = document.getElementById('lblPrintFrame');
  if(old) old.remove();

  const f = document.createElement('iframe');
  f.id = 'lblPrintFrame';
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;';
  document.body.appendChild(f);

  try{
    const d = f.contentWindow.document;
    d.open(); d.write(html); d.close();
    f.contentWindow.focus();
    f.contentWindow.print();
  }catch(e){
    console.error('طباعة الليبل فشلت:', e);
    f.remove();
    alert('مقدرناش نفتح نافذة الطباعة. جرّب تاني.');
  }
}

function toggleDetailLabel(id){
  const area = document.getElementById('detailLabelArea');
  if(area.innerHTML.trim() !== ''){
    area.innerHTML = '';
    return;
  }
  const d = devices.find(x => x.id === id);
  if(d) renderLabelInto('detailLabelArea', d);
}
