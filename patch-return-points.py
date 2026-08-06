#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-return-points.py — نقاط الجهاز المرتجع

المشكلة الحالية:
    const rpts = parseFloat(enDigits(d.returnPoints)) || 0;
    if(!rpts || !d.substituteTechnician) return;   // ← محدش بياخد حاجة

  الجهاز اللي رجع بعد التسليم كان بيتعامل معاه كإنه ابتدا من أول
  وجديد: نقاط الصيانة الأصلية (d.points) **بتختفي تماماً**، ومحدش
  بياخدها — لا الفني القديم ولا الجديد.

  وأسوأ من كده: لو مفيش فني بديل أو مفيش نقاط للعطل الجديد، الشرط
  بيخرج من غير ما يحسب أي حاجة خالص. يعني فني صلّح جهاز، الجهاز
  رجع لأي سبب، ومحدش دخّله على حد تاني → الفني خسر نقاطه كلها من
  غير ما حد ياخد قرار بكده.

القاعدة الجديدة:
    اللي عمل المرتجع هو اللي بياخد نقاط الجهاز كلها.

    owner = substituteTechnician  ||  technician
    الإجمالي = points + returnPoints

  والصيغة دي بتغطي الحالتين لوحدها:
    • فيه فني بديل  → البديل ياخد الاتنين، والقديم صفر
    • مفيش بديل     → الأصلي يفضل بنقاطه، وياخد نقاط العطل الجديد كمان

  والمساعد بياخد نصيبه من **الإجمالي** بنفس نسبته الأصلية — سواء
  الشغل فضل على الفني القديم أو راح لبديل. المنطق: المساعد جزء من
  فريق الجهاز، والنسبة بتوصف دوره مش الصيانة الواحدة.

الحقل الجديد — assistBlamed:
  بس المساعد أحياناً بيكون له يد في رجوع الجهاز فعلاً. فزوّدنا زرار
  في شاشة التفاصيل (بيظهر للمرتجعات اللي فيها مساعد بس): "المساعد
  له يد في الرجوع" → نصيبه بيروح للي عمل المرتجع.

  القرار ده بيد المحاسب لكل جهاز على حدة — مش قاعدة عامة، لأن
  المساعد ممكن يكون عمل حتة مالهاش علاقة بالعطل اللي رجع.

العلامات الجديدة في قايمة الفني (للمراجعة):
    ↪️ راحت لفني المرتجع   الفني الأصلي — نقاطه اتحوّلت للبديل
    ⛔ اتخصمت — له يد في الرجوع   المساعد المخصوم

الاستخدام:  python3 patch-return-points.py dashboard.html
"""

import sys, shutil, os, datetime

EDITS = []
def edit(name, old, new): EDITS.append((name, old, new))


# ============================================================
# (١) حساب النقاط — الحلقة الأصلية
# ============================================================
edit(
    '\u062d\u0633\u0627\u0628 \u0627\u0644\u0646\u0642\u0627\u0637: \u0645\u0646\u0637\u0642 \u0627\u0644\u0645\u0631\u062a\u062c\u0639',
    """      const rpts = parseFloat(enDigits(d.returnPoints)) || 0;
      if(!rpts || !d.substituteTechnician) return;
      if(d.isWholesale){ wholesaleSkipped++; return; }
      const cd = completionDate(d);
      if(!cd){ pendingPts += rpts; pendingCount++; return; }
      if(!inTeRange(cd)) return;
      push(d.substituteTechnician, d, rpts, '\u0628\u062f\u064a\u0644');
      return;""",

    """      // ============================================================
      // \u0627\u0644\u062c\u0647\u0627\u0632 \u0627\u0644\u0645\u0631\u062a\u062c\u0639 \u2014 \u0627\u0644\u0644\u064a \u0639\u0645\u0644 \u0627\u0644\u0645\u0631\u062a\u062c\u0639 \u064a\u0627\u062e\u062f \u0646\u0642\u0627\u0637 \u0627\u0644\u062c\u0647\u0627\u0632 \u0643\u0644\u0647\u0627
      // ------------------------------------------------------------
      // \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0642\u062f\u064a\u0645\u0629 \u0643\u0627\u0646\u062a \u0628\u062a\u0631\u0645\u064a d.points \u062e\u0627\u0644\u0635 \u0648\u062a\u062f\u064a returnPoints
      // \u0644\u0644\u0628\u062f\u064a\u0644 \u0628\u0633. \u0641\u0627\u0644\u0641\u0646\u064a \u0627\u0644\u0644\u064a \u0635\u0644\u0651\u062d \u0627\u0644\u062c\u0647\u0627\u0632 \u0627\u0644\u0623\u0648\u0644 \u0643\u0627\u0646 \u0628\u064a\u062e\u0633\u0631 \u0646\u0642\u0627\u0637\u0647
      // \u062d\u062a\u0649 \u0644\u0648 \u0645\u062d\u062f\u0634 \u062f\u062e\u0651\u0644 \u0627\u0644\u062c\u0647\u0627\u0632 \u0639\u0644\u0649 \u062d\u062f \u062a\u0627\u0646\u064a \u0623\u0635\u0644\u0627\u064b.
      //
      //   owner = \u0627\u0644\u0628\u062f\u064a\u0644 \u0644\u0648 \u0645\u0648\u062c\u0648\u062f\u060c \u0648\u0625\u0644\u0627 \u0627\u0644\u0641\u0646\u064a \u0627\u0644\u0623\u0635\u0644\u064a
      //   \u0648\u0628\u064a\u0627\u062e\u062f:  points + returnPoints
      //
      // \u0648\u0627\u0644\u0645\u0633\u0627\u0639\u062f \u0628\u064a\u0627\u062e\u062f \u0646\u0635\u064a\u0628\u0647 \u0645\u0646 \u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0628\u0646\u0641\u0633 \u0646\u0633\u0628\u062a\u0647 \u2014 \u0625\u0644\u0627 \u0644\u0648
      // \u0627\u0644\u0645\u062d\u0627\u0633\u0628 \u0642\u0631\u0631 \u0625\u0646 \u0644\u0647 \u064a\u062f \u0641\u064a \u0627\u0644\u0631\u062c\u0648\u0639 (assistBlamed).
      // ============================================================
      const rpts = parseFloat(enDigits(d.returnPoints)) || 0;
      const rBase = parseFloat(enDigits(d.points)) || 0;
      const rTot = rBase + rpts;
      const rOwner = d.substituteTechnician || d.technician;
      if(!rTot || !rOwner) return;
      if(d.isWholesale){ wholesaleSkipped++; return; }
      const cd = completionDate(d); if(!cd){ pendingPts += rTot; pendingCount++; return; }
      if(!inTeRange(cd)) return;
      const rRole = (rOwner === d.substituteTechnician && rOwner !== d.technician) ? '\u0628\u062f\u064a\u0644' : '\u0631\u0626\u064a\u0633\u064a';
      const rPct = Math.min(100, Math.max(0, parseFloat(enDigits(d.assistPercent)) || 0));
      if(d.assistTechnician && rPct > 0 && !d.assistBlamed){
        const rA = rTot * (rPct / 100);
        push(d.assistTechnician, d, rA, '\u0645\u0633\u0627\u0639\u062f');
        push(rOwner, d, rTot - rA, rRole);
      } else {
        push(rOwner, d, rTot, rRole);
      }
      return;"""
)


# ============================================================
# (٢) قايمة صفحة الفني — نفس المنطق + علامات المراجعة
# ============================================================
edit(
    '\u0642\u0627\u064a\u0645\u0629 \u0627\u0644\u0641\u0646\u064a: \u0645\u0646\u0637\u0642 \u0627\u0644\u0645\u0631\u062a\u062c\u0639',
    """    if(returnAfterDeliveryDate(d)){
      const rpts = parseFloat(enDigits(d.returnPoints)) || 0;
      if(d.substituteTechnician){
        pushAll(d.substituteTechnician, d, d.isWholesale ? 0 : rpts, '\u0628\u062f\u064a\u0644',
                d.isWholesale ? 'wholesale' : (rpts ? '' : 'zero'));
      }
      // \u0627\u0644\u0641\u0646\u064a \u0627\u0644\u0623\u0635\u0644\u064a \u0628\u064a\u0627\u062e\u062f \u0635\u0641\u0631 \u0639\u0644\u0649 \u0627\u0644\u0631\u0627\u062c\u0639 \u2014 \u0644\u0643\u0646 \u0644\u0627\u0632\u0645 \u064a\u0628\u0627\u0646 \u0641\u064a \u0642\u0627\u064a\u0645\u062a\u0647
      if(d.technician) pushAll(d.technician, d, 0, '\u0631\u0626\u064a\u0633\u064a', 'returned');
      return;
    }""",

    """    if(returnAfterDeliveryDate(d)){
      // \u0646\u0641\u0633 \u0645\u0639\u0627\u062f\u0644\u0629 \u0627\u0644\u062d\u0633\u0627\u0628 \u0641\u0648\u0642 \u0628\u0627\u0644\u062d\u0631\u0641.
      // \u26a0\ufe0f \u0623\u064a \u062a\u0639\u062f\u064a\u0644 \u0647\u0646\u0627 \u0644\u0627\u0632\u0645 \u064a\u062a\u0639\u0645\u0644 \u0641\u064a \u0627\u0644\u0645\u0643\u0627\u0646\u064a\u0646 \u0648\u0625\u0644\u0627 \u0627\u0644\u0642\u0627\u064a\u0645\u0629
      //    \u0647\u062a\u0642\u0648\u0644 \u062d\u0627\u062c\u0629 \u0648\u0627\u0644\u062c\u062f\u0648\u0644 \u064a\u0642\u0648\u0644 \u062d\u0627\u062c\u0629 \u062a\u0627\u0646\u064a\u0629.
      const rpts  = parseFloat(enDigits(d.returnPoints)) || 0;
      const rBase = parseFloat(enDigits(d.points)) || 0;
      const rTot  = d.isWholesale ? 0 : (rBase + rpts);
      const rOwner = d.substituteTechnician || d.technician;
      const rMoved = !!(d.substituteTechnician && d.technician &&
                        d.substituteTechnician !== d.technician);
      const rRole = rMoved ? '\u0628\u062f\u064a\u0644' : '\u0631\u0626\u064a\u0633\u064a';
      const rFlag = d.isWholesale ? 'wholesale' : (rTot ? 'returned' : 'zero');
      const rPct = Math.min(100, Math.max(0, parseFloat(enDigits(d.assistPercent)) || 0));

      if(d.assistTechnician && rPct > 0 && !d.assistBlamed){
        const rA = rTot * (rPct / 100);
        pushAll(d.assistTechnician, d, rA, '\u0645\u0633\u0627\u0639\u062f', rFlag);
        pushAll(rOwner, d, rTot - rA, rRole, rFlag);
      } else {
        pushAll(rOwner, d, rTot, rRole, rFlag);
        // \u0627\u0644\u0645\u0633\u0627\u0639\u062f \u0627\u0644\u0645\u062e\u0635\u0648\u0645 \u0644\u0627\u0632\u0645 \u064a\u0628\u0627\u0646 \u0641\u064a \u0642\u0627\u064a\u0645\u062a\u0647 \u0645\u0639\u0627\u0647 \u0627\u0644\u0633\u0628\u0628 \u2014
        // \u0645\u0634 \u064a\u062e\u062a\u0641\u064a \u0648\u0647\u0648 \u0641\u0627\u0643\u0631 \u0625\u0646 \u0641\u064a\u0647 \u063a\u0644\u0637\u0629
        if(d.assistTechnician && rPct > 0 && d.assistBlamed)
          pushAll(d.assistTechnician, d, 0, '\u0645\u0633\u0627\u0639\u062f', 'blamed');
      }

      // \u0627\u0644\u0641\u0646\u064a \u0627\u0644\u0623\u0635\u0644\u064a \u0644\u0645\u0627 \u0627\u0644\u0628\u062f\u064a\u0644 \u064a\u0627\u062e\u062f \u0627\u0644\u0634\u063a\u0644: \u0644\u0627\u0632\u0645 \u064a\u0628\u0627\u0646 \u0628\u0635\u0641\u0631
      // \u0648\u0645\u0639\u0627\u0647 \u0627\u0644\u0633\u0628\u0628\u060c \u0648\u0625\u0644\u0627 \u0627\u0644\u062c\u0647\u0627\u0632 \u064a\u062e\u062a\u0641\u064a \u0645\u0646 \u0642\u0627\u064a\u0645\u062a\u0647 \u062e\u0627\u0644\u0635
      if(rMoved) pushAll(d.technician, d, 0, '\u0631\u0626\u064a\u0633\u064a', 'moved');
      return;
    }"""
)


# ============================================================
# (٣) العلامات الجديدة في العرض
# ============================================================
edit(
    '\u0646\u0635\u0648\u0635 \u0627\u0644\u0639\u0644\u0627\u0645\u0627\u062a',
    """    flagRet:   ['\u21a9\ufe0f \u0631\u062c\u0639 \u0628\u0639\u062f \u0627\u0644\u062a\u0633\u0644\u064a\u0645',  '\u21a9\ufe0f Returned after delivery'],""",
    """    flagRet:   ['\u21a9\ufe0f \u0631\u062c\u0639 \u0628\u0639\u062f \u0627\u0644\u062a\u0633\u0644\u064a\u0645',  '\u21a9\ufe0f Returned after delivery'],
    flagMoved: ['\u21aa\ufe0f \u0631\u062c\u0639 \u0648\u0631\u0627\u062d \u0644\u0641\u0646\u064a \u062a\u0627\u0646\u064a \u2014 \u0627\u0644\u0646\u0642\u0627\u0637 \u0627\u062a\u062d\u0648\u0651\u0644\u062a',
                '\u21aa\ufe0f Returned and reassigned \u2014 points moved'],
    flagBlame: ['\u26d4 \u0627\u062a\u062e\u0635\u0645\u062a \u2014 \u0644\u0647 \u064a\u062f \u0641\u064a \u0627\u0644\u0631\u062c\u0648\u0639',
                '\u26d4 Deducted \u2014 shared blame for the return'],""")

edit(
    '\u0639\u0631\u0636 \u0627\u0644\u0639\u0644\u0627\u0645\u0627\u062a',
    """    : f === 'returned'  ? `<div class="td-flag info">${tdT('flagRet')}</div>`
    : '';""",
    """    : f === 'returned'  ? `<div class="td-flag info">${tdT('flagRet')}</div>`
    : f === 'moved'     ? `<div class="td-flag zero">${tdT('flagMoved')}</div>`
    : f === 'blamed'    ? `<div class="td-flag zero">${tdT('flagBlame')}</div>`
    : '';""")

# اللي اتحوّلت نقاطه واللي اتخصم لازم يطلعوا فوق زي الصفر — دول
# محتاجين مراجعة بنفس القدر
edit(
    '\u062a\u0631\u062a\u064a\u0628: \u0627\u0644\u0645\u062d\u0648\u0651\u0644 \u0648\u0627\u0644\u0645\u062e\u0635\u0648\u0645 \u0641\u0648\u0642',
    """  const rank = x => x.flag === 'zero' ? 0 : (x.flag ? 1 : 2);""",
    """  const NEEDS_EYE = { zero: 1, moved: 1, blamed: 1 };
  const rank = x => NEEDS_EYE[x.flag] ? 0 : (x.flag ? 1 : 2);""")

# عمود النقاط: المرتجع إجماليه points + returnPoints مش points لوحدها
edit(
    '\u0639\u0645\u0648\u062f \u0627\u0644\u0646\u0642\u0627\u0637 \u0644\u0644\u0645\u0631\u062a\u062c\u0639',
    """    const shown = x.flag === 'wholesale' ? '\u2014' : esc(x.d.points || '0');""",
    """    // \u0627\u0644\u0645\u0631\u062a\u062c\u0639 \u0625\u062c\u0645\u0627\u0644\u064a\u0647 = \u0646\u0642\u0627\u0637 \u0627\u0644\u0635\u064a\u0627\u0646\u0629 + \u0646\u0642\u0627\u0637 \u0627\u0644\u0639\u0637\u0644 \u0627\u0644\u062c\u062f\u064a\u062f.
    // \u0639\u0631\u0636 d.points \u0644\u0648\u062d\u062f\u0647\u0627 \u0643\u0627\u0646 \u0647\u064a\u0642\u0648\u0644 \u0631\u0642\u0645 \u063a\u064a\u0631 \u0627\u0644\u0644\u064a \u0627\u062a\u062d\u0633\u0628 \u0641\u0639\u0644\u0627\u064b.
    const isRetItem = x.flag === 'returned' || x.flag === 'moved' || x.flag === 'blamed';
    const retTot = (parseFloat(enDigits(x.d.points)) || 0) + (parseFloat(enDigits(x.d.returnPoints)) || 0);
    const shown = x.flag === 'wholesale' ? '\u2014'
                : isRetItem ? String(Math.round(retTot * 10) / 10)
                : esc(x.d.points || '0');""")

edit(
    '\u0633\u0637\u0631 \u0627\u0644\u0646\u0635\u064a\u0628',
    """    const showShare = !x.flag && round1(x.share) !== (parseFloat(enDigits(x.d.points)) || 0);""",
    """    const showShare = (!x.flag || isRetItem) && round1(x.share) !== round1(isRetItem ? retTot : (parseFloat(enDigits(x.d.points)) || 0));""")


# ============================================================
# (٤) الزرار في شاشة التفاصيل
# ============================================================
edit(
    '\u0632\u0631\u0627\u0631 \u062e\u0635\u0645 \u0627\u0644\u0645\u0633\u0627\u0639\u062f',
    """<input type="text" inputmode="numeric" value="${esc(d.returnPoints||'')}" oninput="fixDigitsInput(this)" onblur="editField('returnPoints', enDigits(this.value).replace(/[^0-9.]/g,''))" placeholder="${t('det.returnPointsPh')}" /></label>` : ''}""",

    """<input type="text" inputmode="numeric" value="${esc(d.returnPoints||'')}" oninput="fixDigitsInput(this)" onblur="editField('returnPoints', enDigits(this.value).replace(/[^0-9.]/g,''))" placeholder="${t('det.returnPointsPh')}" /></label>
    ${d.assistTechnician && (parseFloat(enDigits(d.assistPercent))||0) > 0 ? `
    <div style="margin-bottom:10px;">
      <span style="font-size:13px;color:var(--muted);display:block;margin-bottom:6px;">\U0001f91d ${tdT('blameQ')}</span>
      <div class="pay-choice">
        <button type="button" style="border-color:var(--info);${!d.assistBlamed?'background:#2563EB;color:#fff;':'background:var(--surface);color:var(--info);'}"${roB} onclick="setAssistBlamed(false)">${tdT('blameNo')}</button>
        <button type="button" style="border-color:var(--danger);${d.assistBlamed?'background:#DC2626;color:#fff;':'background:var(--surface);color:var(--danger);'}"${roB} onclick="setAssistBlamed(true)">${tdT('blameYes')}</button>
      </div>
    </div>` : ''}` : ''}"""
)

edit(
    '\u0646\u0635\u0648\u0635 \u0627\u0644\u0632\u0631\u0627\u0631',
    """    none:      ['\u0645\u0641\u064a\u0634 \u0623\u062c\u0647\u0632\u0629 \u0641\u064a \u0627\u0644\u0641\u062a\u0631\u0629 \u062f\u064a', 'No devices in this period'],""",
    """    none:      ['\u0645\u0641\u064a\u0634 \u0623\u062c\u0647\u0632\u0629 \u0641\u064a \u0627\u0644\u0641\u062a\u0631\u0629 \u062f\u064a', 'No devices in this period'],
    blameQ:    ['\u0627\u0644\u0645\u0633\u0627\u0639\u062f \u0644\u0647 \u064a\u062f \u0641\u064a \u0631\u062c\u0648\u0639 \u0627\u0644\u062c\u0647\u0627\u0632\u061f', 'Did the assistant share blame for the return?'],
    blameNo:   ['\u0644\u0623 \u2014 \u064a\u0627\u062e\u062f \u0646\u0635\u064a\u0628\u0647',        'No \u2014 keeps their share'],
    blameYes:  ['\u0623\u064a\u0648\u0647 \u2014 \u0627\u062e\u0635\u0645 \u0646\u0635\u064a\u0628\u0647',      'Yes \u2014 deduct their share'],""")

edit(
    '\u062f\u0627\u0644\u0629 setAssistBlamed',
    """async function setWholesale(val){""",
    """// \u0642\u0631\u0627\u0631 \u0627\u0644\u0645\u062d\u0627\u0633\u0628 \u0644\u0643\u0644 \u062c\u0647\u0627\u0632 \u0639\u0644\u0649 \u062d\u062f\u0629 \u2014 \u0645\u0634 \u0642\u0627\u0639\u062f\u0629 \u0639\u0627\u0645\u0629.
// \u0627\u0644\u0645\u0633\u0627\u0639\u062f \u0645\u0645\u0643\u0646 \u064a\u0643\u0648\u0646 \u0639\u0645\u0644 \u062d\u062a\u0629 \u0645\u0627\u0644\u0647\u0627\u0634 \u0639\u0644\u0627\u0642\u0629 \u0628\u0627\u0644\u0639\u0637\u0644 \u0627\u0644\u0644\u064a \u0631\u062c\u0639.
async function setAssistBlamed(val){
  devices = devices.map(d => d.id === selectedId ? { ...d, assistBlamed: !!val, lastModifiedAt: new Date().toISOString(), lastModifiedBy: currentUser.name } : d);
  renderDetail();
  render();
  if(_openTechDevName && document.getElementById('techDevOverlay') && !document.getElementById('techDevOverlay').classList.contains('hidden')){
    renderTechEval(); openTechDevices(_openTechDevName);
  }
  await persist();
}

async function setWholesale(val){""")


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'dashboard.html'
    if not os.path.exists(path): sys.exit(f'\u274c \u0645\u0627\u0644\u0642\u064a\u062a\u0634 \u0627\u0644\u0645\u0644\u0641: {path}')
    src = open(path, encoding='utf-8').read()

    if 'contribAll' not in src:
        sys.exit('\u274c \u0644\u0627\u0632\u0645 \u062a\u0634\u063a\u0651\u0644 patch-tech-devices-all.py \u0627\u0644\u0623\u0648\u0644 \u2014 \u0627\u0644\u0628\u0627\u062a\u0634 \u062f\u0647 \u0628\u064a\u0628\u0646\u064a \u0639\u0644\u064a\u0647.')
    if 'assistBlamed' in src:
        print('\u2139\ufe0f  \u0645\u062a\u0639\u0645\u0644 \u0642\u0628\u0644 \u0643\u062f\u0647 \u2014 \u0645\u0641\u064a\u0634 \u062d\u0627\u062c\u0629 \u0627\u062a\u063a\u064a\u0651\u0631\u062a.'); return

    for label, old, _ in EDITS:
        n = src.count(old)
        if n != 1: sys.exit(f'\u274c "{label}": \u0644\u0642\u064a\u062a {n} \u0646\u0633\u062e\u0629 \u2014 \u0627\u0644\u0645\u0641\u0631\u0648\u0636 \u0648\u0627\u062d\u062f\u0629. \u0645\u062a\u0643\u0645\u0644\u0634.')

    bak = path + '.bak-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    shutil.copy2(path, bak)
    out = src
    for label, old, new in EDITS:
        out = out.replace(old, new); print(f'   \u2713 {label}')
    open(path, 'w', encoding='utf-8').write(out)
    print(f'\n\u2705 \u062a\u0645 \u2014 \u0646\u0633\u062e\u0629 \u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629: {bak}')


if __name__ == '__main__':
    main()
