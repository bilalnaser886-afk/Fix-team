#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
باتش dashboard.html — الهامش الأبيض حوالين باركود الليبل (quiet zone).

الخلفية:
  مكتبة qrcodejs بترسم مصفوفة الكود بس، من غير أي هامش. الليبل كان
  معتمد على الحشو الخارجي وحده:
      على الجنب  = pad          = 1.13مم ≈ ٢.٤ مربع
      من تحت     = brandMargin  = 0.55مم ≈ ١.٢ مربع   ← الأسوأ
  والمواصفة بتفرض ٤ مربعات على كل ناحية. كود الجهاز
  ('dev_' + ١٣ رقم = ١٧ بايت, ECC-M) = نسخة ٢ = ٢٥×٢٥ مربع.

المعادلة:
  عايزين  quiet + pad = 4 × مربع  و  مربع = (qrSz - 2·quiet) / 25
  الحل:   quiet = (4·qrSz - 25·pad) / 33

  على ليبل 37×25:  quiet = 0.58مم ، الكود يصغّر لـ 10.67مم ،
  المربع = 0.43مم = 3.4 نقطة على طابعة 203dpi (كان 3.8).
  خسارة بسيطة في حجم المربع مقابل هامش مطابق للمواصفة —
  والهامش الناقص رفض قاطع، والمربع الأصغر تدهور تدريجي بس.
"""
import sys, io

PATH = 'dashboard.html'
EDITS = []


def edit(name, old, new):
    EDITS.append((name, old, new))


# ============================================================
# ١) الطباعة الصامتة (renderLabelImage) — المسار الأساسي
# ============================================================
edit(
    'renderLabelImage: quiet zone',
    """  const brandMargin = mm(sz.h * 0.022);
  const qrBoxH = qrSz + brandMargin + fBrand;
  const qrX = W - pad - qrSz;
  const qrY = topMid - qrBoxH / 2;
  const qrImg = await loadImg((await hiResQr(d.id, Math.round(qrSz) * S * 2)) || qrDataUrl);
  if(qrImg) x.drawImage(qrImg, qrX, qrY, qrSz, qrSz);""",
    """  // ⚠️ الهامش الأبيض حوالين الكود (quiet zone).
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
                               qrSz - qrQuiet * 2, qrSz - qrQuiet * 2);"""
)

# ============================================================
# ٢) نافذة الطباعة العادية (browserPrintLabel) — نفس المعادلة
#    لازم الاتنين يتطابقوا وإلا الليبل يطلع مختلف حسب المسار
# ============================================================
edit(
    'browserPrintLabel: compute quiet zone',
    """  const fBrand= Math.max(1.4, sz.h * 0.088 * k).toFixed(2);   // اسم I FIX TEAM تحت الباركود""",
    """  const fBrand= Math.max(1.4, sz.h * 0.088 * k).toFixed(2);   // اسم I FIX TEAM تحت الباركود

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
  const brandGap = Math.max(sz.h * 0.022, parseFloat(pad)).toFixed(2);"""
)

edit(
    'browserPrintLabel: .qr padding',
    """  .qr{ width:${qrSz}mm; height:${qrSz}mm; }""",
    """  .qr{ width:${qrSz}mm; height:${qrSz}mm; padding:${qrQuiet}mm; background:#fff; }"""
)

edit(
    'browserPrintLabel: brand margin',
    """    letter-spacing:.15mm; margin-top:${(sz.h*0.022).toFixed(2)}mm;""",
    """    letter-spacing:.15mm; margin-top:${brandGap}mm;"""
)

# ============================================================
# ٣) معاينة الليبل على الشاشة
#    الموظف أحياناً بيمسح من على شاشة كمبيوتر زميله
# ============================================================
edit(
    'renderLabelImage: fit text to free width',
    '  const infoH = rows.reduce((sum, r) => sum + r.f * 1.3, 0);\n  let ry = topMid - infoH / 2;',
    "  // ⚠️ مقاسات الخط محسوبة من ارتفاع الليبل بس، مالهاش أي علاقة\n  //    بطول النص الفعلي. والنتيجة إن ليبل باسم قصير ('الساحر')\n  //    بيسيب نص الليبل فاضي والحروف أصغر من اللازم.\n  //    وعلى طابعة ٢٠٣ نقطة الحجم هو الوضوح بعينه: حرف ٢.٢مم =\n  //    ١٨ نقطة، و٢.٩مم = ٢٣ نقطة — فرق واضح في حروف العربي.\n  //    بنكبّر كل السطور بنفس النسبة لحد ما توصل لحد العرض أو\n  //    الارتفاع، أيهما أقرب.\n  //    الحد الأدنى ١ — يعني مابنصغّرش أبداً، والنص الطويل بيفضل\n  //    يتقص بالنقط زي ما هو. والسقف ١.٣٥ عشان الشكل مايختلش.\n  let kFit = 1;\n  try{\n    let wK = Infinity;\n    for(const r of rows){\n      if(!r.t) continue;\n      setFont(r.w, r.f, r.fam);\n      const tw = x.measureText(r.t).width;\n      if(tw > 0) wK = Math.min(wK, infoW / tw);\n    }\n    if(!isFinite(wK)) wK = 1;\n    const baseH = rows.reduce((sum, r) => sum + r.f * 1.3, 0);\n    const hK = baseH > 0 ? (topBottom - pad) / baseH : 1;\n    kFit = Math.max(1, Math.min(hK, wK, 1.35));\n  }catch(e){ kFit = 1; }\n  if(kFit > 1.01) for(const r of rows) r.f *= kFit;\n\n  const infoH = rows.reduce((sum, r) => sum + r.f * 1.3, 0);\n  let ry = topMid - infoH / 2;"
)

edit(
    'preview: white frame',
    """  #qrHolder{display:flex; justify-content:center; margin:10px 0;}""",
    """  /* الخلفية البيضا والحشو = الهامش المطلوب للقراءة (quiet zone)،
     عشان المعاينة على الشاشة تتمسح زي الليبل المطبوع */
  #qrHolder{display:flex; justify-content:center; margin:10px 0;}
  #qrHolder img, #qrHolder canvas{background:#fff; padding:12px; box-sizing:content-box;}"""
)


def main():
    with io.open(PATH, encoding='utf-8') as f:
        src = f.read()
    original = src

    for name, old, new in EDITS:
        n = src.count(old)
        if n != 1:
            print('✗ [%s] لقيت %d نسخة — المفروض واحدة. وقفت من غير ما أكتب.' % (name, n))
            sys.exit(1)
        src = src.replace(old, new, 1)
        print('✓ %s' % name)

    if src == original:
        print('✗ مفيش أي تغيير حصل')
        sys.exit(1)

    with io.open(PATH, 'w', encoding='utf-8') as f:
        f.write(src)
    print('\nتم — %d تعديل على %s' % (len(EDITS), PATH))


if __name__ == '__main__':
    main()
