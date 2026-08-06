#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-tech-devices-all.py
صفحة أجهزة الفني: تعرض كل جهاز اشتغل عليه — بنقاط أو بصفر

المشكلة:
  في renderTechEval الحلقة بتاعة الحساب بتقول:

      const pts = parseFloat(enDigits(d.points)) || 0;
      if(!pts || !d.technician) return;      // ← الجهاز بصفر بيتشال خالص

  فالجهاز اللي نقطه صفر مبيدخلش contrib، وبالتالي مبيوصلش لـ r.items
  اللي صفحة الفني بتعرضها. يعني الغلطة اللي انت عايز تلاقيها (جهاز
  خلص ومحدش حطّله نقاط) هي بالظبط اللي متخبّية.

  وفيه تناقض قايم كمان: الجدول بيعرض count = mine.length (كل الأجهزة
  اللي خلصها)، وعنوان الصفحة بيعرض items.length (اللي ليها نقاط بس).
  فالجدول يقول ١٠ وتدوس تلاقي ٦.

الإصلاح — تلات تعديلات:
  ١) قايمة تانية مستقلة (contribAll) فيها كل جهاز للفني، بأي نقاط.
     حلقة منفصلة تماماً عن حلقة الحساب — الأرقام في الجدول ما تتغيّرش
     بحرف واحد. ده مقصود: إحنا بنزوّد رؤية، مش بنعيد حساب.
  ٢) الصفحة بتعرض allItems بدل items، والصفر بيتعلّم عليه بوضوح،
     والأجهزة اللي عليها ملاحظة بتطلع فوق.
  ٣) شريط ملخّص فوق: كام جهاز · كام ليهم نقاط · كام بصفر.

  التمييز مهم: الصفر نوعان.
     ⚠️ صفر     = حد نسي — دي الغلطة
     📦 جملة    = بدون نقاط بالتصميم (زرار "جملة" نفسه بيقول كده)
     ↩️ مرتجع   = الجهاز رجع، الأصلي بصفر عليه والبديل بياخد نقاطه

الاستخدام:  python3 patch-tech-devices-all.py dashboard.html
"""

import sys, shutil, os, datetime

# ============================================================
# (١) CSS
# ============================================================
CSS_OLD = """  .td-pts-share{font-size:11px; color:var(--muted); margin-top:2px;}"""

CSS_NEW = """  .td-pts-share{font-size:11px; color:var(--muted); margin-top:2px;}
  /* ===== \u0623\u062c\u0647\u0632\u0629 \u0627\u0644\u0641\u0646\u064a: \u062a\u0645\u064a\u064a\u0632 \u0627\u0644\u0644\u064a \u0645\u0627\u062a\u062d\u0633\u0628\u0634 ===== */
  .td-item.is-zero{border-color:var(--warn-border); background:var(--warn-tint);}
  .td-item.is-muted{opacity:.72;}
  .td-item.is-zero .td-pts-num{color:var(--warn);}
  .td-item.is-muted .td-pts-num{color:var(--muted-2);}
  .td-flag{display:inline-block; font-size:10.5px; font-weight:800; border-radius:6px;
           padding:2px 7px; margin-top:5px; line-height:1.6;}
  .td-flag.zero{color:var(--warn-strong); background:var(--warn-bg); border:1px solid var(--warn-border);}
  .td-flag.info{color:var(--muted); background:var(--surface-3); border:1px solid var(--border);}
  .td-sum{display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;}
  .td-sum-box{flex:1; min-width:84px; text-align:center; background:var(--surface);
              border:1px solid var(--border); border-radius:11px; padding:9px 6px;}
  .td-sum-box.warn{border-color:var(--warn-border); background:var(--warn-tint);}
  .td-sum-n{font-family:'Cairo',sans-serif; font-weight:900; font-size:19px; color:var(--ink); line-height:1.1;}
  .td-sum-box.warn .td-sum-n{color:var(--warn);}
  .td-sum-l{font-size:10px; color:var(--muted-2); margin-top:2px;}"""


# ============================================================
# (٢) بناء القايمة الشاملة — حلقة منفصلة، مش بتلمس الحساب
# ============================================================
LOOP_OLD = """  // \u0627\u0644\u0623\u062c\u0647\u0632\u0629 \u0627\u0644\u0644\u064a \u062e\u0644\u0635\u062a \u0641\u064a \u0627\u0644\u0641\u062a\u0631\u0629 (\u0628\u063a\u0636 \u0627\u0644\u0646\u0638\u0631 \u0639\u0646 \u0627\u0644\u0646\u0642\u0627\u0637)
  const completedInRange = devices.filter(d => { const cd = completionDate(d); return cd && inTeRange(cd); });"""

LOOP_NEW = """  // ============================================================
  // \u0642\u0627\u064a\u0645\u0629 \u0635\u0641\u062d\u0629 \u0627\u0644\u0641\u0646\u064a \u2014 \u0643\u0644 \u062c\u0647\u0627\u0632 \u0627\u0634\u062a\u063a\u0644 \u0639\u0644\u064a\u0647\u060c \u0628\u0646\u0642\u0627\u0637 \u0623\u0648 \u0628\u0635\u0641\u0631
  // ------------------------------------------------------------
  // \u062d\u0644\u0642\u0629 \u0645\u0633\u062a\u0642\u0644\u0629 \u062a\u0645\u0627\u0645\u0627\u064b \u0639\u0646 \u062d\u0633\u0627\u0628 \u0627\u0644\u0646\u0642\u0627\u0637 \u0641\u0648\u0642 \u2014 \u0648\u062f\u0647 \u0645\u0642\u0635\u0648\u062f.
  // \u0627\u0644\u0623\u0631\u0642\u0627\u0645 \u0641\u064a \u0627\u0644\u062c\u062f\u0648\u0644 \u0645\u0627 \u062a\u062a\u063a\u064a\u0651\u0631\u0634 \u0628\u062d\u0631\u0641: \u0625\u062d\u0646\u0627 \u0628\u0646\u0632\u0648\u0651\u062f \u0631\u0624\u064a\u0629\u060c
  // \u0645\u0634 \u0628\u0646\u0639\u064a\u062f \u062d\u0633\u0627\u0628. \u0627\u0644\u0647\u062f\u0641: \u0627\u0644\u062c\u0647\u0627\u0632 \u0627\u0644\u0644\u064a \u062e\u0644\u0635 \u0648\u0645\u062d\u062f\u0634 \u062d\u0637\u0651\u0644\u0647
  // \u0646\u0642\u0627\u0637 \u064a\u0628\u0627\u0646 \u0628\u062f\u0644 \u0645\u0627 \u064a\u062a\u0634\u0627\u0644 \u0645\u0646 \u0627\u0644\u0642\u0627\u064a\u0645\u0629.
  //
  // flag:  ''         \u0627\u062a\u062d\u0633\u0628 \u0639\u0627\u062f\u064a
  //        'zero'     \u062e\u0644\u0635 \u0648\u0645\u0627\u0641\u064a\u0634 \u0646\u0642\u0627\u0637  \u2190 \u062f\u064a \u0627\u0644\u063a\u0644\u0637\u0629
  //        'wholesale' \u062c\u0645\u0644\u0629 \u2014 \u0628\u062f\u0648\u0646 \u0646\u0642\u0627\u0637 \u0628\u0627\u0644\u062a\u0635\u0645\u064a\u0645
  //        'returned' \u0627\u0644\u062c\u0647\u0627\u0632 \u0631\u062c\u0639 \u0628\u0639\u062f \u0627\u0644\u062a\u0633\u0644\u064a\u0645
  // ============================================================
  const contribAll = {};
  const pushAll = (name, d, share, role, flag) => {
    if(!name) return;
    (contribAll[name] = contribAll[name] || []).push({ d, share, role, flag });
  };

  devices.forEach(d => {
    const cd = completionDate(d);
    if(!cd || !inTeRange(cd)) return;          // \u0646\u0641\u0633 \u0646\u0637\u0627\u0642 \u0627\u0644\u0641\u062a\u0631\u0629 \u0628\u0627\u0644\u0638\u0628\u0637

    if(returnAfterDeliveryDate(d)){
      const rpts = parseFloat(enDigits(d.returnPoints)) || 0;
      if(d.substituteTechnician){
        pushAll(d.substituteTechnician, d, d.isWholesale ? 0 : rpts, '\u0628\u062f\u064a\u0644',
                d.isWholesale ? 'wholesale' : (rpts ? '' : 'zero'));
      }
      // \u0627\u0644\u0641\u0646\u064a \u0627\u0644\u0623\u0635\u0644\u064a \u0628\u064a\u0627\u062e\u062f \u0635\u0641\u0631 \u0639\u0644\u0649 \u0627\u0644\u0631\u0627\u062c\u0639 \u2014 \u0644\u0643\u0646 \u0644\u0627\u0632\u0645 \u064a\u0628\u0627\u0646 \u0641\u064a \u0642\u0627\u064a\u0645\u062a\u0647
      if(d.technician) pushAll(d.technician, d, 0, '\u0631\u0626\u064a\u0633\u064a', 'returned');
      return;
    }

    const pts  = d.isWholesale ? 0 : (parseFloat(enDigits(d.points)) || 0);
    const flag = d.isWholesale ? 'wholesale' : (pts ? '' : 'zero');
    const pct  = Math.min(100, Math.max(0, parseFloat(enDigits(d.assistPercent)) || 0));

    if(d.assistTechnician && pct > 0){
      const assistShare = pts * (pct / 100);
      pushAll(d.assistTechnician, d, assistShare, '\u0645\u0633\u0627\u0639\u062f', flag);
      pushAll(d.technician,       d, pts - assistShare, '\u0631\u0626\u064a\u0633\u064a', flag);
    } else {
      pushAll(d.technician, d, pts, '\u0631\u0626\u064a\u0633\u064a', flag);
    }
  });

  // \u0627\u0644\u0623\u062c\u0647\u0632\u0629 \u0627\u0644\u0644\u064a \u062e\u0644\u0635\u062a \u0641\u064a \u0627\u0644\u0641\u062a\u0631\u0629 (\u0628\u063a\u0636 \u0627\u0644\u0646\u0638\u0631 \u0639\u0646 \u0627\u0644\u0646\u0642\u0627\u0637)
  const completedInRange = devices.filter(d => { const cd = completionDate(d); return cd && inTeRange(cd); });"""


# ============================================================
# (٣) نضيف allItems للصف
# ============================================================
ROW_OLD = """      items,
      count: mine.length,"""

ROW_NEW = """      items,
      allItems: contribAll[techName] || [],
      count: mine.length,"""


# ============================================================
# (٤) العرض
# ============================================================
VIEW_OLD = """let _openTechDevName = null;
function openTechDevices(techName){
  const r = (teRows || []).find(x => x.t === techName);
  if(!r) return;
  _openTechDevName = techName;
  const round1 = n => Math.round(n * 10) / 10;
  const items = r.items.slice().sort((a,b) => b.share - a.share);
  const roleLabel = x => x.role === '\u0645\u0633\u0627\u0639\u062f' ? `\U0001f91d ${t('te.assistant')}` : x.role === '\u0628\u062f\u064a\u0644' ? `\U0001f501 ${t('te.substitute')}` : `\U0001f464 ${t('te.main')}`;
  const rows = items.length ? items.map(x => `
    <div class="td-item" onclick="openDetail('${x.d.id}')">
      <div class="td-item-info">
        <div class="td-item-name">${esc(x.d.deviceType)} ${esc(x.d.model)}</div>
        <div class="td-item-sub">${x.d.customerName ? esc(x.d.customerName) + ' \u00b7 ' : ''}${roleLabel(x)}${x.d.shopName ? ' \u00b7 ' + esc(x.d.shopName) : ''}</div>
      </div>
      <div class="td-item-pts">
        <div class="td-pts-num">${esc(x.d.points || '0')}</div>
        <div class="td-pts-lbl">${t('te.devicePoints')}</div>
        ${round1(x.share) !== (parseFloat(enDigits(x.d.points)) || 0) ? `<div class="td-pts-share">\u21b3 ${round1(x.share)}</div>` : ''}
      </div>
    </div>`).join('') : `<div class="empty-col">${t('te.noPoints')}</div>`;
  document.getElementById('techDevTitle').innerHTML = `\U0001f527 ${esc(r.t)} <span style="font-size:13px;font-weight:500;color:var(--muted-2);">(${items.length} ${t('te.deviceCount')} \u00b7 \u2b50 ${r.points})</span>`;
  document.getElementById('techDevBody').innerHTML = rows;
  document.getElementById('techDevOverlay').classList.remove('hidden');
}"""

VIEW_NEW = """let _openTechDevName = null;

// \u062a\u0631\u062c\u0645\u0629 \u0645\u062d\u0644\u064a\u0629 \u0644\u0644\u0634\u0627\u0634\u0629 \u062f\u064a \u2014 \u0623\u0633\u0637\u0631 \u0642\u0644\u064a\u0644\u0629 \u0645\u0627 \u062a\u0633\u062a\u0627\u0647\u0644\u0634 \u0644\u0645\u0633 i18n.js \u0627\u0644\u0645\u0634\u062a\u0631\u0643
function tdT(k){
  let en = false;
  try{ en = (typeof I18N !== 'undefined' && I18N.getLang() === 'en'); }catch(e){}
  const M = {
    total:     ['\u0625\u062c\u0645\u0627\u0644\u064a',            'Total'],
    scored:    ['\u0627\u062a\u062d\u0633\u0628',            'Scored'],
    zero:      ['\u0628\u0635\u0641\u0631 \u0646\u0642\u0627\u0637',       'Zero points'],
    flagZero:  ['\u26a0\ufe0f \u062e\u0644\u0635 \u0648\u0645\u0627\u0641\u064a\u0634 \u0646\u0642\u0627\u0637', '\u26a0\ufe0f Finished, no points'],
    flagWhole: ['\U0001f4e6 \u062c\u0645\u0644\u0629 \u2014 \u0628\u062f\u0648\u0646 \u0646\u0642\u0627\u0637', '\U0001f4e6 Wholesale \u2014 no points'],
    flagRet:   ['\u21a9\ufe0f \u0631\u062c\u0639 \u0628\u0639\u062f \u0627\u0644\u062a\u0633\u0644\u064a\u0645',  '\u21a9\ufe0f Returned after delivery'],
    none:      ['\u0645\u0641\u064a\u0634 \u0623\u062c\u0647\u0632\u0629 \u0641\u064a \u0627\u0644\u0641\u062a\u0631\u0629 \u062f\u064a', 'No devices in this period'],
  };
  return (M[k] || ['',''])[en ? 1 : 0];
}

function openTechDevices(techName){
  const r = (teRows || []).find(x => x.t === techName);
  if(!r) return;
  _openTechDevName = techName;
  const round1 = n => Math.round(n * 10) / 10;

  // \u0627\u0644\u0644\u064a \u0639\u0644\u064a\u0647 \u0645\u0644\u0627\u062d\u0638\u0629 \u064a\u0637\u0644\u0639 \u0641\u0648\u0642 \u2014 \u062f\u0647 \u0627\u0644\u0647\u062f\u0641 \u0645\u0646 \u0627\u0644\u0634\u0627\u0634\u0629 \u0623\u0635\u0644\u0627\u064b
  const rank = x => x.flag === 'zero' ? 0 : (x.flag ? 1 : 2);
  const items = (r.allItems || []).slice()
    .sort((a,b) => rank(a) - rank(b) || b.share - a.share);

  const nZero   = items.filter(x => x.flag === 'zero').length;
  const nScored = items.filter(x => !x.flag).length;

  const roleLabel = x => x.role === '\u0645\u0633\u0627\u0639\u062f' ? `\U0001f91d ${t('te.assistant')}` : x.role === '\u0628\u062f\u064a\u0644' ? `\U0001f501 ${t('te.substitute')}` : `\U0001f464 ${t('te.main')}`;
  const flagHtml = f =>
      f === 'zero'      ? `<div class="td-flag zero">${tdT('flagZero')}</div>`
    : f === 'wholesale' ? `<div class="td-flag info">${tdT('flagWhole')}</div>`
    : f === 'returned'  ? `<div class="td-flag info">${tdT('flagRet')}</div>`
    : '';

  const summary = items.length ? `
    <div class="td-sum">
      <div class="td-sum-box"><div class="td-sum-n">${items.length}</div><div class="td-sum-l">${tdT('total')}</div></div>
      <div class="td-sum-box"><div class="td-sum-n">${nScored}</div><div class="td-sum-l">${tdT('scored')}</div></div>
      <div class="td-sum-box ${nZero ? 'warn' : ''}"><div class="td-sum-n">${nZero}</div><div class="td-sum-l">${tdT('zero')}</div></div>
    </div>` : '';

  const rows = items.length ? items.map(x => {
    const shown = x.flag === 'wholesale' ? '\u2014' : esc(x.d.points || '0');
    const cls = x.flag === 'zero' ? ' is-zero' : (x.flag ? ' is-muted' : '');
    const showShare = !x.flag && round1(x.share) !== (parseFloat(enDigits(x.d.points)) || 0);
    return `
    <div class="td-item${cls}" onclick="openDetail('${x.d.id}')">
      <div class="td-item-info">
        <div class="td-item-name">${esc(x.d.deviceType)} ${esc(x.d.model)}</div>
        <div class="td-item-sub">${x.d.customerName ? esc(x.d.customerName) + ' \u00b7 ' : ''}${roleLabel(x)}${x.d.shopName ? ' \u00b7 ' + esc(x.d.shopName) : ''}</div>
        ${flagHtml(x.flag)}
      </div>
      <div class="td-item-pts">
        <div class="td-pts-num">${shown}</div>
        <div class="td-pts-lbl">${t('te.devicePoints')}</div>
        ${showShare ? `<div class="td-pts-share">\u21b3 ${round1(x.share)}</div>` : ''}
      </div>
    </div>`; }).join('') : `<div class="empty-col">${tdT('none')}</div>`;

  document.getElementById('techDevTitle').innerHTML = `\U0001f527 ${esc(r.t)} <span style="font-size:13px;font-weight:500;color:var(--muted-2);">(${items.length} ${t('te.deviceCount')} \u00b7 \u2b50 ${r.points})</span>`;
  document.getElementById('techDevBody').innerHTML = summary + rows;
  document.getElementById('techDevOverlay').classList.remove('hidden');
}"""


EDITS = [
    ('CSS \u2014 \u062a\u0645\u064a\u064a\u0632 \u0627\u0644\u0635\u0641\u0631 \u0648\u0634\u0631\u064a\u0637 \u0627\u0644\u0645\u0644\u062e\u0635', CSS_OLD, CSS_NEW),
    ('\u062d\u0644\u0642\u0629 \u0627\u0644\u0642\u0627\u064a\u0645\u0629 \u0627\u0644\u0634\u0627\u0645\u0644\u0629',        LOOP_OLD, LOOP_NEW),
    ('allItems \u0639\u0644\u0649 \u0627\u0644\u0635\u0641',            ROW_OLD, ROW_NEW),
    ('\u0639\u0631\u0636 \u0635\u0641\u062d\u0629 \u0627\u0644\u0641\u0646\u064a',            VIEW_OLD, VIEW_NEW),
]


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'dashboard.html'
    if not os.path.exists(path):
        sys.exit(f'\u274c \u0645\u0627\u0644\u0642\u064a\u062a\u0634 \u0627\u0644\u0645\u0644\u0641: {path}')

    src = open(path, encoding='utf-8').read()

    if 'contribAll' in src:
        print('\u2139\ufe0f  \u0627\u0644\u0628\u0627\u062a\u0634 \u0645\u062a\u0639\u0645\u0644 \u0642\u0628\u0644 \u0643\u062f\u0647 \u2014 \u0645\u0641\u064a\u0634 \u062d\u0627\u062c\u0629 \u0627\u062a\u063a\u064a\u0651\u0631\u062a.')
        return

    # \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0643\u0644 \u0627\u0644\u0623\u062c\u0632\u0627\u0621 \u0642\u0628\u0644 \u0623\u064a \u062a\u0639\u062f\u064a\u0644 \u2014 \u0643\u0644\u0647 \u064a\u0646\u062c\u062d \u0623\u0648 \u0645\u0641\u064a\u0634 \u062d\u0627\u062c\u0629 \u062a\u062a\u0644\u0645\u0633
    for label, old, _ in EDITS:
        n = src.count(old)
        if n != 1:
            sys.exit(f'\u274c "{label}": \u0644\u0642\u064a\u062a {n} \u0646\u0633\u062e\u0629 \u2014 \u0627\u0644\u0645\u0641\u0631\u0648\u0636 \u0648\u0627\u062d\u062f\u0629. \u0645\u062a\u0643\u0645\u0644\u0634.')

    bak = path + '.bak-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    shutil.copy2(path, bak)

    out = src
    for label, old, new in EDITS:
        out = out.replace(old, new)
        print(f'   \u2713 {label}')

    open(path, 'w', encoding='utf-8').write(out)
    print(f'\n\u2705 \u062a\u0645 \u2014 \u0646\u0633\u062e\u0629 \u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629: {bak}')
    print('   \u26a0\ufe0f  \u0632\u0648\u0651\u062f \u0631\u0642\u0645 \u0627\u0644\u0625\u0635\u062f\u0627\u0631 \u0641\u064a sw.js \u0642\u0628\u0644 \u0627\u0644\u0646\u0634\u0631.')


if __name__ == '__main__':
    main()
