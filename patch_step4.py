#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
# I Fix Team — Part 4 / الخطوة ٤: بوابة الفني "أجهزتي"
# باتش بيتأكد من كل تعديل (count == expected) قبل الاستبدال.
# ============================================================
import sys
DASH='dashboard.html'; I18N='i18n.js'
done=[]
def patch(path, old, new, expected=1, label=''):
    txt=open(path,encoding='utf-8').read()
    n=txt.count(old)
    if n!=expected:
        print(f"❌ [{label}] توقّع {expected}، لقى {n}. وقفت من غير تعديل على {path}.")
        print("   anchor: "+old[:110].replace('\n','\\n')); sys.exit(1)
    open(path,'w',encoding='utf-8').write(txt.replace(old,new))
    done.append(f"✅ [{label}] {path}")

# ============================================================
# (١) CSS — بوابة الفني + بوابات القوائم المالية/الفني
# ============================================================
patch(DASH,
"  .pending-appr-banner{font-size:13.5px; font-weight:800; color:#92400E; background:#FEF3C7; border:1px solid #FCD34D; border-radius:10px; padding:11px 13px; margin:0 0 12px; line-height:1.7;}",
"""  .pending-appr-banner{font-size:13.5px; font-weight:800; color:#92400E; background:#FEF3C7; border:1px solid #FCD34D; border-radius:10px; padding:11px 13px; margin:0 0 12px; line-height:1.7;}
  /* ===== بوابة الفني "أجهزتي" (الخطوة ٤) ===== */
  .tp-section{margin-bottom:18px;}
  .tp-section-head{font-family:'Cairo',sans-serif; font-weight:900; font-size:15px; color:var(--ink); margin:6px 2px 12px; display:flex; align-items:center; gap:8px;}
  .tp-section-head .tp-count{background:#EEF2F7; color:#475569; font-family:'Tajawal',sans-serif; font-weight:800; font-size:12px; border-radius:11px; padding:2px 9px;}
  .tp-grid{display:grid; grid-template-columns:repeat(auto-fill, minmax(240px,1fr)); gap:12px;}
  .tp-card{background:#fff; border:1px solid #EEF0F3; border-radius:14px; padding:14px; box-shadow:0 2px 8px rgba(16,16,20,.04); cursor:pointer; transition:transform .12s, box-shadow .12s; text-align:right;}
  .tp-card:hover{transform:translateY(-2px); box-shadow:0 8px 20px rgba(16,16,20,.10);}
  .tp-card-title{font-weight:800; font-size:15px; color:var(--ink); line-height:1.4;}
  .tp-card-sub{font-size:13px; color:#64748B; margin-top:3px;}
  .tp-card-issue{font-size:12.5px; color:#475569; background:#F8FAFC; border:1px solid #EEF0F3; border-radius:8px; padding:6px 9px; margin-top:8px; line-height:1.6;}
  .tp-status-tag{display:inline-block; margin-top:8px;}
  .tp-actions{display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;}
  .tp-btn{border:none; border-radius:9px; padding:9px 12px; font-family:'Tajawal',sans-serif; font-weight:800; font-size:13px; cursor:pointer; transition:filter .12s;}
  .tp-btn:hover{filter:brightness(.96);}
  .tp-work{background:var(--repairing-bg); color:var(--repairing);}
  .tp-done{background:var(--done-bg); color:var(--done);}
  .tp-problem{background:#FEF3C7; color:#B45309;}
  /* إخفاء بنود القوائم المالية عن اللي مش بيشوف فلوس (فني/مسؤول حركة) */
  .no-money .money-menu-item{display:none !important;}
  /* بند "أجهزتي" للفني بس */
  body:not(.role-technician) .tech-only-menu{display:none !important;}""",
1, "CSS: tech portal + menu gating")

# ============================================================
# (٢) المنيو — بند "أجهزتي" + كلاس مالي على (الملخص المالي / الحسابات)
# ============================================================
patch(DASH,
"""    <div id="menuDropdown" class="menu-dropdown hidden">
    <button data-i18n="menu.analytics" onclick="openAnalytics()">الملخص المالي</button>
    <button data-i18n="menu.techEval" onclick="openTechEval()">تقييم الفنيين</button>
    <button data-i18n="menu.inventory" onclick="openSummaries()">الجرد</button>
    <button data-i18n="menu.accounts" onclick="openAccounts()">الحسابات</button>
    <button data-i18n="menu.logout" onclick="logout()" style="color:#DC2626;">تسجيل الخروج</button>
    </div>""",
"""    <div id="menuDropdown" class="menu-dropdown hidden">
    <button class="tech-only-menu" data-i18n="menu.myDevices" onclick="openTechPortal()">📱 أجهزتي</button>
    <button class="money-menu-item" data-i18n="menu.analytics" onclick="openAnalytics()">الملخص المالي</button>
    <button data-i18n="menu.techEval" onclick="openTechEval()">تقييم الفنيين</button>
    <button data-i18n="menu.inventory" onclick="openSummaries()">الجرد</button>
    <button class="money-menu-item" data-i18n="menu.accounts" onclick="openAccounts()">الحسابات</button>
    <button data-i18n="menu.logout" onclick="logout()" style="color:#DC2626;">تسجيل الخروج</button>
    </div>""",
1, "menu: myDevices + money classes")

# ============================================================
# (٣) نافذة بوابة الفني (HTML) — بعد نافذة التفاصيل
# ============================================================
patch(DASH,
"""<!-- Detail modal -->
<div id="detailOverlay" class="overlay hidden">
  <div class="modal" id="detailModal"></div>
</div>""",
"""<!-- Detail modal -->
<div id="detailOverlay" class="overlay hidden">
  <div class="modal" id="detailModal"></div>
</div>

<!-- Technician portal (أجهزتي) -->
<div id="techPortalOverlay" class="overlay hidden" style="align-items:stretch; justify-content:stretch; padding:0; overflow-y:auto;">
  <div class="summaries-page">
    <div class="modal-head" style="padding:16px 20px;">
      <h2 id="techPortalTitle" data-i18n="tp.title">📱 أجهزتي</h2>
      <button class="close-btn" onclick="closeTechPortal()">×</button>
    </div>
    <div style="padding:0 20px;">
      <div class="modal-search"><input id="techSearch" oninput="renderTechPortal()" data-i18n-ph="tp.searchPh" placeholder="ابحث في الأجهزة..." /></div>
    </div>
    <div id="techPortalBody" style="padding:12px 20px 40px;"></div>
  </div>
</div>""",
1, "HTML: techPortalOverlay")

# ============================================================
# (٤) دوال بوابة الفني — قبل renderEmployeeView
# ============================================================
patch(DASH,
"function renderEmployeeView(query){",
"""// ============================================================
// بوابة الفني "أجهزتي" (الخطوة ٤)
// بتعرض أجهزة الفني المسنّدة له + أجهزة بيشارك فيها كمساعد — من غير أي فلوس نهائياً.
// بتفتح للفني تلقائياً، وأي مدير يقدر يفتح بوابة فني معيّن من صفحة التقييم.
// الربط: myTechName() (أو اسم ممرّر) ↔ حقل technician / assistTechnician على الجهاز.
// ============================================================
let techPortalName = '';           // اسم الفني اللي البوابة مفتوحة عليه
let techPortalAutoOpened = false;  // فتح تلقائي مرة واحدة بس

// الحالات "النشطة" في البوابة: كل حاجة قبل التسليم/الرفض + المرتجع (محتاج شغل تاني)
const TP_ACTIVE = ['waiting','diagnosing','repairing','done','returned'];

function openTechPortal(name){
  const dd = document.getElementById('menuDropdown'); if(dd) dd.classList.add('hidden');
  techPortalName = (name || myTechName() || '').trim();
  clearSearchBox('techSearch');
  renderTechPortal();
  document.getElementById('techPortalOverlay').classList.remove('hidden');
}
function closeTechPortal(){ document.getElementById('techPortalOverlay').classList.add('hidden'); }

// كارت جهاز في البوابة — من غير أي سعر/فلوس. canAct = يظهر أزرار تغيير الحالة
function techCardHtml(d, canAct){
  const s = statusInfo(d.status);
  const badge = d.status === 'returned'
    ? `<span class="status-tag tp-status-tag" style="background:#FEE2E2;color:#DC2626;font-weight:800;">🔁 ${t('ui.returnedBadge')}</span>`
    : `<span class="status-tag tp-status-tag" style="background:${accentBg(s.varname)};color:${accent(s.varname)}">${esc(fullStatusLabel(d))}</span>`;
  const lock = (d.lockType==='text' && d.lockText)
    ? `<div style="margin-top:6px;font-size:12.5px;">🔒 <span style="font-family:monospace;font-weight:800;">${esc(d.lockText)}</span></div>`
    : ((d.lockType==='pattern'||d.lockType==='image') && d.lockImage)
      ? `<div style="margin-top:6px;display:flex;align-items:center;gap:6px;"><span style="font-size:12.5px;">🔒</span><img src="${d.lockImage}" style="width:40px;height:40px;border-radius:6px;border:1px solid #E2E8F0;object-fit:cover;"></div>`
      : '';
  const actions = !canAct ? '' : `<div class="tp-actions">
    ${d.status!=='repairing' ? `<button class="tp-btn tp-work" onclick="event.stopPropagation(); techSetStatus('${d.id}','repairing')">🔧 ${t('tp.working')}</button>` : ''}
    ${d.status!=='done' ? `<button class="tp-btn tp-done" onclick="event.stopPropagation(); techSetStatus('${d.id}','done')">✅ ${t('tp.fixed')}</button>` : ''}
    <button class="tp-btn tp-problem" onclick="event.stopPropagation(); techReportProblem('${d.id}')">⚠️ ${t('tp.problem')}</button>
  </div>`;
  return `<div class="tp-card" onclick="openDetail('${d.id}')">
    <div class="tp-card-title">📱 ${esc(d.deviceType)} ${esc(d.model)}</div>
    <div class="tp-card-sub">${d.shopName ? esc(d.shopName)+' — ' : ''}${esc(d.customerName)}</div>
    ${d.reportedIssue ? `<div class="tp-card-issue">🛠️ ${esc(d.reportedIssue)}</div>` : ''}
    ${badge}
    ${pendingApprovalText(d) ? `<div class="pending-appr-chip">⏳ ${pendingApprovalText(d)}</div>` : ''}
    ${lock}
    ${actions}
  </div>`;
}

function renderTechPortal(){
  const name = techPortalName;
  const titleEl = document.getElementById('techPortalTitle');
  if(titleEl){
    const own = !!(name && myTechName() && name === myTechName().trim());
    titleEl.textContent = (own || !name) ? t('tp.title') : t('tp.titleOf', { name });
  }
  const body = document.getElementById('techPortalBody');
  if(!body) return;
  if(!name){ body.innerHTML = `<div class="empty-col">${t('tp.noName')}</div>`; return; }

  const q = (document.getElementById('techSearch')?.value || '').trim();
  const sMatch = (d) => !q || matchesSearch(d, q);
  const mine   = devices.filter(d => d.technician && d.technician.includes(name) && TP_ACTIVE.includes(d.status) && sMatch(d));
  const assist = devices.filter(d => d.assistTechnician && d.assistTechnician.includes(name) && TP_ACTIVE.includes(d.status) && sMatch(d));

  const mineHtml = mine.length
    ? `<div class="tp-grid">${mine.map(d => techCardHtml(d, true)).join('')}</div>`
    : `<div class="empty-col">${q ? t('tp.noMatch') : t('tp.empty')}</div>`;
  // قسم المساعدة: عرض فقط — الفني الأساسي هو اللي بيحرّك الحالة
  const assistHtml = assist.length
    ? `<div class="tp-grid">${assist.map(d => techCardHtml(d, false)).join('')}</div>`
    : `<div class="empty-col">${q ? t('tp.noMatch') : t('tp.emptyAssist')}</div>`;

  body.innerHTML = `
    <div class="tp-section">
      <div class="tp-section-head">🔧 ${t('tp.sectionMine')} <span class="tp-count">${mine.length}</span></div>
      ${mineHtml}
    </div>
    <div class="tp-section">
      <div class="tp-section-head">🤝 ${t('tp.sectionAssist')} <span class="tp-count">${assist.length}</span></div>
      ${assistHtml}
    </div>`;
}

// تغيير حالة سريع من البوابة — بيستخدم نفس منطق changeStatus (مصدر واحد للانتقالات)
async function techSetStatus(deviceId, newStatus){
  const d = devices.find(x => x.id === deviceId);
  if(!d || d.status === newStatus) return;
  const prevSel = selectedId;
  selectedId = deviceId;
  await changeStatus(newStatus);
  selectedId = prevSel;
  renderTechPortal();
}

// "واجهتني مشكلة" — بيسجّل ملاحظة في سجل نشاط الجهاز من غير ما يغيّر الحالة
async function techReportProblem(deviceId){
  const d = devices.find(x => x.id === deviceId);
  if(!d) return;
  const desc = (prompt(t('tp.problemPrompt')) || '').trim();
  if(!desc) return;
  const note = { text: '⚠️ ' + t('tp.problemNote') + ': ' + desc, at: new Date().toISOString(), by: currentUser.name, role: currentRoleLabel() };
  devices = devices.map(x => x.id === deviceId
    ? { ...x, activityNotes:[...(x.activityNotes||[]), note], lastModifiedAt:new Date().toISOString(), lastModifiedBy: currentUser.name }
    : x);
  renderTechPortal();
  render();
  await persist();
}

function renderEmployeeView(query){""",
1, "JS: tech portal functions")

# ============================================================
# (٥) تحديث البوابة لحظياً لو مفتوحة (زي الجرد)
# ============================================================
patch(DASH,
"""function refreshOpenOverlays(){
  const el = document.getElementById('summariesOverlay');
  if(el && !el.classList.contains('hidden')) renderSummaries();
}""",
"""function refreshOpenOverlays(){
  const el = document.getElementById('summariesOverlay');
  if(el && !el.classList.contains('hidden')) renderSummaries();
  const tp = document.getElementById('techPortalOverlay');
  if(tp && !tp.classList.contains('hidden')) renderTechPortal();
}""",
1, "refreshOpenOverlays: keep portal fresh")

# ============================================================
# (٦) فتح البوابة تلقائياً للفني (واجهته المستقلة) — مرة واحدة
# ============================================================
patch(DASH,
"  injectAdminMenu();   // نعيد الفحص بعد ما الأدوار تتحمّل\n}",
"""  injectAdminMenu();   // نعيد الفحص بعد ما الأدوار تتحمّل
  // الفني: نفتحله بوابة "أجهزتي" تلقائياً كواجهته الأساسية (مرة واحدة بس، ويقدر يقفلها)
  if(!techPortalAutoOpened && isTechnician()){ techPortalAutoOpened = true; openTechPortal(); }
}""",
1, "applyRoleVisibility: auto-open for technician")

# ============================================================
# (٧) نقطة ٣ — زر 📱 جنب اسم الفني في صفحة التقييم يفتح بوابته
# ============================================================
patch(DASH,
"""            <td style="font-weight:800;">🔧 ${esc(r.t)} <span style="color:#94A3B8;font-weight:500;">${teOpenTech === r.t ? '▲' : '▼'}</span></td>""",
"""            <td style="font-weight:800;">🔧 ${esc(r.t)} <span style="color:#94A3B8;font-weight:500;">${teOpenTech === r.t ? '▲' : '▼'}</span>
              <button onclick="event.stopPropagation(); openTechPortal('${esc(r.t).replace(/'/g,"\\\\'")}')" title="${t('tp.openTech')}" style="margin-inline-start:6px;border:1px solid #DDD6FE;background:#F5F3FF;color:#7C3AED;border-radius:7px;padding:3px 8px;font-size:12px;cursor:pointer;">📱</button></td>""",
1, "techEval: open portal by name")

# ============================================================
# (٨) مفاتيح الترجمة — عربي + إنجليزي (بعد appr.alreadyPending)
# ============================================================
patch(I18N,
"      'appr.alreadyPending':'فيه طلب معلّق على الجهاز ده بالفعل — استنى الاعتماد',",
"""      'appr.alreadyPending':'فيه طلب معلّق على الجهاز ده بالفعل — استنى الاعتماد',
      'menu.myDevices': 'أجهزتي',
      'tp.title': '📱 أجهزتي',
      'tp.titleOf': '📱 أجهزة {name}',
      'tp.searchPh': 'ابحث في الأجهزة...',
      'tp.sectionMine': 'الأجهزة المسنّدة',
      'tp.sectionAssist': 'أجهزة أشارك في صيانتها',
      'tp.working': 'جاري العمل',
      'tp.fixed': 'تم الإصلاح',
      'tp.problem': 'واجهتني مشكلة',
      'tp.problemPrompt': 'اكتب المشكلة اللي واجهتك:',
      'tp.problemNote': 'الفني بلّغ عن مشكلة',
      'tp.empty': 'مفيش أجهزة مسنّدة ليك حالياً',
      'tp.emptyAssist': 'مفيش أجهزة بتشارك في صيانتها',
      'tp.noMatch': 'مفيش نتيجة للبحث',
      'tp.noName': 'الحساب ده مش مربوط باسم فني — كلّم الإدارة',
      'tp.openTech': 'افتح أجهزة الفني',""",
1, "i18n(ar): tp.* + menu.myDevices")

patch(I18N,
'''      'appr.alreadyPending':'This device already has a pending request — wait for approval',''',
'''      'appr.alreadyPending':'This device already has a pending request — wait for approval',
      'menu.myDevices': 'My Devices',
      'tp.title': '📱 My Devices',
      'tp.titleOf': "📱 {name}'s Devices",
      'tp.searchPh': 'Search devices...',
      'tp.sectionMine': 'Assigned devices',
      'tp.sectionAssist': 'Devices I assist with',
      'tp.working': 'Working',
      'tp.fixed': 'Fixed',
      'tp.problem': 'I hit a problem',
      'tp.problemPrompt': 'Describe the problem you hit:',
      'tp.problemNote': 'Technician reported a problem',
      'tp.empty': 'No devices assigned to you right now',
      'tp.emptyAssist': "You're not assisting on any devices",
      'tp.noMatch': 'No results',
      'tp.noName': 'This account is not linked to a technician name — contact admin',
      'tp.openTech': "Open technician's devices",''',
1, "i18n(en): tp.* + menu.myDevices")

print('\n'.join(done))
print(f"\n✅ تمّت {len(done)} تعديلات بنجاح.")
