/* ============================================================
   I Fix Team — ماسح الباركود بالكاميرا
   ------------------------------------------------------------
   النظام عنده ماسح جاهز للماسحات السلكية (اللي بتكتب بسرعة وتضغط
   Enter). الملف ده بيضيف الكاميرا للموبايل، وبيسلّم النص المقروء
   للصفحة عشان تدوّر بيه بمنطقها هي — مش بيعمل مطابقة من عنده.

   ليه jsQR مش BarcodeDetector؟
     BarcodeDetector مدمجة في المتصفح ومفيهاش مكتبة، بس Safari على
     iOS مبيدعمهاش. ومعظم الفنيين على آيفون. فبنستخدمها لو موجودة
     (أسرع وأدق) وبنرجع لـ jsQR لو مش موجودة.

   الاستخدام:
     IFixScan.open(text => { ... })       // callback بالنص المقروء
     IFixScan.mountButton(inputEl, cb)    // بيحط زرار كاميرا جنب خانة بحث

   ⚠️ الكاميرا محتاجة HTTPS. Cloudflare Pages شغال HTTPS فتمام،
      بس لو جرّبت من ملف محلي مش هتشتغل.
   ============================================================ */
(function () {
  'use strict';
  if (window.IFixScan) return;

  var JSQR_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
  var stream = null, raf = null, det = null, onHit = null, running = false;

  function T(key, fallback) {
    try { if (window.t) { var v = t(key); if (v && v !== key) return v; } } catch (e) {}
    return fallback;
  }

  // ===== الشكل =====
  function injectCss() {
    if (document.getElementById('ifixScanCss')) return;
    var s = document.createElement('style');
    s.id = 'ifixScanCss';
    s.textContent = [
      '#ifixScanOv{position:fixed;inset:0;z-index:99000;background:#000;display:flex;',
      '  flex-direction:column;align-items:center;justify-content:center;}',
      '#ifixScanOv.hidden{display:none;}',
      '#ifixScanOv video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}',
      /* الإطار: بيقول للمستخدم يحط الكود فين — أهم عنصر في الشاشة */
      '.ifs-frame{position:relative;width:min(74vw,300px);aspect-ratio:1;border-radius:22px;',
      '  box-shadow:0 0 0 100vmax rgba(0,0,0,.55);}',
      '.ifs-frame i{position:absolute;width:34px;height:34px;border:3px solid #fff;}',
      '.ifs-frame i:nth-child(1){inset-block-start:0;inset-inline-start:0;border-width:3px 0 0 3px;border-start-start-radius:20px;}',
      '.ifs-frame i:nth-child(2){inset-block-start:0;inset-inline-end:0;border-width:3px 3px 0 0;border-start-end-radius:20px;}',
      '.ifs-frame i:nth-child(3){inset-block-end:0;inset-inline-start:0;border-width:0 0 3px 3px;border-end-start-radius:20px;}',
      '.ifs-frame i:nth-child(4){inset-block-end:0;inset-inline-end:0;border-width:0 3px 3px 0;border-end-end-radius:20px;}',
      '.ifs-hint{position:relative;color:#fff;font-family:inherit;font-size:15px;font-weight:700;',
      '  text-align:center;margin-top:26px;padding:0 24px;line-height:1.8;text-shadow:0 1px 6px rgba(0,0,0,.7);}',
      '.ifs-err{position:relative;color:#FCA5A5;font-size:14px;text-align:center;margin-top:10px;padding:0 30px;line-height:1.9;}',
      '.ifs-x{position:absolute;inset-block-start:max(14px,env(safe-area-inset-top));inset-inline-end:14px;',
      '  width:46px;height:46px;border-radius:50%;border:none;background:rgba(255,255,255,.16);',
      '  color:#fff;font-size:24px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
      /* زرار الكاميرا اللي بيتحط جنب خانة البحث */
      '.ifs-btn{flex:none;width:44px;height:44px;border-radius:12px;cursor:pointer;',
      '  display:inline-flex;align-items:center;justify-content:center;font-size:20px;',
      '  background:transparent;border:none;color:inherit;opacity:.75;}',
      '.ifs-btn:active{opacity:1;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function injectDom() {
    if (document.getElementById('ifixScanOv')) return;
    var d = document.createElement('div');
    d.id = 'ifixScanOv';
    d.className = 'hidden';
    d.innerHTML =
      '<video id="ifixScanVid" playsinline muted autoplay></video>' +
      '<button class="ifs-x" id="ifixScanX" aria-label="close">\u00d7</button>' +
      '<div class="ifs-frame"><i></i><i></i><i></i><i></i></div>' +
      '<div class="ifs-hint" id="ifixScanHint"></div>' +
      '<div class="ifs-err" id="ifixScanErr"></div>';
    document.body.appendChild(d);
    document.getElementById('ifixScanX').onclick = close;
  }

  function loadJsQR() {
    if (window.jsQR) return Promise.resolve(true);
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = JSQR_CDN;
      s.onload = function () { res(!!window.jsQR); };
      s.onerror = function () { res(false); };
      document.head.appendChild(s);
    });
  }

  function fail(msg) {
    var e = document.getElementById('ifixScanErr');
    if (e) e.textContent = msg;
  }

  // ===== الفتح =====
  async function open(cb) {
    injectCss(); injectDom();
    onHit = cb;
    var ov = document.getElementById('ifixScanOv');
    var vid = document.getElementById('ifixScanVid');
    document.getElementById('ifixScanHint').textContent =
      T('scan.hint', 'صوّب الكاميرا على الباركود اللي على الليبل');
    fail('');
    ov.classList.remove('hidden');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return fail(T('scan.noCam', 'الكاميرا مش متاحة في المتصفح ده.'));
    }

    try {
      // facingMode environment = الكاميرا الخلفية على الموبايل
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false
      });
    } catch (e) {
      var m = (e && e.name) === 'NotAllowedError'
        ? T('scan.denied', 'الكاميرا مرفوضة. افتح إعدادات المتصفح واسمح بالكاميرا للموقع ده.')
        : T('scan.noCam', 'مش قادرين نفتح الكاميرا.');
      return fail(m);
    }

    vid.srcObject = stream;
    try { await vid.play(); } catch (e) {}

    // BarcodeDetector لو موجودة (أندرويد/كروم) — أسرع وأدق من jsQR
    det = null;
    try {
      if (window.BarcodeDetector) {
        var fmts = await BarcodeDetector.getSupportedFormats();
        if (fmts.indexOf('qr_code') >= 0) det = new BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch (e) { det = null; }

    if (!det) {
      var ok = await loadJsQR();
      if (!ok) return fail(T('scan.noLib', 'مش قادرين نحمّل قارئ الباركود — اتأكد من النت.'));
    }

    running = true;
    loop();
  }

  var cvs = null, ctx = null, lastTry = 0;

  async function loop() {
    if (!running) return;
    var vid = document.getElementById('ifixScanVid');
    if (!vid || vid.readyState < 2) { raf = requestAnimationFrame(loop); return; }

    // بنفحص ~8 مرات في الثانية بدل كل إطار — بيوفّر بطارية من غير
    // ما المستخدم يحس بفرق
    var now = performance.now();
    if (now - lastTry < 120) { raf = requestAnimationFrame(loop); return; }
    lastTry = now;

    var text = null;
    try {
      if (det) {
        var codes = await det.detect(vid);
        if (codes && codes.length) text = codes[0].rawValue;
      } else {
        if (!cvs) { cvs = document.createElement('canvas'); ctx = cvs.getContext('2d', { willReadFrequently: true }); }
        // بنقص النص من وسط الصورة بس — أسرع، وبيمنع قراءة كود جنبي بالغلط
        var w = vid.videoWidth, h = vid.videoHeight;
        if (!w || !h) { raf = requestAnimationFrame(loop); return; }
        var side = Math.floor(Math.min(w, h) * 0.7);
        cvs.width = side; cvs.height = side;
        ctx.drawImage(vid, (w - side) / 2, (h - side) / 2, side, side, 0, 0, side, side);
        var img = ctx.getImageData(0, 0, side, side);
        var r = window.jsQR(img.data, side, side, { inversionAttempts: 'attemptBoth' });
        if (r && r.data) text = r.data;
      }
    } catch (e) { /* إطار بايظ — نكمّل */ }

    if (text) return hit(String(text).trim());
    raf = requestAnimationFrame(loop);
  }

  function hit(text) {
    if (!text) { raf = requestAnimationFrame(loop); return; }
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
    var cb = onHit;
    close();
    if (cb) { try { cb(text); } catch (e) { console.error('scan callback:', e); } }
  }

  function close() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} stream = null; }
    var vid = document.getElementById('ifixScanVid');
    if (vid) { try { vid.pause(); vid.srcObject = null; } catch (e) {} }
    var ov = document.getElementById('ifixScanOv');
    if (ov) ov.classList.add('hidden');
    onHit = null; det = null;
  }

  // زرار كاميرا جنب خانة بحث. بيتحط في نفس أب الخانة عشان يبان جوها.
  function mountButton(input, cb) {
    if (!input || input.dataset.ifsMounted) return;
    injectCss();
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ifs-btn';
    b.title = T('scan.btn', 'مسح باركود');
    b.setAttribute('aria-label', T('scan.btn', 'مسح باركود'));
    b.textContent = '\u2b1a';                      // مربع منقّط — أوضح من رمز كاميرا صغير
    b.onclick = function (e) { e.preventDefault(); open(cb); };
    (input.parentElement || input).appendChild(b);
    input.dataset.ifsMounted = '1';
    return b;
  }

  // الإغلاق بالرجوع للخلف على الموبايل
  window.addEventListener('popstate', function () { if (running) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && running) close(); });

  window.IFixScan = { open: open, close: close, mountButton: mountButton };
})();
