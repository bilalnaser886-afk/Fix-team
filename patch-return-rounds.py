#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-return-rounds.py — جولات المرتجع المتعددة + إصلاح تاريخ الإنجاز

يصلح ٤ حاجات:

(١) نقاط العطل الجديد ما بتتحسبش
    completionDate بترجّع deliveredDateOf = آخر تسليم في التاريخ.
    الجهاز اللي لسه في المرتجعات مالوش تسليم جديد، فبترجّع **التسليم
    القديم**. ولو ده كان الشهر اللي فات:
        رجع 2026-08-01 · completionDate = 2026-07-20
        inTeRange(أغسطس) = false  →  if(!inTeRange(cd)) return;
    الجهاز كله بيتشال — لا نقاط الصيانة ولا نقاط العطل الجديد.
    والأسوأ: لو التسليم الأول كان في نفس الشهر بتتحسب عادي، فالسلوك
    بيتغيّر حسب حاجة مالهاش علاقة بالموضوع.
    الحل: returnCompletionDate = أول تسليم/إنجاز **بعد** الرجوع.

(٢) حقول المرتجع بتختفي بعد التسليم
    const isRet = d.status === 'returned';   ← الحالة الحالية
    أول ما الجهاز يتسلّم، ٦ حقول بتختفي والبيانات تفضل في القاعدة
    من غير أي شاشة توريها. مراجعة شهرية على بيانات مخفية مستحيلة.
    الحل: hasRet (فيه بيانات مرتجع؟) للظهور، isRet للتعديل.

(٣) حقول النقاط لازم تفضل مفتوحة
    التقييم شهري — الجهاز أكيد هيكون اتسلّم وقتها. فنقاط المرتجع
    والفني البديل وخصم المساعد بيفضلوا قابلين للتعديل دايماً.
    وباقي حقول المرتجع (السعر/الشكوى/العطل/الدفع) للقراءة بس بعد
    التسليم — دي بيانات وقت الصيانة، مش قرارات تقييم.

(٤) الرجوع التاني بيدهس على الأول
    returnPrice و returnPoints و returnComplaint حقول مفردة. جهاز
    رجع مرتين = بيانات الرجوع الأول ضاعت. ودي موجودة من قبل التعديل ده.

    الحل من غير ترحيل:
        الجولة الحالية  →  تفضل في الحقول القديمة زي ما هي
        الجولات المنتهية →  تتأرشف في returnRounds[]

    ليه كده؟ عشان كل كود الفلوس (editReturnPrice · editReturnPayType ·
    markReturnPaid · isReturnPriced · الدفتر · syncTrack) بيقرا الحقول
    القديمة. لو نقلناها لمصفوفة كان لازم نعيد كتابتهم كلهم — وده
    أخطر بكتير من المشكلة نفسها.
    وكمان: الأجهزة الموجودة دلوقتي صح تلقائياً — returnRounds فاضية
    وحقولها هي الجولة الأولى. **مفيش سكربت ترحيل على بيانات فلوس.**

    الأرشفة بتحصل في changeStatus لما الحالة تبقى 'returned' والحقول
    فيها بيانات من جولة سابقة.

توزيع النقاط عبر الجولات:
    نقاط الصيانة الأساسية  →  صاحب آخر جولة (اللي سلّم الجهاز آخر مرة)
    نقاط كل جولة           →  صاحب الجولة دي هو
    والمساعد بياخد نسبته من كل جزء — إلا لو متخصم في الجولة دي.

الاستخدام:  python3 patch-return-rounds.py dashboard.html
"""

import sys, shutil, os, datetime

EDITS = []
def edit(name, old, new): EDITS.append((name, old, new))


# ============================================================
# (١) الدوال المساعدة
# ============================================================
edit('\u0627\u0644\u062f\u0648\u0627\u0644 \u0627\u0644\u0645\u0633\u0627\u0639\u062f\u0629',
"""function deliveredDateOf(d){""",
"""// ============================================================
// \u062c\u0648\u0644\u0627\u062a \u0627\u0644\u0645\u0631\u062a\u062c\u0639
// ------------------------------------------------------------
// \u0627\u0644\u062c\u0648\u0644\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629 \u0628\u062a\u0641\u0636\u0644 \u0641\u064a \u0627\u0644\u062d\u0642\u0648\u0644 \u0627\u0644\u0642\u062f\u064a\u0645\u0629 (returnPrice \u2026)\u060c
// \u0648\u0627\u0644\u062c\u0648\u0644\u0627\u062a \u0627\u0644\u0645\u0646\u062a\u0647\u064a\u0629 \u0628\u062a\u062a\u0623\u0631\u0634\u0641 \u0641\u064a returnRounds[].
//
// \u0644\u064a\u0647 \u0645\u0634 \u0643\u0644\u0647\u0645 \u0641\u064a \u0627\u0644\u0645\u0635\u0641\u0648\u0641\u0629\u061f \u0644\u0623\u0646 \u0643\u0644 \u0643\u0648\u062f \u0627\u0644\u0641\u0644\u0648\u0633 \u0628\u064a\u0642\u0631\u0627
// \u0627\u0644\u062d\u0642\u0648\u0644 \u0627\u0644\u0642\u062f\u064a\u0645\u0629 \u2014 editReturnPrice \u00b7 markReturnPaid \u00b7 \u0627\u0644\u062f\u0641\u062a\u0631 \u00b7
// syncTrack. \u0648\u0643\u0645\u0627\u0646 \u0627\u0644\u0623\u062c\u0647\u0632\u0629 \u0627\u0644\u0645\u0648\u062c\u0648\u062f\u0629 \u0628\u062a\u0628\u0642\u0649 \u0635\u062d \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u064b
// \u0645\u0646 \u063a\u064a\u0631 \u0623\u064a \u062a\u0631\u062d\u064a\u0644 \u0639\u0644\u0649 \u0628\u064a\u0627\u0646\u0627\u062a \u0641\u0644\u0648\u0633.
// ============================================================
const RET_FIELDS = ['returnPrice','returnComplaint','discoveredFault',
                    'substituteTechnician','returnPoints','returnPaymentType',
                    'returnPaymentStatus','returnBilledShop'];

// \u0641\u064a\u0647 \u0623\u064a \u0628\u064a\u0627\u0646\u0627\u062a \u0645\u0631\u062a\u062c\u0639 \u0641\u064a \u0627\u0644\u062d\u0642\u0648\u0644 \u0627\u0644\u062d\u0627\u0644\u064a\u0629\u061f
function curRoundHasData(d){
  if(!d) return false;
  if(d.assistBlamed) return true;
  if(d.returnPriceConfirmation && d.returnPriceConfirmation.requested) return true;
  return RET_FIELDS.some(k => { const v = d[k]; return v !== undefined && v !== null && String(v).trim() !== ''; });
}

// \u0627\u0644\u062c\u0648\u0644\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629 \u0643\u0643\u0627\u0626\u0646 \u2014 \u0646\u0641\u0633 \u0634\u0643\u0644 \u0627\u0644\u0645\u0624\u0631\u0634\u0641
function curRound(d){
  const o = { at: returnAfterDeliveryDate(d) || '', doneAt: returnCompletionDate(d) || '',
              assistBlamed: !!d.assistBlamed };
  RET_FIELDS.forEach(k => o[k] = d[k] || '');
  return o;
}

// \u0643\u0644 \u0627\u0644\u062c\u0648\u0644\u0627\u062a: \u0627\u0644\u0645\u0624\u0631\u0634\u0641 + \u0627\u0644\u062d\u0627\u0644\u064a\u0629 \u0644\u0648 \u0641\u064a\u0647\u0627 \u062d\u0627\u062c\u0629
function retRounds(d){
  const past = Array.isArray(d && d.returnRounds) ? d.returnRounds : [];
  return curRoundHasData(d) || (d && d.status === 'returned')
       ? past.concat([curRound(d)]) : past.slice();
}

// \u0627\u0644\u062c\u0647\u0627\u0632 \u0644\u064a\u0647 \u062a\u0627\u0631\u064a\u062e \u0645\u0631\u062a\u062c\u0639\u061f (\u0644\u0644\u0639\u0631\u0636 \u0645\u0634 \u0644\u0644\u062a\u0639\u062f\u064a\u0644)
function hasRetData(d){
  if(!d) return false;
  if(d.status === 'returned') return true;
  if(Array.isArray(d.returnRounds) && d.returnRounds.length) return true;
  return !!returnAfterDeliveryDate(d) || curRoundHasData(d);
}

// \u26a0\ufe0f \u062a\u0627\u0631\u064a\u062e \u0625\u0646\u062c\u0627\u0632 \u0627\u0644\u0645\u0631\u062a\u062c\u0639 \u2014 \u0623\u0648\u0644 \u062a\u0633\u0644\u064a\u0645/\u0625\u0646\u062c\u0627\u0632 **\u0628\u0639\u062f** \u0627\u0644\u0631\u062c\u0648\u0639.
//    completionDate \u0627\u0644\u0639\u0627\u062f\u064a\u0629 \u0628\u062a\u0631\u062c\u0651\u0639 \u0622\u062e\u0631 \u062a\u0633\u0644\u064a\u0645\u060c \u0648\u0627\u0644\u062c\u0647\u0627\u0632 \u0627\u0644\u0644\u064a
//    \u0644\u0633\u0647 \u0641\u064a \u0627\u0644\u0645\u0631\u062a\u062c\u0639\u0627\u062a \u0645\u0627\u0644\u0648\u0634 \u062a\u0633\u0644\u064a\u0645 \u062c\u062f\u064a\u062f \u2014 \u0641\u0628\u062a\u0631\u062c\u0651\u0639 \u0627\u0644\u0642\u062f\u064a\u0645
//    \u0648\u064a\u0637\u0644\u0639 \u0628\u0631\u0651\u0647 \u0641\u062a\u0631\u0629 \u0627\u0644\u062a\u0642\u064a\u064a\u0645 \u0641\u064a\u0631\u0648\u062d \u0645\u0646 \u0627\u0644\u062d\u0633\u0627\u0628 \u062e\u0627\u0644\u0635.
function returnCompletionDate(d){
  const h = (d && d.statusHistory) || [];
  let deliveredAt = -1, retAt = -1;
  for(let i = 0; i < h.length; i++){
    if(h[i].status === 'delivered') deliveredAt = i;
    if(h[i].status === 'returned' && deliveredAt !== -1 && i > deliveredAt) retAt = i;
  }
  if(retAt === -1) return null;
  for(let i = retAt + 1; i < h.length; i++){
    if(h[i].status === 'delivered' || h[i].status === 'done') return h[i].date;
  }
  return null;                      // \u0644\u0633\u0647 \u0641\u064a \u0627\u0644\u0645\u0631\u062a\u062c\u0639\u0627\u062a \u2014 \u0645\u0639\u0644\u0651\u0642
}

// \u062a\u0642\u0633\u064a\u0645 \u0646\u0642\u0627\u0637 \u0627\u0644\u062c\u0647\u0627\u0632 \u0627\u0644\u0645\u0631\u062a\u062c\u0639 \u0639\u0644\u0649 \u0623\u0635\u062d\u0627\u0628\u0647\u0627:
//   \u2022 \u0646\u0642\u0627\u0637 \u0627\u0644\u0635\u064a\u0627\u0646\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629  \u2190  \u0635\u0627\u062d\u0628 \u0622\u062e\u0631 \u062c\u0648\u0644\u0629 (\u0627\u0644\u0644\u064a \u0633\u0644\u0651\u0645\u0647 \u0622\u062e\u0631 \u0645\u0631\u0629)
//   \u2022 \u0646\u0642\u0627\u0637 \u0643\u0644 \u062c\u0648\u0644\u0629           \u2190  \u0635\u0627\u062d\u0628 \u0627\u0644\u062c\u0648\u0644\u0629 \u062f\u064a \u0647\u0648
// \u0648\u0627\u062d\u062f\u0629 \u0644\u0644\u062d\u0633\u0627\u0628 \u0648\u0627\u0644\u0639\u0631\u0636 \u0645\u0639 \u0628\u0639\u0636 \u2014 \u0645\u0633\u062a\u062d\u064a\u0644 \u064a\u062e\u062a\u0644\u0641\u0648\u0627.
function returnPointParts(d){
  const rounds = retRounds(d);
  const out = [];
  const base = parseFloat(enDigits(d.points)) || 0;
  const last = rounds.length ? rounds[rounds.length - 1] : null;
  const finalOwner = (last && last.substituteTechnician) || d.technician;
  const roleOf = o => (o && o !== d.technician) ? '\u0628\u062f\u064a\u0644' : '\u0631\u0626\u064a\u0633\u064a';
  if(base && finalOwner)
    out.push({ owner: finalOwner, amt: base, blamed: !!(last && last.assistBlamed),
               role: roleOf(finalOwner), kind: 'base' });
  rounds.forEach((r, i) => {
    const p = parseFloat(enDigits(r.returnPoints)) || 0;
    const o = r.substituteTechnician || d.technician;
    if(!p || !o) return;
    out.push({ owner: o, amt: p, blamed: !!r.assistBlamed, role: roleOf(o),
               kind: 'round', round: i + 1 });
  });
  return out;
}

function deliveredDateOf(d){""")


# ============================================================
# (٢) الأرشفة عند رجوع جديد
# ============================================================
edit('\u0623\u0631\u0634\u0641\u0629 \u0627\u0644\u062c\u0648\u0644\u0629 \u0639\u0646\u062f \u0631\u062c\u0648\u0639 \u062c\u062f\u064a\u062f',
"""  showError('');
  if(newStatus === 'rejected' && d.status !== 'rejected') extra.rejectedInShop""",
"""  // \u26a0\ufe0f \u0631\u062c\u0648\u0639 \u062c\u062f\u064a\u062f \u0648\u0627\u0644\u062d\u0642\u0648\u0644 \u0641\u064a\u0647\u0627 \u0628\u064a\u0627\u0646\u0627\u062a \u062c\u0648\u0644\u0629 \u0642\u0628\u0644 \u0643\u062f\u0647\u061f
  //    \u0646\u0623\u0631\u0634\u0641\u0647\u0627 \u0627\u0644\u0623\u0648\u0644 \u0648\u0646\u0641\u0636\u0651\u064a \u0627\u0644\u062d\u0642\u0648\u0644 \u0644\u0644\u062c\u0648\u0644\u0629 \u0627\u0644\u062c\u062f\u064a\u062f\u0629.
  //    \u0645\u0646 \u063a\u064a\u0631 \u0643\u062f\u0647 \u0627\u0644\u0631\u062c\u0648\u0639 \u0627\u0644\u062a\u0627\u0646\u064a \u0628\u064a\u062f\u0647\u0633 \u0639\u0644\u0649 \u0627\u0644\u0623\u0648\u0644 \u0648\u0628\u064a\u0627\u0646\u0627\u062a\u0647
  //    \u0628\u062a\u0636\u064a\u0639 \u062e\u0627\u0644\u0635 \u2014 \u0633\u0639\u0631\u0647 \u0648\u0646\u0642\u0627\u0637\u0647 \u0648\u0641\u0646\u064a\u0647.
  if(newStatus === 'returned' && d.status !== 'returned' && curRoundHasData(d)){
    extra.returnRounds = (Array.isArray(d.returnRounds) ? d.returnRounds : []).concat([curRound(d)]);
    RET_FIELDS.forEach(k => extra[k] = '');
    extra.assistBlamed = false;
    extra.returnPriceConfirmation = null;
  }

  showError('');
  if(newStatus === 'rejected' && d.status !== 'rejected') extra.rejectedInShop""")


# ============================================================
# (٣) حساب النقاط عبر الجولات
# ============================================================
edit('\u062d\u0633\u0627\u0628 \u0627\u0644\u0646\u0642\u0627\u0637 \u0639\u0628\u0631 \u0627\u0644\u062c\u0648\u0644\u0627\u062a',
"""      const rpts = parseFloat(enDigits(d.returnPoints)) || 0;
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
      return;""",

"""      if(d.isWholesale){ wholesaleSkipped++; return; }
      const rParts = returnPointParts(d);
      const rTot = rParts.reduce((s, p) => s + p.amt, 0);
      if(!rTot) return;
      // \u26a0\ufe0f \u062a\u0627\u0631\u064a\u062e \u0625\u0646\u062c\u0627\u0632 \u0627\u0644\u0645\u0631\u062a\u062c\u0639 \u0645\u0634 \u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062a\u0633\u0644\u064a\u0645 \u0627\u0644\u0642\u062f\u064a\u0645
      const cd = returnCompletionDate(d);
      if(!cd){ pendingPts += rTot; pendingCount++; return; }
      if(!inTeRange(cd)) return;
      const rPct = Math.min(100, Math.max(0, parseFloat(enDigits(d.assistPercent)) || 0));
      rParts.forEach(p => {
        if(d.assistTechnician && rPct > 0 && !p.blamed){
          const a = p.amt * (rPct / 100);
          push(d.assistTechnician, d, a, '\u0645\u0633\u0627\u0639\u062f');
          push(p.owner, d, p.amt - a, p.role);
        } else {
          push(p.owner, d, p.amt, p.role);
        }
      });
      return;""")


# ============================================================
# (٤) قايمة الفني
# ============================================================
edit('\u0642\u0627\u064a\u0645\u0629 \u0627\u0644\u0641\u0646\u064a: \u0627\u0644\u062c\u0648\u0644\u0627\u062a',
"""      const rpts  = parseFloat(enDigits(d.returnPoints)) || 0;
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
      return;""",

"""      // \u0646\u0641\u0633 \u062f\u0627\u0644\u0629 \u0627\u0644\u062a\u0642\u0633\u064a\u0645 \u0627\u0644\u0644\u064a \u0627\u0644\u062d\u0633\u0627\u0628 \u0628\u064a\u0633\u062a\u062e\u062f\u0645\u0647\u0627 \u2014 \u0645\u0633\u062a\u062d\u064a\u0644 \u064a\u062e\u062a\u0644\u0641\u0648\u0627
      const rParts = d.isWholesale ? [] : returnPointParts(d);
      const rTot = rParts.reduce((s, p) => s + p.amt, 0);
      const rFlag = d.isWholesale ? 'wholesale' : (rTot ? 'returned' : 'zero');
      const rPct = Math.min(100, Math.max(0, parseFloat(enDigits(d.assistPercent)) || 0));
      const seen = {};

      if(!rParts.length){ pushAll(d.substituteTechnician || d.technician, d, 0, '\u0631\u0626\u064a\u0633\u064a', rFlag); }
      rParts.forEach(p => {
        seen[p.owner] = 1;
        if(d.assistTechnician && rPct > 0 && !p.blamed){
          const a = p.amt * (rPct / 100);
          pushAll(d.assistTechnician, d, a, '\u0645\u0633\u0627\u0639\u062f', rFlag); seen[d.assistTechnician] = 1;
          pushAll(p.owner, d, p.amt - a, p.role, rFlag);
        } else {
          pushAll(p.owner, d, p.amt, p.role, rFlag);
        }
      });

      // \u0627\u0644\u0645\u0633\u0627\u0639\u062f \u0627\u0644\u0645\u062e\u0635\u0648\u0645 \u2014 \u064a\u0628\u0627\u0646 \u0628\u0635\u0641\u0631 \u0648\u0645\u0639\u0627\u0647 \u0627\u0644\u0633\u0628\u0628 \u0628\u062f\u0644 \u0645\u0627 \u064a\u062e\u062a\u0641\u064a
      if(d.assistTechnician && rPct > 0 && !seen[d.assistTechnician])
        pushAll(d.assistTechnician, d, 0, '\u0645\u0633\u0627\u0639\u062f', 'blamed');
      // \u0627\u0644\u0641\u0646\u064a \u0627\u0644\u0623\u0635\u0644\u064a \u0644\u0648 \u0627\u0644\u0634\u063a\u0644 \u0631\u0627\u062d \u0644\u063a\u064a\u0631\u0647 \u0628\u0627\u0644\u0643\u0627\u0645\u0644
      if(d.technician && !seen[d.technician])
        pushAll(d.technician, d, 0, '\u0631\u0626\u064a\u0633\u064a', 'moved');
      return;""")

# عمود النقاط: الإجمالي عبر الجولات
edit('\u0639\u0645\u0648\u062f \u0627\u0644\u0646\u0642\u0627\u0637',
"""    const retTot = (parseFloat(enDigits(x.d.points)) || 0) + (parseFloat(enDigits(x.d.returnPoints)) || 0);""",
"""    const retTot = isRetItem ? returnPointParts(x.d).reduce((s, p) => s + p.amt, 0) : 0;""")


# ============================================================
# (٥) شاشة التفاصيل — الظهور مقابل التعديل
# ============================================================
edit('\u0627\u0644\u0638\u0647\u0648\u0631: hasRet',
"""  const isRet = d.status === 'returned';""",
"""  const isRet = d.status === 'returned';
  // \u26a0\ufe0f \u0627\u0644\u0641\u0631\u0642 \u0628\u064a\u0646 \u0627\u0644\u0627\u062a\u0646\u064a\u0646 \u0645\u0647\u0645:
  //    isRet  = \u0627\u0644\u062c\u0647\u0627\u0632 \u0641\u064a \u0627\u0644\u0645\u0631\u062a\u062c\u0639\u0627\u062a \u062f\u0644\u0648\u0642\u062a\u064a  \u2192 \u0627\u0644\u062a\u0639\u062f\u064a\u0644
  //    hasRet = \u0627\u0644\u062c\u0647\u0627\u0632 \u0644\u064a\u0647 \u062a\u0627\u0631\u064a\u062e \u0645\u0631\u062a\u062c\u0639     \u2192 \u0627\u0644\u0638\u0647\u0648\u0631
  //    \u0642\u0628\u0644 \u0643\u062f\u0647 \u0627\u0644\u0627\u062a\u0646\u064a\u0646 \u0643\u0627\u0646\u0648\u0627 \u062d\u0627\u062c\u0629 \u0648\u0627\u062d\u062f\u0629\u060c \u0641\u0623\u0648\u0644 \u0645\u0627 \u0627\u0644\u062c\u0647\u0627\u0632
  //    \u064a\u062a\u0633\u0644\u0651\u0645 \u0643\u0627\u0646\u062a \u0633\u062a \u062d\u0642\u0648\u0644 \u062a\u062e\u062a\u0641\u064a \u0648\u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u062a\u0641\u0636\u0644 \u0641\u064a \u0627\u0644\u0642\u0627\u0639\u062f\u0629
  //    \u0645\u0646 \u063a\u064a\u0631 \u0623\u064a \u0634\u0627\u0634\u0629 \u062a\u0648\u0631\u064a\u0647\u0627.
  const hasRet = hasRetData(d);
  const roR = isRet ? '' : ' readonly';    // \u062d\u0642\u0648\u0644 \u0648\u0642\u062a \u0627\u0644\u0635\u064a\u0627\u0646\u0629 \u2014 \u062a\u062a\u0642\u0641\u0644 \u0628\u0639\u062f \u0627\u0644\u062a\u0633\u0644\u064a\u0645
  const roRB = isRet ? '' : ' disabled';""")

edit('\u0627\u0644\u0633\u0639\u0631 \u0648\u0627\u0644\u062f\u0641\u0639',
"""    ${isRet ? `
    <label class="field" style="margin-top:6px;"><span style="color:var(--violet);font-weight:800;">${t('det.returnPrice')}</span><input type="text" inputmode="numeric" value="${esc(d.returnPrice||'')}" oninput="fixDigitsInput(this)" onblur="editReturnPrice(this.value)" placeholder="${t('det.returnPricePh')}" /></label>""",
"""    ${hasRet ? `
    ${retRoundsHtml(d)}
    <label class="field" style="margin-top:6px;"><span style="color:var(--violet);font-weight:800;">${t('det.returnPrice')}</span><input type="text" inputmode="numeric" value="${esc(d.returnPrice||'')}"${roR} oninput="fixDigitsInput(this)" onblur="editReturnPrice(this.value)" placeholder="${t('det.returnPricePh')}" /></label>""")

edit('\u0623\u0632\u0631\u0627\u0631 \u0627\u0644\u062f\u0641\u0639',
"""        <button type="button" class="pay-btn" style="border-color:var(--success);${d.returnPaymentType!=='deferred'?'background:#16A34A;color:#fff;':'color:var(--success);background:var(--surface);'}" onclick="editReturnPayType('cash')">${t('det.payCash')}</button>
        <button type="button" class="pay-btn" style="border-color:var(--warn);${d.returnPaymentType==='deferred'?'background:#B45309;color:#fff;':'color:var(--warn);background:var(--surface);'}" onclick="editReturnPayType('deferred')">${t('det.payDeferred')}</button>""",
"""        <button type="button" class="pay-btn"${roRB} style="border-color:var(--success);${d.returnPaymentType!=='deferred'?'background:#16A34A;color:#fff;':'color:var(--success);background:var(--surface);'}" onclick="editReturnPayType('cash')">${t('det.payCash')}</button>
        <button type="button" class="pay-btn"${roRB} style="border-color:var(--warn);${d.returnPaymentType==='deferred'?'background:#B45309;color:#fff;':'color:var(--warn);background:var(--surface);'}" onclick="editReturnPayType('deferred')">${t('det.payDeferred')}</button>""")

edit('\u0627\u0644\u0634\u0643\u0648\u0649 \u0648\u0627\u0644\u0639\u0637\u0644 \u0627\u0644\u0645\u0643\u062a\u0634\u0641',
"""    ${isRet ? `
    <label class="field"><span style="color:var(--violet);font-weight:800;">${t('det.returnComplaint')}</span><textarea rows="2" placeholder="${t('det.returnComplaintPh')}" onblur="editField('returnComplaint', this.value)">${esc(d.returnComplaint||'')}</textarea></label>
    <label class="field"><span style="color:var(--violet);font-weight:800;">${t('det.discoveredFault')}</span><textarea rows="2" placeholder="${t('det.discoveredFaultPh')}" onblur="editField('discoveredFault', this.value)">${esc(d.discoveredFault||'')}</textarea></label>` : ''}""",
"""    ${hasRet ? `
    <label class="field"><span style="color:var(--violet);font-weight:800;">${t('det.returnComplaint')}</span><textarea rows="2"${roR} placeholder="${t('det.returnComplaintPh')}" onblur="editField('returnComplaint', this.value)">${esc(d.returnComplaint||'')}</textarea></label>
    <label class="field"><span style="color:var(--violet);font-weight:800;">${t('det.discoveredFault')}</span><textarea rows="2"${roR} placeholder="${t('det.discoveredFaultPh')}" onblur="editField('discoveredFault', this.value)">${esc(d.discoveredFault||'')}</textarea></label>` : ''}""")

# حقول النقاط — تفضل مفتوحة دايماً
edit('\u062d\u0642\u0648\u0644 \u0627\u0644\u0646\u0642\u0627\u0637 \u062a\u0641\u0636\u0644 \u0645\u0641\u062a\u0648\u062d\u0629',
"""    ${isRet ? `<label class="field"><span style="color:var(--violet);font-weight:800;">${t('det.substituteTech')}</span>""",
"""    ${/* \u26a0\ufe0f hasRet \u0645\u0634 isRet: \u0627\u0644\u062a\u0642\u064a\u064a\u0645 \u0634\u0647\u0631\u064a\u060c \u0648\u0627\u0644\u062c\u0647\u0627\u0632 \u0623\u0643\u064a\u062f \u0647\u064a\u0643\u0648\u0646
         \u0627\u062a\u0633\u0644\u0651\u0645 \u0648\u0642\u062a\u0647\u0627. \u0641\u0644\u0648 \u0642\u0641\u0644\u0646\u0627 \u0627\u0644\u062d\u0642\u0648\u0644 \u062f\u064a \u0628\u0639\u062f \u0627\u0644\u062a\u0633\u0644\u064a\u0645 \u0628\u062a\u0628\u0642\u0649
         \u0645\u0627\u0644\u0647\u0627\u0634 \u0644\u0627\u0632\u0645\u0629 \u062e\u0627\u0644\u0635 \u2014 \u0645\u062d\u062f\u0634 \u0647\u064a\u0642\u062f\u0631 \u064a\u0635\u062d\u062d \u0646\u0642\u0637\u0629 \u063a\u0644\u0637. */ ''}
    ${hasRet ? `<label class="field"><span style="color:var(--violet);font-weight:800;">${t('det.substituteTech')}</span>""")


# ============================================================
# (٦) عرض الجولات السابقة
# ============================================================
edit('\u062f\u0627\u0644\u0629 \u0639\u0631\u0636 \u0627\u0644\u062c\u0648\u0644\u0627\u062a \u0627\u0644\u0633\u0627\u0628\u0642\u0629',
"""async function setAssistBlamed(val){""",
"""// \u0627\u0644\u062c\u0648\u0644\u0627\u062a \u0627\u0644\u0645\u0646\u062a\u0647\u064a\u0629 \u2014 \u0644\u0644\u0642\u0631\u0627\u0621\u0629 \u0628\u0633.
// \u0627\u0644\u062c\u0648\u0644\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629 \u0628\u062a\u062a\u0639\u0631\u0636 \u062a\u062d\u062a \u0641\u064a \u0627\u0644\u062d\u0642\u0648\u0644 \u0627\u0644\u0639\u0627\u062f\u064a\u0629.
function retRoundsHtml(d){
  const past = Array.isArray(d && d.returnRounds) ? d.returnRounds : [];
  if(!past.length) return '';
  const dt = s => { if(!s) return '\u2014'; try{ return new Date(s).toLocaleDateString('en-GB'); }catch(e){ return s; } };
  const line = (lbl, val) => val ? `<div style="font-size:12.5px;margin-top:3px;"><span style="color:var(--muted-2);">${lbl}:</span> <b>${esc(val)}</b></div>` : '';
  return past.map((r, i) => `
    <div style="border:1px solid var(--border);border-inline-start:3px solid var(--violet);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--surface-2);">
      <div style="font-family:'Cairo',sans-serif;font-weight:900;font-size:12.5px;color:var(--violet);">
        \u21a9\ufe0f ${tdT('roundN')} ${i + 1} <span style="font-weight:500;color:var(--muted-2);">\u00b7 ${dt(r.at)} \u2190 ${dt(r.doneAt)}</span>
      </div>
      ${line(tdT('rComplaint'), r.returnComplaint)}
      ${line(tdT('rFault'), r.discoveredFault)}
      ${line(tdT('rTech'), r.substituteTechnician)}
      ${line(tdT('rPoints'), r.returnPoints)}
      ${line(tdT('rPrice'), r.returnPrice)}
      ${r.assistBlamed ? `<div style="font-size:11.5px;margin-top:4px;color:var(--danger);font-weight:800;">\u26d4 ${tdT('rBlamed')}</div>` : ''}
    </div>`).join('');
}

async function setAssistBlamed(val){""")

edit('\u0646\u0635\u0648\u0635 \u0627\u0644\u062c\u0648\u0644\u0627\u062a',
"""    blameYes:  ['\u0623\u064a\u0648\u0647 \u2014 \u0627\u062e\u0635\u0645 \u0646\u0635\u064a\u0628\u0647',      'Yes \u2014 deduct their share'],""",
"""    blameYes:  ['\u0623\u064a\u0648\u0647 \u2014 \u0627\u062e\u0635\u0645 \u0646\u0635\u064a\u0628\u0647',      'Yes \u2014 deduct their share'],
    roundN:    ['\u0627\u0644\u0631\u062c\u0648\u0639',        'Return'],
    rComplaint:['\u0634\u0643\u0648\u0649 \u0627\u0644\u0639\u0645\u064a\u0644', 'Complaint'],
    rFault:    ['\u0627\u0644\u0639\u0637\u0644 \u0627\u0644\u0645\u0643\u062a\u0634\u0641', 'Fault found'],
    rTech:     ['\u0627\u0644\u0641\u0646\u064a',         'Technician'],
    rPoints:   ['\u2b50 \u0627\u0644\u0646\u0642\u0627\u0637',     '\u2b50 Points'],
    rPrice:    ['\u0627\u0644\u0633\u0639\u0631',         'Price'],
    rBlamed:   ['\u0627\u0644\u0645\u0633\u0627\u0639\u062f \u0627\u062a\u062e\u0635\u0645', 'Assistant deducted'],""")


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'dashboard.html'
    if not os.path.exists(path): sys.exit(f'\u274c \u0645\u0627\u0644\u0642\u064a\u062a\u0634 \u0627\u0644\u0645\u0644\u0641: {path}')
    src = open(path, encoding='utf-8').read()
    if 'assistBlamed' not in src: sys.exit('\u274c \u0634\u063a\u0651\u0644 patch-return-points.py \u0627\u0644\u0623\u0648\u0644.')
    if 'returnRounds' in src: print('\u2139\ufe0f  \u0645\u062a\u0639\u0645\u0644 \u0642\u0628\u0644 \u0643\u062f\u0647.'); return

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
