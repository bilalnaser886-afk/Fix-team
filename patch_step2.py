#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
# I Fix Team — Part 4 / الخطوة ٢: سير موافقة مسؤول الحركة
# باتش بيتأكد من كل تعديل (count == expected) قبل الاستبدال.
# ما بيعيدش كتابة الملف — بيعدّل نقاط محددة بس، ويقف بصوت عالي لو أي anchor مش مظبوط.
# ============================================================
import sys

DASH = 'dashboard.html'
I18N = 'i18n.js'

edits_done = []

def patch(path, old, new, expected=1, label=''):
    txt = open(path, encoding='utf-8').read()
    n = txt.count(old)
    if n != expected:
        print(f"❌ [{label}] توقّع {expected} تطابق للـ anchor، لقى {n}. وقفت من غير أي تعديل على {path}.")
        print("   anchor:\n   " + old[:120].replace('\n','\\n'))
        sys.exit(1)
    open(path, 'w', encoding='utf-8').write(txt.replace(old, new))
    edits_done.append(f"✅ [{label}] {path}")

# ============================================================
# (١) CSS — إخفاء الفلوس فعلياً + استايل شارة/بانر الانتظار
#     ملحوظة: كلاس no-money كان بيتحط على body من غير أي قاعدة CSS، فإخفاء
#     الأسعار كان مش شغّال. القواعد دي بتفعّله.
# ============================================================
patch(DASH,
"  .card-price{margin-top:6px; font-size:12px; font-family:monospace; color:var(--accent); font-weight:700;}",
"""  .card-price{margin-top:6px; font-size:12px; font-family:monospace; color:var(--accent); font-weight:700;}
  /* إخفاء الأسعار عن الأدوار اللي مش بتشوف فلوس (مسؤول الحركة / الفني) — بيتفعّل بكلاس no-money على body */
  .no-money .card-price{display:none !important;}
  .no-money .money-only{display:none !important;}
  /* شارة "بانتظار الموافقة" على الكروت + بانر في التفاصيل */
  .pending-appr-chip{margin-top:6px; font-size:11.5px; font-weight:800; color:#B45309; background:#FEF3C7; border:1px solid #FDE68A; border-radius:7px; padding:4px 8px; display:inline-block; line-height:1.5;}
  .pending-appr-banner{font-size:13.5px; font-weight:800; color:#92400E; background:#FEF3C7; border:1px solid #FCD34D; border-radius:10px; padding:11px 13px; margin:0 0 12px; line-height:1.7;}""",
1, "CSS: no-money + pending badge")

# ============================================================
# (٢) الدوال الجديدة + ثابت الحالات — قبل changeStatus مباشرة
# ============================================================
patch(DASH,
"async function changeStatus(newStatus, paymentChoice){\n  const d = devices.find(x => x.id === selectedId);\n  if(!d) return;\n",
"""// ============================================================
// سير موافقة مسؤول الحركة على التسليم والإرجاع (الخطوة ٢)
// مسؤول الحركة بيطلب، والتغيير ما يتنفذش لحد ما المحاسب/الإدارة يوافقوا
// (قسم الاعتمادات — الخطوة ٣ اللي جاية).
// ============================================================
// التغييرات اللي محتاجة موافقة لو اللي عملها مسؤول حركة
const APPROVAL_STATUSES = ['delivered', 'returned'];

// نص شارة "بانتظار الموافقة" حسب نوع الطلب (فاضي لو مفيش طلب معلّق)
function pendingApprovalText(d){
  if(!d || !d.pendingApproval || d.pendingApproval.status !== 'pending') return '';
  return d.pendingApproval.type === 'return' ? t('appr.badgeReturn') : t('appr.badgeHandover');
}

// تسجيل طلب اعتماد معلّق على الجهاز بدل تنفيذ التغيير على طول
async function requestApproval(type, newStatus, paymentChoice){
  const d = devices.find(x => x.id === selectedId);
  if(!d) return;
  // ممنوع أكتر من طلب معلّق على نفس الجهاز في نفس الوقت
  if(d.pendingApproval && d.pendingApproval.status === 'pending'){
    showError(t('appr.alreadyPending'));
    renderDetail();
    return;
  }
  const req = {
    id: 'apr_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    type,                                                 // 'handover' | 'return'
    requestedBy: currentUser.name,
    requestedByEmail: currentUser.email || '',
    requestedAt: new Date().toISOString(),
    payload: { status: newStatus, paymentChoice: paymentChoice || null },   // التغيير المطلوب
    status: 'pending',                                    // pending | approved | rejected
    decidedBy: null, decidedAt: null, reason: null
  };
  showError('');
  devices = devices.map(x => x.id === selectedId
    ? { ...x, pendingApproval: req, lastModifiedAt: new Date().toISOString(), lastModifiedBy: currentUser.name }
    : x);
  renderDetail();
  render();
  await persist();
}

async function changeStatus(newStatus, paymentChoice){
  const d = devices.find(x => x.id === selectedId);
  if(!d) return;

  // مسؤول الحركة: التسليم/الإرجاع بيتحوّلوا لطلب معلّق بدل تنفيذ فوري
  if(isDispatcher() && APPROVAL_STATUSES.includes(newStatus)){
    return requestApproval(newStatus === 'delivered' ? 'handover' : 'return', newStatus, paymentChoice);
  }
""",
1, "JS: APPROVAL_STATUSES + requestApproval + interception")

# ============================================================
# (٣) شارة الانتظار على كارت الكانبان (cardHtml)
# ============================================================
patch(DASH,
"    ${d.status === 'delivered' ? paymentBadge(d) : ''}\n  </div>`;\n}",
"""    ${d.status === 'delivered' ? paymentBadge(d) : ''}
    ${pendingApprovalText(d) ? `<div class="pending-appr-chip">⏳ ${pendingApprovalText(d)}</div>` : ''}
  </div>`;
}""",
1, "cardHtml: pending chip")

# ============================================================
# (٤) شارة الانتظار على كارت الجرد (dayCardHtml)
# ============================================================
patch(DASH,
"    <div class=\"day-card-sub\">${d.shopName ? esc(d.shopName)+' — ' : ''}${esc(d.customerName)}</div>\n    ${badge}\n    ${lock}",
"""    <div class="day-card-sub">${d.shopName ? esc(d.shopName)+' — ' : ''}${esc(d.customerName)}</div>
    ${badge}
    ${pendingApprovalText(d) ? `<div class="pending-appr-chip">⏳ ${pendingApprovalText(d)}</div>` : ''}
    ${lock}""",
1, "dayCardHtml: pending chip")

# ============================================================
# (٥) بانر الانتظار أعلى التفاصيل (renderDetail) — بعد عنوان الجهاز
# ============================================================
patch(DASH,
"    <h2 style=\"font-family:'Cairo',sans-serif;font-size:18px;margin:4px 0 10px;\">${esc(d.deviceType)} ${esc(d.model)}</h2>\n",
"""    <h2 style="font-family:'Cairo',sans-serif;font-size:18px;margin:4px 0 10px;">${esc(d.deviceType)} ${esc(d.model)}</h2>
    ${pendingApprovalText(d) ? `<div class="pending-appr-banner">⏳ ${pendingApprovalText(d)} — ${t('appr.bannerHint')}</div>` : ''}
""",
1, "renderDetail: pending banner")

# ============================================================
# (٦) لفّ منطقة السعر/الدفع في التفاصيل بكلاس money-only (فتح)
# ============================================================
patch(DASH,
"    <label class=\"field\"><span>${t('det.price')}</span><input type=\"text\" inputmode=\"numeric\" value=\"${esc(d.agreedPrice||'')}\" oninput=\"fixDigitsInput(this)\" onblur=\"editPrice(this.value)\" /></label>",
"""    <div class="money-only">
    <label class="field"><span>${t('det.price')}</span><input type="text" inputmode="numeric" value="${esc(d.agreedPrice||'')}" oninput="fixDigitsInput(this)" onblur="editPrice(this.value)" /></label>""",
1, "detail money-only: open wrap")

# ============================================================
# (٧) لفّ منطقة السعر/الدفع (قفل) — بعد سطر "مقيّد على حساب"، قبل ملاحظة حذف الحساب
# ============================================================
patch(DASH,
"    ${d.billedShop ? `<div class=\"detail-row\"><span>${t('det.billedTo')}</span><span style=\"font-weight:800;color:var(--accent);\">${esc(d.billedShop)}</span></div>` : ''}",
"""    ${d.billedShop ? `<div class="detail-row"><span>${t('det.billedTo')}</span><span style="font-weight:800;color:var(--accent);">${esc(d.billedShop)}</span></div>` : ''}
    </div><!-- /money-only -->""",
1, "detail money-only: close wrap")

# ============================================================
# (٨) مفاتيح الترجمة — عربي + إنجليزي
# ============================================================
patch(I18N,
"      'acc.egp': 'ج.م',",
"""      'acc.egp': 'ج.م',
      'appr.badgeHandover': 'تسليم — بانتظار موافقة المحاسب/الإدارة',
      'appr.badgeReturn':   'إرجاع — بانتظار موافقة المحاسب/الإدارة',
      'appr.bannerHint':    'التغيير مش هيتنفذ لحد ما يتوافق عليه',
      'appr.alreadyPending':'فيه طلب معلّق على الجهاز ده بالفعل — استنى الاعتماد',""",
1, "i18n(ar): appr.*")

patch(I18N,
"      'acc.egp': 'EGP',",
"""      'acc.egp': 'EGP',
      'appr.badgeHandover': 'Handover — awaiting accountant/admin approval',
      'appr.badgeReturn':   'Return — awaiting accountant/admin approval',
      'appr.bannerHint':    "the change won't apply until it's approved",
      'appr.alreadyPending':'This device already has a pending request — wait for approval',""",
1, "i18n(en): appr.*")

print('\n'.join(edits_done))
print(f"\n✅ تمّت {len(edits_done)} تعديلات بنجاح.")
