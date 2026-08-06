#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
باتش qr-scan.js — إصلاح فشل قراءة الباركود من الصور الثابتة.

كل بديل بيتأكد إن النص الأصلي موجود **مرة واحدة بالظبط** قبل الاستبدال.
لو أي عدد اختلف، السكربت بيقف من غير ما يكتب أي حاجة.
"""
import sys, io

PATH = 'qr-scan.js'
EDITS = []


def edit(name, old, new):
    EDITS.append((name, old, new))


# ============================================================
# ١) حالة الزرار وهو بيقرا
# ============================================================
edit(
    'css: disabled state',
    """      '.ifs-cok{background:#fff;color:#111;}',
      '.ifs-ccancel{background:rgba(255,255,255,.14);color:#fff;}',""",
    """      '.ifs-cok{background:#fff;color:#111;}',
      '.ifs-ccancel{background:rgba(255,255,255,.14);color:#fff;}',
      '.ifs-cbar button:disabled{opacity:.5;}',"""
)

# ============================================================
# ٢) طبقة فك الترميز المشتركة — بتتحط قبل شاشة القص
# ============================================================
HELPERS = r"""  // ============================================================
  // فك الترميز من صورة ثابتة — الطبقة المشتركة
  // ------------------------------------------------------------
  // كل قراءة من صورة (تلقائية أو بتحديد يدوي) بتعدّي من هنا،
  // عشان أي تحسين يستفيد منه المسارين مع بعض.
  // ============================================================
  var dCvs = null, dCtx = null;
  function decCtx() {
    if (!dCvs) {
      dCvs = document.createElement('canvas');
      dCtx = dCvs.getContext('2d', { willReadFrequently: true });
    }
    return dCtx;
  }

  // بيسيب الواجهة تتنفس بين المحاولات — من غيره الشاشة بتتجمّد
  // وقت الحسبة والمستخدم بيفتكر إن التطبيق وقع
  function idle() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // الكاشف المدمج في المتصفح — أسرع وأشطر من jsQR لما يكون موجود.
  // undefined = لسه ما اتفحصش · null = مش متاح (سفاري/iOS)
  var bdet;
  async function ensureBdet() {
    if (bdet !== undefined) return bdet;
    bdet = null;
    try {
      if (window.BarcodeDetector) {
        var f = await BarcodeDetector.getSupportedFormats();
        if (f.indexOf('qr_code') >= 0) bdet = new BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch (e) { bdet = null; }
    return bdet;
  }
  async function stillDetect(src) {
    if (!(await ensureBdet())) return null;
    try {
      var codes = await bdet.detect(src);
      if (codes && codes.length) {
        var v = String(codes[0].rawValue || '').trim();
        if (v) return v;
      }
    } catch (e) {}
    return null;
  }

  // عتبة أوتسو: بتلاقي الفاصل الأمثل بين الأسود والأبيض من
  // الصورة نفسها بدل رقم ثابت
  function otsu(gray) {
    var hist = new Uint32Array(256), n = gray.length, i;
    for (i = 0; i < n; i++) hist[gray[i]]++;
    var sum = 0;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0, wB = 0, best = -1, thr = 128;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      var wF = n - wB;
      if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB, mF = (sum - sumB) / wF;
      var v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; thr = i; }
    }
    return thr;
  }

  // بيحوّل الصورة لأبيض وأسود صريح.
  // ⚠️ ضروري مع الليبل الحراري: بيبهت مع الوقت والحرارة، وصورة
  //    الموبايل في إضاءة المحل بيطلع فيها الأسود رمادي فاتح.
  function binarize(d) {
    var p = d.data, n = p.length >> 2, gray = new Uint8Array(n), i, j;
    for (i = 0; i < n; i++) {
      j = i << 2;
      gray[i] = (p[j] * 77 + p[j + 1] * 151 + p[j + 2] * 28) >> 8;
    }
    var thr = otsu(gray);
    for (i = 0; i < n; i++) {
      var v = gray[i] > thr ? 255 : 0;
      j = i << 2;
      p[j] = p[j + 1] = p[j + 2] = v; p[j + 3] = 255;
    }
    return d;
  }

  // بيقرا منطقة محددة من صورة. بيرجّع النص أو null.
  async function readRegion(img, sx, sy, sw, sh, sizes) {
    var IW = img.naturalWidth || img.width, IH = img.naturalHeight || img.height;
    if (!IW || !IH) return null;

    // نحبس المنطقة جوه حدود الصورة
    var x0 = clamp(sx, 0, IW - 2), y0 = clamp(sy, 0, IH - 2);
    var w0 = clamp(sw + (sx - x0), 8, IW - x0);
    var h0 = clamp(sh + (sy - y0), 8, IH - y0);

    var ctx = decCtx();
    for (var i = 0; i < sizes.length; i++) {
      var fit = Math.max(140, Math.min(sizes[i], 1200));
      var sc  = fit / Math.max(w0, h0);
      var iw  = Math.max(60, Math.round(w0 * sc));
      var ih  = Math.max(60, Math.round(h0 * sc));

      // ⚠️ الهامش الأبيض (quiet zone) — أهم سطر في الملف كله.
      //    مواصفة QR بتفرض ٤ مربعات أبيض فاضية حوالين الكود،
      //    وأي قارئ بيرفض الكود من غيرها حتى لو مرسوم مثالي.
      //
      //    الكود القديم كان بيرسم القصّة من حافة للحافة
      //    (drawImage ... 0, 0, out, out) فالهامش بيبقى صفر.
      //    والواجهة نفسها بتقول للمستخدم "حرّك المربع على
      //    الباركود" — يعني بتطلب منه بالظبط الحاجة اللي
      //    بتخلي القراءة تفشل. ده سبب رسالة "مفيش باركود في
      //    المربع" وهو شايف الباركود قدامه بعينه.
      //
      //    الهامش الصناعي هنا بيحل المشكلة كمان لو الليبل نفسه
      //    مطبوع على حرف الورقة من غير هامش.
      var q  = Math.max(20, Math.round(Math.max(iw, ih) * 0.15));
      var cw = iw + q * 2, ch = ih + q * 2;

      dCvs.width = cw; dCvs.height = ch;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cw, ch);
      // التنعيم مفيد وقت التصغير بس. وقت التكبير بيعمل تدرّج
      // رمادي على حواف المربعات ويصعّب على القارئ يفصلها.
      ctx.imageSmoothingEnabled = (iw < w0);
      try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
      ctx.drawImage(img, x0, y0, w0, h0, q, q, iw, ih);

      var byDet = await stillDetect(dCvs);
      if (byDet) return byDet;

      if (window.jsQR) {
        var d = ctx.getImageData(0, 0, cw, ch);
        var r = window.jsQR(d.data, cw, ch, { inversionAttempts: 'attemptBoth' });
        if (r && r.data) return String(r.data).trim();

        r = window.jsQR(binarize(d).data, cw, ch, { inversionAttempts: 'attemptBoth' });
        if (r && r.data) return String(r.data).trim();
      }

      await idle();
    }
    return null;
  }

"""

edit(
    'insert decode helpers',
    """  // ============================================================
  // شاشة القص
  // ------------------------------------------------------------""",
    HELPERS + """  // ============================================================
  // شاشة القص
  // ------------------------------------------------------------"""
)

# ============================================================
# ٣) قراءة التحديد اليدوي
# ============================================================
edit(
    'readSelection',
    """  function readSelection() {
    if (!cropImg || !cropFit) return;
    // من إحداثيات الشاشة لإحداثيات الصورة الأصلية
    var k  = cropFit.k;
    var sx = Math.max(0, (cropSel.x - cropFit.x) / k);
    var sy = Math.max(0, (cropSel.y - cropFit.y) / k);
    var sw = cropSel.w / k, sh = cropSel.h / k;

    var c = document.createElement('canvas');
    var x = c.getContext('2d', { willReadFrequently: true });

    // نجرّب تلات دقات: الباركود الصغير أحياناً بيتقرا أحسن مكبّر
    var outs = [Math.min(Math.round(sw), 1000), 700, 400];
    for (var i = 0; i < outs.length; i++) {
      var out = Math.max(200, outs[i]);
      c.width = out; c.height = out;
      x.imageSmoothingEnabled = true;
      x.drawImage(cropImg, sx, sy, sw, sh, 0, 0, out, out);
      var d = x.getImageData(0, 0, out, out);
      var r = window.jsQR(d.data, out, out, { inversionAttempts: 'attemptBoth' });
      if (r && r.data) {
        var val = String(r.data).trim();
        closeCrop();
        return hit(val);
      }
    }
    var tip = document.getElementById('ifixCropTip');
    if (tip) tip.textContent = T('scan.selFail', 'مفيش باركود في المربع — حرّكه أو كبّره وجرّب تاني');
  }""",
    """  async function readSelection() {
    if (!cropImg || !cropFit) return;
    var okBtn = document.getElementById('ifixCropOk');
    var tip   = document.getElementById('ifixCropTip');
    if (okBtn) okBtn.disabled = true;
    if (tip) tip.textContent = T('scan.reading', 'بيقرا الصورة...');
    await idle();          // فرصة للمتصفح يرسم الرسالة قبل الحسبة

    try {
      if (!window.jsQR) await loadJsQR();
      await ensureBdet();
      if (!window.jsQR && !bdet) {
        if (tip) tip.textContent = T('scan.noLib', 'قارئ الباركود مش موجود.');
        return;
      }
      // من إحداثيات الشاشة لإحداثيات الصورة الأصلية
      var k  = cropFit.k;
      var sx = (cropSel.x - cropFit.x) / k;
      var sy = (cropSel.y - cropFit.y) / k;
      var sw = cropSel.w / k, sh = cropSel.h / k;
      var base = Math.max(sw, sh);

      // ⚠️ بنجرّب التحديد زي ما هو، وبعدين موسّع ٢٠٪.
      //    المستخدم بيحاول يلزّق المربع على الباركود بالظبط،
      //    وساعات بيقص منه صف مربعات من غير ما ياخد باله —
      //    والقارئ بيرفض الكود الناقص كله مش بيكمّله.
      var grow = [0, 0.20];
      for (var g = 0; g < grow.length; g++) {
        var m = base * grow[g] / 2;
        var val = await readRegion(cropImg, sx - m, sy - m, sw + m * 2, sh + m * 2,
                                   [Math.min(Math.round(base), 900), 480]);
        if (val) { closeCrop(); return hit(val); }
      }
      if (tip) tip.textContent = T('scan.selFail',
        'مفيش باركود في المربع — سيب هامش أبيض حوالين الكود وجرّب تاني');
    } finally {
      if (okBtn) okBtn.disabled = false;
    }
  }"""
)

# ============================================================
# ٤) القراءة التلقائية من صورة ملتقطة
# ============================================================
edit(
    'decodeFile grid scan',
    """      var c = document.createElement('canvas');
      var x = c.getContext('2d', { willReadFrequently: true });
      var W = bmp.naturalWidth, H = bmp.naturalHeight;

      // من الكل للوسط: أول ما يقرا نقف
      var tries = [
        { s: 1.00, max: 1400 }, { s: 1.00, max: 900 },
        { s: 0.60, max: 900 },  { s: 0.35, max: 800 }
      ];
      for (var i = 0; i < tries.length; i++) {
        var t = tries[i];
        var side = Math.floor(Math.min(W, H) * t.s);
        var sx = Math.floor((W - side) / 2), sy = Math.floor((H - side) / 2);
        var out = Math.min(side, t.max);
        c.width = out; c.height = out;
        x.drawImage(bmp, sx, sy, side, side, 0, 0, out, out);
        var d = x.getImageData(0, 0, out, out);
        var r = window.jsQR(d.data, out, out, { inversionAttempts: 'attemptBoth' });
        if (r && r.data) { URL.revokeObjectURL(bmp.src); return hit(String(r.data).trim()); }
      }""",
    """      var W = bmp.naturalWidth, H = bmp.naturalHeight;

      // ① الكاشف المدمج على الصورة كلها بدقتها الأصلية
      var val = await stillDetect(bmp);

      // ② الصورة كاملة بمقاسين
      if (!val) val = await readRegion(bmp, 0, 0, W, H, [1100, 700]);

      // ③ الوسط مقرّب — أغلب الناس بتصوّب على الكود فعلاً
      if (!val) {
        var cs = Math.floor(Math.min(W, H) * 0.35);
        val = await readRegion(bmp, (W - cs) / 2, (H - cs) / 2, cs, cs, [640]);
      }

      // ④ ⚠️ شبكة ٣×٣ متداخلة — مش الوسط بس.
      //    الكود القديم كان بيقص من نص الصورة دايماً بأربع
      //    نسب مختلفة. لو الليبل في ركن — وده الطبيعي وانت
      //    ماسك الجهاز بإيد والموبايل بالتانية — القراءة
      //    التلقائية كانت مستحيل تنجح مهما قرّبت.
      //
      //    ⚠️ الخلية = نص الصورة بالظبط، مش نسبة من الضلع
      //    القصير. لو أخدناها من القصير، الخطوة على الضلع
      //    الطويل بتبقى أكبر من الخلية نفسها وبيفضل شريط
      //    مقطوع في النص محدش بيمر عليه. نص الصورة بيضمن
      //    تداخل ٥٠٪ وتغطية كاملة مهما كانت نسبة الأبعاد.
      if (!val) {
        var tw = Math.ceil(W / 2), th = Math.ceil(H / 2);
        // ceil مش floor: مع الأبعاد الفردية floor بتسيب بكسل
        // مقطوع على الحافة. readRegion بيحبس أي زيادة جوه الصورة.
        var stepX = Math.ceil((W - tw) / 2), stepY = Math.ceil((H - th) / 2);
        var cells = [];
        for (var gy = 0; gy < 3; gy++) {
          for (var gx = 0; gx < 3; gx++) cells.push([gx, gy]);
        }
        // من الوسط لبرّه
        cells.sort(function (a, b) {
          return (Math.abs(a[0] - 1) + Math.abs(a[1] - 1)) -
                 (Math.abs(b[0] - 1) + Math.abs(b[1] - 1));
        });
        for (var ci = 0; ci < cells.length && !val; ci++) {
          val = await readRegion(bmp, cells[ci][0] * stepX, cells[ci][1] * stepY,
                                 tw, th, [560]);
        }
      }
      if (val) { URL.revokeObjectURL(bmp.src); return hit(val); }"""
)

# ============================================================
# ٥) أمان: مانرجّعش لدورة الكاميرا وهي مقفولة
# ============================================================
edit(
    'cropTip fallback',
    """    document.getElementById('ifixCropTip').textContent    =
      T('scan.cropTip', 'حرّك المربع على الباركود، واسحب الركن لتكبيره');""",
    """    document.getElementById('ifixCropTip').textContent    =
      T('scan.cropTip', 'حط المربع على الباركود وسيب أبيض حواليه — اسحب الركن لتكبيره');"""
)

edit(
    'hit guard',
    """  function hit(text) {
    if (!text) { raf = requestAnimationFrame(loop); return; }""",
    """  function hit(text) {
    if (!text) { if (running) raf = requestAnimationFrame(loop); return; }"""
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
