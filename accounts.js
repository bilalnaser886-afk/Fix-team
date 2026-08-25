// ============================================================
// I Fix Team — شاشة الحسابات المشتركة (accounts.js)
// ------------------------------------------------------------
// الملف ده فيه **الجزء اللي بيعرض بس** من شاشة "آجل المحلات":
// القراءة · البحث · الكروت · كشف المحل · تصدير PDF.
//
// 🔴 مفيش فيه ولا سطر واحد بيكتب في الدفتر. عن قصد.
//    تسجيل الدفعة · الخصم · الرصيد الافتتاحي · الحذف · النقل ·
//    تصدير Excel — كلهم لسه في dashboard.html وحده.
//
//    يعني صفحة الديسباتشر مش "بنخفي عنها الأزرار" — الكود اللي
//    بيعمل الحاجات دي **مش بيتحمّل عندها أصلاً**. وده أقوى بكتير
//    من الإخفاء.
//
// ⚠️ الترتيب — لازم يتحمّل بعد common.js و i18n.js:
//     <script src="common.js"></script>
//     <script src="i18n.js"></script>
//     <script src="accounts.js"></script>   ← هنا
//     <script> ...كود الصفحة... </script>
//
// ⚠️ التعريفات اللي تحت اتشالت من dashboard.html — متعرّفهاش في
//    مكانين وإلا المتصفح هيقول "Identifier already declared"
//    والصفحة **كلها** هتقع.
//
// الصفحة لازم توفّر:
//   • sb            (من common.js)
//   • t             (من i18n.js)
//   • esc           (من common.js)
//   • عناصر HTML:   accountsOverlay · accountsBody · accSearch
// ============================================================

// ===== مفتاح التعديل =====
// true  = المحاسب/الأدمن — كل الأزرار
// false = قراءة فقط — عرض وبحث و PDF وبس
//
// 🔧 صفحة الديسباتشر بتحطها false قبل ما تفتح الشاشة:
//     ACC_CAN_EDIT = false;
var ACC_CAN_EDIT = true;

// قايمة الأجهزة — بتُستخدم في تاريخ التسليم وفي العطل في الكشف.
// الصفحة اللي مفيهاش أجهزة بترجّع قايمة فاضية والكشف يشتغل عادي
// بتاريخ القيد بدل تاريخ التسليم.
// اللغة المستخدمة في التواريخ. getLocale معرّفة في الداشبورد بس،
// فبنقراها لو موجودة وإلا بنقرا من I18N مباشرة.
function accLocale(){
  try{
    if(typeof getLocale === 'function') return getLocale();
    if(typeof I18N !== 'undefined' && I18N.getLang && I18N.getLang() === 'en') return 'en-GB';
  }catch(e){}
  return 'ar-EG';
}

function accDevices(){
  try{ return (typeof devices !== 'undefined' && Array.isArray(devices)) ? devices : []; }
  catch(e){ return []; }
}

const LEDGER_KEY = 'accounts-ledger';
let ledger = [];

async function loadLedger(){
  try{
    // ⚠️ بنقرا من sb مباشرة مش من window.storage — دي معرّفة في
    //    الداشبورد بس، وصفحة الديسباتشر مفيهاش. والنتيجة واحدة.
    const { data, error } = await sb.from('app_data')
      .select('value').eq('key', LEDGER_KEY).maybeSingle();
    if(error) throw error;
    ledger = (data && data.value) ? JSON.parse(data.value) : [];
    try{ localStorage.setItem('ifix_ledger_cache', JSON.stringify(ledger)); }catch(e){}
  }catch(e){
    // أوفلاين → قراءة فقط من الكاش
    try{ ledger = JSON.parse(localStorage.getItem('ifix_ledger_cache') || '[]'); }catch(e2){ ledger = []; }
  }
}

function openAccounts(){
  // ⚠️ التلات حاجات دي موجودة في الداشبورد بس. الحراسة بتخلي
  //    نفس الملف يشتغل في صفحة الديسباتشر من غير ما يقع.
  const _menu = document.getElementById('menuDropdown');
  if(_menu) _menu.classList.add('hidden');
  if(typeof shieldGhostClick === 'function') shieldGhostClick();
  if(typeof clearSearchBox === 'function') clearSearchBox('accSearch');
  else { const _s = document.getElementById('accSearch'); if(_s) _s.value = ''; }
  // نرجّع طريقة العرض المحفوظة (بعد أي فتح كشف مؤقت حوّلها لقائمة)
  try{ const v = localStorage.getItem(ACC_VIEW_KEY); if(ACC_VIEW_MODES.includes(v)) accViewMode = v; }catch(e){}
  syncAccViewButtons();
  document.getElementById('accountsOverlay').classList.remove('hidden');
  renderAccounts();
}
function closeAccounts(){ document.getElementById('accountsOverlay').classList.add('hidden'); }
let accOpenShop = null;

function shopNamesForDatalist(){
  // ⚠️ كانت Set على النص الخام: اسم الدفتر مش متقصوص، فـ"محل النور"
  //    و"محل النور " كانوا بيطلعوا سطرين في القايمة. والترتيب كان
  //    ترتيب الإدخال — يعني المحل اللي بتتعامل معاه كل يوم ممكن
  //    يكون في آخر القايمة.
  //
  //    دلوقتي: دمج على مفتاح متقصوص (مسافات وحالة حروف بس — مفيش
  //    تطبيع مرن عشان محلين بأسامي متقاربة ما يندمجوش)، والعرض
  //    بأحدث صيغة اتكتبت، والترتيب بالأحدث استخداماً.
  const seen = new Map();
  const put = (raw, ts) => {
    const n = String(raw||'').trim();
    if(!n) return;
    const k = n.toLowerCase().replace(/\s+/g, ' ');
    const prev = seen.get(k);
    if(!prev || ts > prev.ts) seen.set(k, { name: n, ts });
  };
  ledger.forEach(e => put(e.shop, new Date(e.date||0).getTime() || 0));
  accDevices().forEach(d => put(d.shopName, new Date(d.intakeDate||0).getTime() || 0));
  return [...seen.values()]
    .sort((a,b) => b.ts - a.ts)
    .map(x => `<option value="${esc(x.name)}">`).join('');
}

function shopStats(){
  const shops = {};
  ledger.forEach(e => {
    const k = e.shop || 'بدون محل';
    shops[k] = shops[k] || { debit:0, credit:0, discount:0, opening:0, entries:[] };
    const amt = e.amount||0;
    if(e.type === 'credit') shops[k].credit += amt;
    else if(e.type === 'discount') shops[k].discount += amt;
    else if(e.type === 'opening') shops[k].opening += amt;
    else shops[k].debit += amt;   // debit (افتراضي)
    shops[k].entries.push(e);
  });
  Object.values(shops).forEach(s => {
    s.owed = s.debit + s.opening;      // اللي عليه (آجل + رصيد افتتاحي)
    s.paid = s.credit + s.discount;    // اللي اتدفع أو اتخصم
    s.balance = s.owed - s.paid;       // المتبقي
  });
  return shops;
}

// بيحدد الحركة اللي بتبدأ "دورة حسابية جديدة": حركة آجل/افتتاحي والرصيد قبلها كان مسدّد (≤ صفر)
function cycleStartIds(entries){
  const asc = entries.slice().sort((a,b) => new Date(a.date) - new Date(b.date));
  const starts = new Set();
  let bal = 0;
  asc.forEach((e,i) => {
    const isDebt = (e.type === 'debit' || e.type === 'opening');
    if(isDebt && bal <= 0 && i > 0) starts.add(e.id);
    bal += (e.type === 'credit' || e.type === 'discount') ? -(e.amount||0) : (e.amount||0);
  });
  return starts;
}

// رسم حركة واحدة في كشف المحل حسب نوعها
function accEntryHtml(e){
  const amt = (e.amount||0).toLocaleString('en-EG');
  const meta = `<div class="acc-entry-meta">${new Date(e.date).toLocaleString(accLocale())} — ${t('acc.by')} ${esc(e.by||'')}</div>`;
  if(e.type === 'credit'){
    return `<div class="acc-entry" style="background:var(--success-bg);">
      <div><div style="font-weight:700; color:var(--success);">💵 ${t('acc.entryPayment')}${e.note ? ` — ${esc(e.note)}` : ''}</div>${meta}</div>
      <div style="text-align:left;"><div style="font-weight:800; color:var(--success);">− ${amt} ج.م</div>
        ${ACC_CAN_EDIT ? `<button class="acc-mini-btn" style="color:var(--danger);border-color:var(--danger-border);" onclick="deletePayment('${e.id}')">${t('acc.deleteEntry')}</button>` : ''}</div>
    </div>`;
  }
  if(e.type === 'discount'){
    return `<div class="acc-entry" style="background:var(--info-bg);">
      <div><div style="font-weight:700; color:var(--info);">🏷️ ${t('acc.entryDiscount')}${e.note ? ` — ${esc(e.note)}` : ''}</div>${meta}</div>
      <div style="text-align:left;"><div style="font-weight:800; color:var(--info);">− ${amt} ج.م</div>
        ${ACC_CAN_EDIT ? `<button class="acc-mini-btn" style="color:var(--danger);border-color:var(--danger-border);" onclick="deletePayment('${e.id}')">${t('acc.deleteEntry')}</button>` : ''}</div>
    </div>`;
  }
  if(e.type === 'opening'){
    return `<div class="acc-entry" style="background:var(--warn-tint);">
      <div><div style="font-weight:700; color:var(--warn);">🧾 ${t('acc.entryOpening')}</div>${meta}</div>
      <div style="text-align:left;"><div style="font-weight:800; color:var(--warn);">+ ${amt} ج.م</div>
        ${ACC_CAN_EDIT ? `<button class="acc-mini-btn" style="color:var(--danger);border-color:var(--danger-border);" onclick="deletePayment('${e.id}')">${t('acc.deleteEntry')}</button>` : ''}</div>
    </div>`;
  }
  // debit (جهاز آجل)
  return `<div class="acc-entry">
    <div><div style="font-weight:700;">📱 ${esc(e.deviceLabel||'جهاز')}</div>
      <div class="acc-entry-meta">${new Date(e.date).toLocaleString(accLocale())} — ${t('acc.by')} ${esc(e.by||'')}${e.prevShop ? ` — <span style="color:var(--warn);">منقول من حساب "${esc(e.prevShop)}"</span>` : ''}</div></div>
    <div style="text-align:left;"><div style="font-weight:800; color:var(--warn);">+ ${amt} ج.م</div>
      ${ACC_CAN_EDIT ? `<button class="acc-mini-btn" onclick="transferDebit('${e.id}')">⇄ ${t('acc.moveShop')}</button>` : ''}</div>
  </div>`;
}

// رسم كارت محل واحد (أكورديون) بحركاته وفواصل الدورات
function accShopBlockHtml(n, s){
  const balance = s.balance;
  const open = accOpenShop === n;
  const safe = esc(n).replace(/'/g,"\\'");
  const starts = cycleStartIds(s.entries);
  const sortedDesc = s.entries.slice().sort((a,b) => new Date(b.date) - new Date(a.date));
  const cycleDivider = (e) => `<div style="text-align:center; margin:8px 0; color:#0891A8; font-size:12.5px; font-weight:800; border-top:1px dashed #CBD5E1; padding-top:8px;">🔄 ${t('acc.newCycle')} — ${new Date(e.date).toLocaleDateString('ar-EG')}</div>`;
  // ⚠️ في وضع القراءة-فقط الأزرار دي **مش بتترسم أصلاً** — مش
  //    مخفية بـ CSS. يعني حتى لو حد فتح أدوات المطوّر، مفيش زرار
  //    يدوس عليه. وفوق ده الكتابة نفسها مرفوضة من قاعدة البيانات.
  const toolbar = ACC_CAN_EDIT ? `
      <button class="btn-secondary" style="color:#0E7490;border-color:#A5F3FC;" onclick="waShop('${safe}')">💬 ${t('acc.wa')}</button>
      <button class="acc-mini-btn" style="margin-top:0;align-self:center;" onclick="setShopPhone('${safe}')">✎ ${t('acc.phone')}</button>
      <button class="acc-mini-btn" style="margin-top:0;align-self:center;color:var(--info);border-color:var(--info-border);" onclick="addDiscount('${safe}')">🏷️ ${t('acc.discount')}</button>
      <button class="btn-secondary" style="color:#166534;border-color:var(--success-border);" onclick="exportShopExcel('${safe}')">📊 Excel</button>
      <button class="btn-secondary" style="color:var(--danger-strong);border-color:var(--danger-border);" onclick="exportShopPdf('${safe}')">📄 PDF</button>
      <button class="acc-mini-btn" style="margin-top:0;align-self:center;color:var(--danger);border-color:var(--danger-border);" onclick="deleteAccount('${safe}')">🗑 ${t('acc.deleteAccount')}</button>`
    : `<button class="btn-secondary" style="color:var(--danger-strong);border-color:var(--danger-border);" onclick="exportShopPdf('${safe}')">📄 PDF</button>`;

  const entriesHtml = !open ? '' : `
    <div class="acc-toolbar">${toolbar}
    </div>
    <div class="acc-entries">${sortedDesc.map(e => accEntryHtml(e) + (starts.has(e.id) ? cycleDivider(e) : '')).join('')}</div>`;

  return `<div class="acc-shop" data-accshop="${esc(n)}">
    <button class="acc-shop-head" onclick="accOpenShop = accOpenShop==='${safe}' ? null : '${safe}'; renderAccounts();">
      <span style="font-weight:800; font-size:16px;">🏪 ${esc(n)}</span>
      <span class="acc-nums">
        <span>${t('acc.owed')}: <b>${s.owed.toLocaleString('en-EG')}</b></span>
        <span>${t('acc.paidDisc')}: <b style="color:var(--success);">${s.paid.toLocaleString('en-EG')}</b></span>
        <span>${t('acc.remaining')}: <b style="color:${balance > 0 ? 'var(--danger)' : 'var(--success)'};">${balance.toLocaleString('en-EG')}</b> ${t('acc.egp')}</span>
        <span style="color:var(--muted-2);">${open ? '▲' : '▼'}</span>
      </span>
    </button>
    ${entriesHtml}
  </div>`;
}

let accGroupOpen = { open:true, paid:false };
function toggleAccGroup(g){ accGroupOpen[g] = !accGroupOpen[g]; renderAccounts(); }

function renderAccounts(){
  // القايمة دي جزء من نموذج تسجيل الدفعة — مش موجودة في وضع
  // القراءة-فقط، فبنتخطاها بدل ما نقع.
  const _dl = document.getElementById('accShopsList');
  if(_dl) _dl.innerHTML = shopNamesForDatalist();
  const _sb = document.getElementById('accSearch');
  const q = ((_sb && _sb.value) || '').trim();
  const shops = shopStats();
  let names = Object.keys(shops);
  if(q) names = names.filter(n => n.includes(q));

  if(names.length === 0){
    document.getElementById('accountsBody').innerHTML = `<div class="empty-col">${q ? t('acc.noMatch') : t('acc.empty')}</div>`;
    return;
  }

  const openNames = names.filter(n => shops[n].balance > 0).sort((a,b) => shops[b].balance - shops[a].balance);
  const paidNames = names.filter(n => shops[n].balance <= 0).sort((a,b) => a.localeCompare(b,'ar'));
  const totalOpen = openNames.reduce((t,n) => t + shops[n].balance, 0);

  // نحافظ على مكان السكرول وقت أي تحديث
  const _scroller = document.getElementById('accountsOverlay');
  const _y = _scroller ? _scroller.scrollTop : 0;

  // رسم عناصر المجموعة حسب طريقة العرض المختارة — البحث بيتفلتر قبل هنا فبيسري على الأنواع الـ3
  const groupItems = (list) => {
    if(accViewMode === 'grid-small') return `<div class="acc-grid-small">${list.map(n => accShopCardSmall(n, shops[n])).join('')}</div>`;
    if(accViewMode === 'grid-large') return `<div class="acc-grid-large">${list.map(n => accShopCardLarge(n, shops[n])).join('')}</div>`;
    return list.map(n => accShopBlockHtml(n, shops[n])).join('');
  };

  const groupHtml = (title, bg, fg, key, list) => `
    <div style="margin-bottom:14px;">
      <button onclick="toggleAccGroup('${key}')" style="width:100%; display:flex; justify-content:space-between; align-items:center; background:${bg}; color:${fg}; border:none; border-radius:12px; padding:14px 16px; font-family:inherit; font-weight:800; font-size:15px; cursor:pointer;">
        <span>${title} (${list.length})</span><span>${accGroupOpen[key] ? '▲' : '▼'}</span>
      </button>
      ${accGroupOpen[key] ? `<div style="margin-top:10px;">${list.length ? groupItems(list) : `<div class="empty-col">${t('acc.none')}</div>`}</div>` : ''}
    </div>`;

  document.getElementById('accountsBody').innerHTML = `
    <div style="background:var(--danger-bg); border:1px solid var(--danger-border); border-radius:12px; padding:12px 16px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
      <span style="font-weight:800; color:#991B1B;">${t('acc.totalOpen')}</span>
      <span style="font-weight:900; font-size:18px; color:var(--danger);">${totalOpen.toLocaleString('en-EG')} ${t('acc.egp')}</span>
    </div>
    ${groupHtml('📂 ' + t('acc.groupOpen'), 'var(--danger-bg)', '#991B1B', 'open', openNames)}
    ${groupHtml('✅ ' + t('acc.groupPaid'), 'var(--success-bg)', '#166534', 'paid', paidNames)}
  `;
  if(_scroller) _scroller.scrollTop = _y;
}

// ============================================================
// طريقة عرض الحسابات: قائمة تفصيلية / مربعات صغيرة / مربعات كبيرة
// التفضيل بيتحفظ لكل جهاز في localStorage — إضافي بالكامل، مش بيمس بيانات أو سكيمة
// ============================================================
const ACC_VIEW_KEY = 'store_accounts_view_mode';
const ACC_VIEW_MODES = ['list', 'grid-small', 'grid-large'];
let accViewMode = (function(){
  try{ const v = localStorage.getItem(ACC_VIEW_KEY); return ACC_VIEW_MODES.includes(v) ? v : 'list'; }
  catch(e){ return 'list'; }
})();

// تلوين الزر الفعّال في المبدّل حسب الوضع الحالي
function syncAccViewButtons(){
  document.querySelectorAll('#accViewBar .acc-viewbtn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-mode') === accViewMode);
  });
}

// تغيير الوضع من أزرار المبدّل — بيحفظ التفضيل ويعيد الرسم
function setAccViewMode(mode){
  if(!ACC_VIEW_MODES.includes(mode)) mode = 'list';
  accViewMode = mode;
  try{ localStorage.setItem(ACC_VIEW_KEY, mode); }catch(e){}
  syncAccViewButtons();
  renderAccounts();
}

// فتح كشف المحل بالكامل من كارت (صغير/كبير): بيعرض القائمة ويفتح الأكورديون ويمرّر ليه
// ملحوظة: بيحوّل العرض لقائمة وقتياً بس من غير ما يغيّر التفضيل المحفوظ
function openShopFromCard(name){
  accOpenShop = name;
  accGroupOpen.open = true;
  accGroupOpen.paid = true;   // نتأكد إن المجموعة اللي فيها المحل مفتوحة
  accViewMode = 'list';
  syncAccViewButtons();
  renderAccounts();
  requestAnimationFrame(() => {
    const el = Array.from(document.querySelectorAll('#accountsBody [data-accshop]'))
      .find(x => x.getAttribute('data-accshop') === name);
    if(el && el.scrollIntoView) el.scrollIntoView({ behavior:'smooth', block:'start' });
  });
}

// كارت صغير: اسم المحل + المتبقّي بارز — للمسح البصري السريع
function accShopCardSmall(n, s){
  const balance = s.balance;
  const safe = esc(n).replace(/'/g,"\\'");
  const balColor = balance > 0 ? 'var(--danger)' : 'var(--success)';
  return `<button type="button" class="acc-card acc-card-sm" data-accshop="${esc(n)}" onclick="openShopFromCard('${safe}')">
    <span class="acc-card-name">🏪 ${esc(n)}</span>
    <span class="acc-card-bal" style="color:${balColor};">${balance.toLocaleString('en-EG')}<small> ${t('acc.egp')}</small></span>
  </button>`;
}

// كارت كبير: رأس (اسم + طباعة كشف) وجسم (عليه / مدفوع-خصم / المتبقّي كشارة)
function accShopCardLarge(n, s){
  const balance = s.balance;
  const safe = esc(n).replace(/'/g,"\\'");
  const balColor = balance > 0 ? 'var(--danger)' : 'var(--success)';
  const balBg = balance > 0 ? 'var(--danger-bg)' : 'var(--success-bg)';
  return `<div class="acc-card acc-card-lg" data-accshop="${esc(n)}">
    <div class="acc-card-lg-head">
      <button type="button" class="acc-card-open" onclick="openShopFromCard('${safe}')"><span>🏪 ${esc(n)}</span></button>
      <button type="button" class="acc-card-print" title="${t('acc.printPdf')}" onclick="event.stopPropagation(); exportShopPdf('${safe}')">🖨️</button>
    </div>
    <div class="acc-card-lg-body" onclick="openShopFromCard('${safe}')">
      <div class="acc-card-row"><span>${t('acc.owed')}</span><b>${s.owed.toLocaleString('en-EG')}</b></div>
      <div class="acc-card-row"><span>${t('acc.paidDisc')}</span><b style="color:var(--success);">${s.paid.toLocaleString('en-EG')}</b></div>
      <div class="acc-card-bal-badge" style="background:${balBg}; color:${balColor};">
        <span>${t('acc.remaining')}</span><b>${balance.toLocaleString('en-EG')} ${t('acc.egp')}</b>
      </div>
    </div>
  </div>`;
}

// نوع الحركة يزوّد الرصيد (جهاز آجل/رصيد افتتاحي) ولا ينقّصه (دفعة/خصم)
function isDebitLike(e){ return e.type === 'debit' || e.type === 'opening'; }
// وصف الحركة نص عادي (للإكسيل)
function stmtDesc(e){
  if(e.type==='opening') return 'رصيد افتتاحي سابق';
  if(e.type==='discount') return 'خصم' + (e.note ? ' — ' + e.note : '');
  if(e.type==='credit') return 'دفعة' + (e.note ? ' — ' + e.note : '');
  return (e.kind==='return' ? 'مرتجع — ' : '') + 'جهاز: ' + (e.deviceLabel||'') + (e.prevShop ? ` (منقول من حساب ${e.prevShop})` : '');
}
// وصف الحركة بأيقونات (للـ PDF)
function stmtDescHtml(e){
  if(e.type==='opening') return '🧾 رصيد افتتاحي سابق';
  if(e.type==='discount') return '🏷️ خصم' + (e.note ? ' — ' + esc(e.note) : '');
  if(e.type==='credit') return '💵 دفعة' + (e.note ? ' — ' + esc(e.note) : '');
  return `${e.kind==='return' ? '🔁 ' : ''}📱 ${esc(e.deviceLabel||'جهاز')}${e.kind==='return' ? ` <small style="color:var(--violet);font-weight:800;">(مرتجع)</small>` : ''}` + (e.prevShop ? `<br><small style="color:var(--warn);">منقول من حساب "${esc(e.prevShop)}"</small>` : '');
}

// عطل الجهاز في كشف الحساب.
// القيود الجديدة بتحفظه جواها. القديمة بنجيبه من الجهاز نفسه.
// الحركات اللي مش أجهزة (دفعة/خصم/رصيد افتتاحي) مالهاش عطل.
// ============================================================
// تاريخ السطر في كشف حساب المحل
// ------------------------------------------------------------
// ⚠️ e.date هو لحظة إنشاء القيد في الدفتر — مش تاريخ تسليم الجهاز:
//       date: new Date().toISOString()   في addLedgerDebit
//
// الاتنين بيتساووا بس لو المحاسب حدد "آجل" وقت التسليم بالظبط.
// لو حدده بعدين، أو سعّر الجهاز بعدين، أو ظبّط دفعة قديمة النهاردة —
// القيد بياخد تاريخ النهاردة. فكشف فيه عشرين جهاز اتسلّموا الشهر
// اللي فات كان بيطلع كلهم بتاريخ واحد: يوم ما فتحت الكشف.
//
// والمحل عايز يعرف "الجهاز ده رجعلي إمتى"، مش إمتى المحاسب سجّل القيد.
//
// القيود اللي مش مربوطة بجهاز (دفعة · رصيد افتتاحي · خصم) بتفضل
// على تاريخ القيد — وده صح ليها: ده فعلاً يوم ما حصلت.
// ============================================================
function stmtDate(e){
  if(e && e.deviceId){
    const dev = accDevices().find(x => x.id === e.deviceId);
    // deliveredDateOf موجودة في الداشبورد بس — من غيرها بنرجع
    // لتاريخ القيد، وده أسوأ حاجة ممكن تحصل: تاريخ أقل دقة،
    // مش صفحة واقعة.
    const dd = (dev && typeof deliveredDateOf === 'function') ? deliveredDateOf(dev) : null;
    if(dd) return dd;
  }
  return e && e.date;
}

function stmtIssue(e){
  if(e.type !== 'debit') return '';
  if(e.issue) return e.issue;
  const d = accDevices().find(x => x.id === e.deviceId);
  if(e.kind === 'return') return (d && (d.discoveredFault || d.returnComplaint)) ? String(d.discoveredFault || d.returnComplaint).trim() : '';
  return (d && d.reportedIssue) ? String(d.reportedIssue).trim() : '';
}

function shopStatementRows(shop){
  // الترتيب بنفس التاريخ اللي بيتعرض — وإلا السطور تطلع مبعثرة
  // قدام المحل. مفيش عمود رصيد جاري، فالترتيب عرض بحت.
  const entries = ledger.filter(e => (e.shop||'بدون محل') === shop)
    .slice().sort((a,b) => new Date(stmtDate(a)) - new Date(stmtDate(b)));
  const debit = entries.filter(e=>e.type==='debit'||e.type==='opening').reduce((t,e)=>t+(e.amount||0),0);
  const credit = entries.filter(e=>e.type==='credit'||e.type==='discount').reduce((t,e)=>t+(e.amount||0),0);
  return { entries, debit, credit, balance: debit - credit };
}


// ============================================================
// الطباعة — من جوه الصفحة، مش في تاب جديد
// ------------------------------------------------------------
// ⚠️ الطريقة القديمة كانت window.open('','_blank') وبعدين
//    document.write. ودي بتفتح **صفحة جديدة**، ولما التطبيق
//    مثبّت على الأيفون (standalone) مفيش زرار رجوع أصلاً —
//    فالمستخدم بيتحبس ومضطر يقفل التطبيق ويفتحه تاني.
//
//    دلوقتي بنرسم الكشف في إطار مخفي (iframe) جوه نفس الصفحة
//    وبنطبع منه. الصفحة **ما بتتحركش من مكانها خالص** — فحتى
//    لو نافذة الطباعة اتقفلت أو فشلت، المستخدم لسه في مكانه.
// ============================================================
function accPrint(html, title){
  // إطار قديم من طباعة سابقة؟ نشيله عشان ما يتكدّسوش
  const old = document.getElementById('accPrintFrame');
  if(old) old.remove();

  const f = document.createElement('iframe');
  f.id = 'accPrintFrame';
  f.setAttribute('aria-hidden', 'true');
  f.title = title || 'print';
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;';
  document.body.appendChild(f);

  const go = () => {
    try{
      f.contentWindow.focus();
      f.contentWindow.print();
    }catch(e){
      console.error('الطباعة فشلت:', e);
      alert('مقدرناش نفتح نافذة الطباعة. جرّب تاني.');
    }
  };

  try{
    const d = f.contentWindow.document;
    d.open(); d.write(html); d.close();
    // 500 مللي عشان الخطوط تنزّل الأول — من غيرها الكشف بيطلع
    // بخط النظام الافتراضي
    setTimeout(go, 500);
  }catch(e){
    console.error('تجهيز الطباعة فشل:', e);
    f.remove();
    alert('مقدرناش نجهّز الكشف للطباعة.');
  }
}

function exportShopPdf(shop){
  const { entries, debit, credit, balance } = shopStatementRows(shop);
  const rowsHtml = entries.map((e,i) => {
    const issue = stmtIssue(e);
    return `
    <tr style="background:${i%2 ? '#F8FAFC' : '#FFFFFF'};">
      <td>${new Date(stmtDate(e)).toLocaleString('ar-EG')}</td>
      <td style="text-align:right;">${stmtDescHtml(e)}</td>
      <td style="text-align:right; color:#475569;">${issue ? esc(issue) : '—'}</td>
      <td style="color:#B45309; font-weight:800;">${isDebitLike(e) ? (e.amount||0).toLocaleString('en-EG') : '—'}</td>
      <td style="color:#16A34A; font-weight:800;">${!isDebitLike(e) ? (e.amount||0).toLocaleString('en-EG') : '—'}</td>
    </tr>`;
  }).join('');

  accPrint(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
  <title>كشف حساب — ${esc(shop)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    body{font-family:'Tajawal',sans-serif; color:#1A2332; margin:0; padding:28px;}
    .head{background:linear-gradient(135deg,#E8321E,#C22513); color:#fff; border-radius:14px; padding:22px 26px; display:flex; justify-content:space-between; align-items:center;}
    .head h1{font-family:'Cairo',sans-serif; font-size:26px; margin:0;}
    .head .sub{font-size:13px; opacity:.9; margin-top:4px;}
    .head .brand{font-family:'Cairo',sans-serif; font-weight:900; font-size:18px; text-align:left;}
    .totals{display:flex; gap:14px; margin:18px 0;}
    .tcard{flex:1; border-radius:12px; padding:14px 18px; color:#fff;}
    .tcard .lbl{font-size:13px; opacity:.92;}
    .tcard .num{font-family:'Cairo',sans-serif; font-size:26px; font-weight:900; margin-top:2px;}
    table{width:100%; border-collapse:collapse; font-size:13.5px;}
    th{background:#101014; color:#fff; padding:11px 8px; font-size:13px;}
    td{padding:10px 8px; border-bottom:1px solid #E5E7EB; text-align:center;}
    .foot{margin-top:18px; font-size:12px; color:#6B7280; display:flex; justify-content:space-between;}
    /* الجدول بقى خمسة أعمدة — الأفقي بيدي مساحة أريح للعطل */
    @page{ size:A4 landscape; margin:10mm; }
    @media print{ body{padding:12px;} }
  </style></head><body>
    <div class="head">
      <div><h1>كشف حساب: ${esc(shop)}</h1><div class="sub">تاريخ الكشف: ${new Date().toLocaleDateString('ar-EG')} — ${new Date().toLocaleTimeString('ar-EG')}</div></div>
      <div class="brand">I FIX TEAM<br><small style="font-weight:400;font-size:11px;">FOR MOBILE SERVICES</small></div>
    </div>
    <div class="totals">
      <div class="tcard" style="background:#B45309;"><div class="lbl">إجمالي الآجل (عليه)</div><div class="num">${debit.toLocaleString('en-EG')} ج.م</div></div>
      <div class="tcard" style="background:#16A34A;"><div class="lbl">إجمالي المدفوع (له)</div><div class="num">${credit.toLocaleString('en-EG')} ج.م</div></div>
      <div class="tcard" style="background:${balance>0 ? '#DC2626' : '#2563EB'};"><div class="lbl">المتبقي على المحل</div><div class="num">${balance.toLocaleString('en-EG')} ج.م</div></div>
    </div>
    <table>
      <tr><th style="width:20%;">تاريخ التسليم</th><th style="width:32%;">البيان</th><th style="width:24%;">العطل</th><th>عليه (آجل)</th><th>له (دفعات)</th></tr>
      ${rowsHtml || '<tr><td colspan="5">مفيش حركات متسجلة</td></tr>'}
    </table>
    <div class="foot"><span>نظام I Fix Team لإدارة الصيانة</span><span>عدد الحركات: ${entries.length}</span></div>
  </body></html>`, 'كشف حساب — ' + shop);
}
