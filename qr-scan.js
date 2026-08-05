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

  // ⚠️ الملف المحلي الأول.
  //    كان بيتحمّل من الإنترنت وقت الاستخدام بس — ولو الشبكة
  //    بطيئة أو المصدر محجوب، الماسح بيقف. والنظام ده بيتستخدم
  //    أوفلاين كتير، فالاعتماد على مصدر خارجي وقت الحاجة غلط.
  //    الملف المحلي بيتخزّن مع باقي النظام في الكاش وبيشتغل
  //    من غير نت خالص.
  //    بنجرّب أكتر من اسم محلي: بعض الأنظمة بتفرّق بين الحروف
  //    الكبيرة والصغيرة في أسماء الملفات، والمكتبة بتتحمّل باسم
  //    jsQR.js من مصدرها. كده مفيش فرق مهما حفظتها إزاي.
  var JSQR_SOURCES = [
    'jsQR.js',                                                            // محلي
    'jsqr.min.js',                                                        // محلي (اسم بديل)
    'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js',      // احتياطي
    'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js'                           // احتياطي تاني
  ];
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
      '.ifs-btn:active{opacity:1;}',
      /* زرار التصوير — تحت الإطار، واضح بس مش مزاحم */
      '.ifs-shot{position:relative;margin-top:18px;font-family:inherit;font-size:14.5px;',
      '  font-weight:700;cursor:pointer;padding:12px 20px;border-radius:999px;',
      '  background:rgba(255,255,255,.14);color:#fff;border:1.5px solid rgba(255,255,255,.3);}',
      '.ifs-shot:active{background:rgba(255,255,255,.26);}',
      /* شاشة القص — بتظهر بس لو القراءة التلقائية فشلت */
      '#ifixCropOv{position:fixed;inset:0;z-index:99100;background:#000;display:flex;',
      '  flex-direction:column;}',
      '#ifixCropOv.hidden{display:none;}',
      '.ifs-cstage{position:relative;flex:1;overflow:hidden;touch-action:none;}',
      '.ifs-cstage img{position:absolute;user-select:none;-webkit-user-drag:none;}',
      /* التحديد: الخارج معتم عن طريق ظل ضخم، فالداخل بيبان لوحده */
      '.ifs-sel{position:absolute;border:2px solid #fff;border-radius:6px;',
      '  box-shadow:0 0 0 100vmax rgba(0,0,0,.6);cursor:move;}',
      '.ifs-sel i{position:absolute;inset-block-end:-16px;inset-inline-end:-16px;width:44px;height:44px;',
      '  border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;}',
      '.ifs-sel i:after{content:"";width:15px;height:15px;border:3px solid #111;',
      '  border-width:0 3px 3px 0;transform:rotate(-45deg);margin:-3px 4px 0 0;}',
      '.ifs-cbar{flex:none;display:flex;gap:10px;padding:14px 16px calc(16px + env(safe-area-inset-bottom));',
      '  background:#111;}',
      '.ifs-cbar button{flex:1;font-family:inherit;font-size:15.5px;font-weight:800;',
      '  padding:14px;border-radius:13px;border:none;cursor:pointer;}',
      '.ifs-cok{background:#fff;color:#111;}',
      '.ifs-ccancel{background:rgba(255,255,255,.14);color:#fff;}',
      '.ifs-ctip{position:absolute;inset-inline:0;inset-block-start:max(14px,env(safe-area-inset-top));',
      '  text-align:center;color:#fff;font-size:14px;font-weight:700;padding:0 20px;',
      '  text-shadow:0 1px 6px #000;pointer-events:none;}'
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
      '<div class="ifs-err" id="ifixScanErr"></div>' +
      '<button class="ifs-shot" id="ifixScanShot"></button>' +
      '<input type="file" id="ifixScanFile" accept="image/*" capture="environment" hidden>';
    document.body.appendChild(d);

    var cp = document.createElement('div');
    cp.id = 'ifixCropOv'; cp.className = 'hidden';
    cp.innerHTML =
      '<div class="ifs-cstage" id="ifixCropStage">' +
        '<img id="ifixCropImg" alt="">' +
        '<div class="ifs-sel" id="ifixCropSel"><i></i></div>' +
        '<div class="ifs-ctip" id="ifixCropTip"></div>' +
      '</div>' +
      '<div class="ifs-cbar">' +
        '<button class="ifs-ccancel" id="ifixCropCancel"></button>' +
        '<button class="ifs-cok" id="ifixCropOk"></button>' +
      '</div>';
    cp.style.display = '';
    document.body.appendChild(cp);
    wireCrop();
    document.getElementById('ifixScanX').onclick = close;

    // ⚠️ الطريق التاني: تصوير بالكاميرا الأصلية.
    //    القراءة الحية بتفشل كتير مع الباركود الصغير لأن الكاميرا
    //    مش بتركّز عليه من مسافة قريبة. كاميرا النظام عندها تركيز
    //    وماكرو حقيقيين، فالصورة بتطلع حادة والقراءة بتنجح.
    var shot = document.getElementById('ifixScanShot');
    var file = document.getElementById('ifixScanFile');
    shot.textContent = T('scan.shoot', '📷 مش راضي يقرا؟ صوّره');
    shot.onclick = function () { file.value = ''; file.click(); };
    file.onchange = function () {
      var f = file.files && file.files[0];
      if (f) decodeFile(f);
    };
  }

  // بيجرّب المصادر بالترتيب لحد ما واحد ينجح
  function loadOne(src) {
    return new Promise(function (res) {
      var el = document.createElement('script');
      el.src = src;
      el.onload  = function () { res(!!window.jsQR); };
      el.onerror = function () { res(false); };
      document.head.appendChild(el);
    });
  }
  async function loadJsQR() {
    if (window.jsQR) return true;
    for (var i = 0; i < JSQR_SOURCES.length; i++) {
      try { if (await loadOne(JSQR_SOURCES[i])) return true; } catch (e) {}
    }
    return false;
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
    var hint0 = document.getElementById('ifixScanHint');
    hint0.textContent = T('scan.hint', 'صوّب الكاميرا على الباركود اللي على الليبل');
    delete hint0.dataset.hinted;
    fail('');
    ov.classList.remove('hidden');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return fail(T('scan.noCam', 'الكاميرا مش متاحة في المتصفح ده.'));
    }

    try {
      // facingMode environment = الكاميرا الخلفية على الموبايل
      // باركود الليبل صغير (حوالي ١٢مم)، فمحتاجين دقة عالية
      // وتركيز مستمر. focusMode مش مدعوم في كل المتصفحات —
      // بنطلبه كتفضيل عشان ميرفضش الطلب كله لو مش موجود.
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: 'continuous' }]
        },
        audio: false
      });
      // نجرّب نفعّل التركيز المستمر بعد ما الكاميرا تفتح كمان
      try {
        var track = stream.getVideoTracks()[0];
        var caps  = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }
      } catch (e) {}
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
      if (!ok) return fail(T('scan.noLib',
        'قارئ الباركود مش موجود. حمّل ملف jsqr.min.js وحطه جنب ملفات النظام.'));
    }

    running = true;
    scanned = 0;
    startedAt = performance.now();
    loop();
  }

  var cvs = null, ctx = null, lastTry = 0, scanned = 0, startedAt = 0;

  async function loop() {
    if (!running) return;
    var vid = document.getElementById('ifixScanVid');
    if (!vid || vid.readyState < 2) { raf = requestAnimationFrame(loop); return; }

    // بنفحص ~8 مرات في الثانية بدل كل إطار — بيوفّر بطارية من غير
    // ما المستخدم يحس بفرق
    var now = performance.now();
    if (now - lastTry < 120) { raf = requestAnimationFrame(loop); return; }
    lastTry = now;

    // مرّت ٦ ثواني من غير قراءة؟ بنقول للمستخدم يعمل إيه بدل
    // ما يفضل مصوّب ومستني من غير أي إشارة
    if (startedAt && now - startedAt > 6000) {
      var hintEl = document.getElementById('ifixScanHint');
      if (hintEl && !hintEl.dataset.hinted) {
        hintEl.dataset.hinted = '1';
        hintEl.textContent = T('scan.tryCloser',
          'قرّب الموبايل من الباركود لحد ما يملا المربع، وثبّت إيدك شوية');
      }
    }

    var text = null;
    try {
      if (det) {
        var codes = await det.detect(vid);
        if (codes && codes.length) text = codes[0].rawValue;
      } else {
        if (!cvs) { cvs = document.createElement('canvas'); ctx = cvs.getContext('2d', { willReadFrequently: true }); }
        var w = vid.videoWidth, h = vid.videoHeight;
        if (!w || !h) { raf = requestAnimationFrame(loop); return; }
        scanned++;

        // ⚠️ بنجرّب قصّتين بالتبادل مش واحدة:
        //    الوسط المقرّب بيقرا الباركود الصغير من مسافة قريبة،
        //    والإطار الكامل بيمسكه لو المستخدم مصوّب بعيد شوية.
        //    القص الواحد كان بيفوّت الحالتين على التبادل.
        var full = (scanned % 2 === 0);
        var side, sx, sy;
        if (full) { side = Math.min(w, h); }
        else      { side = Math.floor(Math.min(w, h) * 0.55); }
        sx = Math.floor((w - side) / 2);
        sy = Math.floor((h - side) / 2);

        // بنحدّ حجم اللوحة: القراءة على صورة أكبر من ٧٠٠ نقطة
        // بطيئة من غير فايدة
        var out = Math.min(side, 700);
        cvs.width = out; cvs.height = out;
        ctx.drawImage(vid, sx, sy, side, side, 0, 0, out, out);
        var img = ctx.getImageData(0, 0, out, out);
        var r = window.jsQR(img.data, out, out, { inversionAttempts: 'attemptBoth' });
        if (r && r.data) text = r.data;
      }
    } catch (e) { /* إطار بايظ — نكمّل */ }

    if (text) return hit(String(text).trim());
    raf = requestAnimationFrame(loop);
  }

  // ============================================================
  // شاشة القص
  // ------------------------------------------------------------
  // بتظهر بس لو القراءة التلقائية فشلت. المستخدم بيحرّك المربع
  // على الباركود ويكبّره أو يصغّره، وإحنا بنقرا الجزء ده لوحده.
  //
  // كل الإحداثيات على الشاشة، وبنحوّلها لإحداثيات الصورة الأصلية
  // وقت القراءة بس — عشان الصورة من كاميرا الموبايل ممكن تكون
  // ٤٠٠٠ نقطة والشاشة ٤٠٠.
  // ============================================================
  var cropImg = null, cropFit = null, cropSel = { x:0, y:0, w:0, h:0 };

  function wireCrop() {
    var stage  = document.getElementById('ifixCropStage');
    var sel    = document.getElementById('ifixCropSel');
    var handle = sel.querySelector('i');

    document.getElementById('ifixCropCancel').textContent = T('scan.cancel', 'إلغاء');
    document.getElementById('ifixCropOk').textContent     = T('scan.readSel', 'اقرا المحدد');
    document.getElementById('ifixCropTip').textContent    =
      T('scan.cropTip', 'حرّك المربع على الباركود، واسحب الركن لتكبيره');

    var mode = null, sx = 0, sy = 0, s0 = null;

    function begin(e, m) {
      mode = m;
      var p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY;
      s0 = { x: cropSel.x, y: cropSel.y, w: cropSel.w, h: cropSel.h };
      e.preventDefault(); e.stopPropagation();
    }
    function move(e) {
      if (!mode || !cropFit) return;
      var p  = e.touches ? e.touches[0] : e;
      var dx = p.clientX - sx, dy = p.clientY - sy;
      if (mode === 'move') {
        cropSel.x = clamp(s0.x + dx, cropFit.x, cropFit.x + cropFit.w - cropSel.w);
        cropSel.y = clamp(s0.y + dy, cropFit.y, cropFit.y + cropFit.h - cropSel.h);
      } else {
        // مربع دايماً — الباركود مربع، والتحديد المستطيل بيضيّع منه
        var d    = Math.max(dx, dy);
        var maxW = Math.min(cropFit.x + cropFit.w - cropSel.x,
                            cropFit.y + cropFit.h - cropSel.y);
        var side = clamp(s0.w + d, 60, maxW);
        cropSel.w = cropSel.h = side;
      }
      paintSel();
      e.preventDefault();
    }
    function end() { mode = null; }

    sel.addEventListener('touchstart',  function(e){ begin(e,'move'); }, { passive:false });
    sel.addEventListener('mousedown',   function(e){ begin(e,'move'); });
    handle.addEventListener('touchstart', function(e){ begin(e,'size'); }, { passive:false });
    handle.addEventListener('mousedown',  function(e){ begin(e,'size'); });
    document.addEventListener('touchmove', move, { passive:false });
    document.addEventListener('mousemove', move);
    document.addEventListener('touchend', end);
    document.addEventListener('mouseup',  end);

    document.getElementById('ifixCropCancel').onclick = function(){ closeCrop(); };
    document.getElementById('ifixCropOk').onclick     = function(){ readSelection(); };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function paintSel() {
    var sel = document.getElementById('ifixCropSel');
    sel.style.left   = cropSel.x + 'px';
    sel.style.top    = cropSel.y + 'px';
    sel.style.width  = cropSel.w + 'px';
    sel.style.height = cropSel.h + 'px';
  }

  function openCrop(img) {
    cropImg = img;
    var ov    = document.getElementById('ifixCropOv');
    var stage = document.getElementById('ifixCropStage');
    var el    = document.getElementById('ifixCropImg');
    ov.classList.remove('hidden');

    // نحسب مقاس العرض بنفسنا بدل object-fit — عشان نعرف مكان
    // الصورة بالظبط ونحوّل الإحداثيات صح
    var box = stage.getBoundingClientRect();
    var W = img.naturalWidth, H = img.naturalHeight;
    var k = Math.min(box.width / W, box.height / H);
    var dw = Math.round(W * k), dh = Math.round(H * k);
    var dx = Math.round((box.width - dw) / 2), dy = Math.round((box.height - dh) / 2);

    el.src = img.src;
    el.style.left = dx + 'px'; el.style.top = dy + 'px';
    el.style.width = dw + 'px'; el.style.height = dh + 'px';
    cropFit = { x: dx, y: dy, w: dw, h: dh, k: k };

    // تحديد ابتدائي في النص، نص المساحة تقريباً
    var side = Math.round(Math.min(dw, dh) * 0.5);
    cropSel = { x: dx + (dw - side) / 2, y: dy + (dh - side) / 2, w: side, h: side };
    paintSel();
  }

  function closeCrop() {
    var ov = document.getElementById('ifixCropOv');
    if (ov) ov.classList.add('hidden');
    if (cropImg && cropImg.src) { try { URL.revokeObjectURL(cropImg.src); } catch (e) {} }
    cropImg = null; cropFit = null;
  }

  function readSelection() {
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
  }

  // قراءة صورة ملتقطة — بنجرّب أكتر من مقاس وقصّة، لأن الصورة
  // من كاميرا الموبايل كبيرة والباركود جواها جزء صغير
  async function decodeFile(f) {
    fail('');
    var hintEl = document.getElementById('ifixScanHint');
    if (hintEl) hintEl.textContent = T('scan.reading', 'بيقرا الصورة...');
    try {
      if (!window.jsQR && !(await loadJsQR())) {
        return fail(T('scan.noLib', 'قارئ الباركود مش موجود.'));
      }
      var bmp = await new Promise(function (res, rej) {
        var img = new Image();
        img.onload = function () { res(img); };
        img.onerror = function () { rej(new Error('image')); };
        img.src = URL.createObjectURL(f);
      });

      var c = document.createElement('canvas');
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
      }
      // القراءة التلقائية فشلت → نسيب المستخدم يحدد الباركود بنفسه
      // بدل ما نقوله "مقدرتش" ونسيبه واقف
      if (hintEl) hintEl.textContent = T('scan.hint', 'صوّب الكاميرا على الباركود');
      openCrop(bmp);
    } catch (e) {
      fail(T('scan.shotFail', 'مقدرتش أقرا الباركود من الصورة — قرّب أكتر وصوّر تاني.'));
    }
  }

  function hit(text) {
    if (!text) { raf = requestAnimationFrame(loop); return; }
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
    var cb = onHit;
    close();
    if (cb) { try { cb(text); } catch (e) { console.error('scan callback:', e); } }
  }

  function close() {
    closeCrop();
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
  // الماسح للموبايل بس. الكمبيوتر بيستخدم ماسح باركود سلكي —
  // وزرار كاميرا على شاشة مفيهاش كاميرا مفيدة بيشغل مساحة
  // ويلخبط الموظف.
  function scanUseful() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
      // pointer: coarse = شاشة لمس. الكمبيوتر حتى لو عليه كاميرا
      // بيطلع false — وده المطلوب.
      return !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    } catch (e) { return false; }
  }

  function mountButton(input, cb) {
    if (!input || input.dataset.ifsMounted) return;
    if (!scanUseful()) return;
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

  window.IFixScan = { open: open, close: close, mountButton: mountButton, scanUseful: scanUseful };
})();
