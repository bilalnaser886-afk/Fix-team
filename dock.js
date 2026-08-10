/* ============================================================
   I Fix Team — رفّ العدة (Dock)
   ------------------------------------------------------------
   شريط واقف على جنب الشاشة تحت التوب بار، الأيقونات بانية فيه
   طول الوقت. تدوس على واحدة فتفتح لوحتها، وكروت النظام بتصغر
   وتروح للنص التاني — زي ما تكون فاتح تطبيقين جنب بعض.

   ⚠️ الشريط مش عارف أي أداة من نفسه — كل أداة بتسجّل نفسها:

        IFixDock.register({
          id:    'assist',
          icon:  '💬',
          title: 'محادثات العملاء',
          badge: () => 3,                  // اختياري
          render: (host) => { ... },       // مرة واحدة
          onShow: (host) => { ... }        // مع كل فتحة
        });

   كده الملف يشتغل في أي صفحة من غير تعديل.

   ⚠️ التوب بار position:sticky وجوه تدفّق الصفحة، فلما نزوّد حشو
      على body عشان المحتوى يصغر، التوب بار بيصغر معاه. بنرجّعه
      بهامش سالب مساوي — عشان يفضل بعرض الشاشة كامل والرف يبدأ
      من تحته.
   ============================================================ */
(function () {
  'use strict';
  if (window.IFixDock) return;

  var TOOLS = [], openId = null, expanded = false, built = false, _lastMain = true;
  var LS_OPEN = 'ifix-dock-open', LS_TOOL = 'ifix-dock-tool';
  var RAIL = 56;                       // عرض الرف — أتخن من النسخة الأولى
  var SPLIT_MIN = 760;                 // تحت كده القسمة مبتنفعش (شوف width())

  // عرض اللوحة. على شاشة صغيرة القسمة نص/نص بتسيب للكروت ١٤٠ بكسل
  // — مش صالحة للقراية. فبنخلي اللوحة تغطي، والمحتوى مايتزحلقش.
  function width() {
    var w = innerWidth;
    if (w < SPLIT_MIN) return { panel: w - RAIL, push: false };
    // ربع الشاشة. بحد أدنى ٣٠٠ عشان المحتوى جوه اللوحة يفضل مقروء،
    // وسقف ٤٦٠ عشان على شاشة عريضة ما تفضاش.
    var p = Math.round(w * 0.25);
    return { panel: Math.max(300, Math.min(p, 460)), push: true };
  }

  // ارتفاع التوب بار — بنقيسه مش بنفترضه: بيتغيّر مع
  // safe-area-inset-top على الأيفون ومع حجم الخط.
  function topOffset() {
    try {
      var tb = document.querySelector('.topbar');
      if (tb) return Math.round(tb.getBoundingClientRect().height);
    } catch (e) {}
    return 64;
  }

  function css() {
    if (document.getElementById('ifixDockCss')) return;
    var s = document.createElement('style');
    s.id = 'ifixDockCss';
    s.textContent = [
      ':root{--dk-rail:56px;--dk-panel:0px;}',

      /* ===== الرف ===== */
      /* ⚠️ 15 مش 30. التوب بار z-index:20 وبيعمل سياق تكديس خاص،
         والقايمة المنسدلة جواه — فأي رقم أعلى من 20 على الرف بيخلي
         الرف يركب على القايمة. تحت العشرين، والرف لسه فوق محتوى
         الصفحة العادي (z-index:auto). */
      '#dkRail{position:fixed;inset-inline-end:0;z-index:15;width:var(--dk-rail);',
      '  background:var(--surface-2);border-inline-start:1px solid var(--border);',
      '  display:flex;flex-direction:column;align-items:center;gap:6px;',
      '  padding:10px 0;overflow:visible;}',

      '.dk-ico{position:relative;width:40px;height:40px;flex:0 0 40px;border-radius:11px;',
      '  border:1px solid transparent;background:transparent;cursor:pointer;',
      '  font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;',
      '  color:var(--muted);transition:background .15s,border-color .15s;}',
      '.dk-ico:hover{background:var(--surface);border-color:var(--border);}',
      '.dk-ico:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}',

      /* العلامة: السلوت المفتوح بيكسر خط حد الرف، فالأيقونة واللوحة
         يقروا كسطح واحد — العدة المرفوعة من الرف. */
      '.dk-ico.act{background:var(--surface);border-color:var(--border);',
      '  border-inline-start-color:var(--surface);}',
      '.dk-ico.act::after{content:"";position:absolute;inset-inline-start:-7px;top:-1px;bottom:-1px;',
      '  width:8px;background:var(--surface);}',
      '.dk-ico.act::before{content:"";position:absolute;inset-inline-end:6px;top:9px;bottom:9px;',
      '  width:2px;border-radius:2px;background:var(--accent);}',

      '.dk-badge{position:absolute;top:-3px;inset-inline-start:-3px;min-width:16px;height:16px;',
      '  border-radius:9px;background:var(--danger,#DC2626);color:#fff;',
      '  font:900 10px/16px system-ui;text-align:center;padding:0 4px;}',

      /* ===== اللوحة ===== */
      '#dkPanel{position:fixed;inset-inline-end:var(--dk-rail);z-index:14;',
      '  width:var(--dk-panel);background:var(--surface);',
      '  border-inline-start:1px solid var(--border);',
      '  display:flex;flex-direction:column;overflow:hidden;',
      '  transition:width .22s cubic-bezier(.4,0,.2,1);}',
      '#dkPanel .dk-head{flex:0 0 auto;display:flex;align-items:center;gap:8px;',
      '  padding:11px 14px;border-bottom:1px solid var(--border);}',
      '#dkPanel .dk-t{font-family:"Cairo",sans-serif;font-weight:900;font-size:13px;',
      '  color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#dkPanel .dk-x{margin-inline-start:auto;background:none;border:none;cursor:pointer;',
      '  color:var(--muted);font-size:17px;line-height:1;padding:4px 6px;border-radius:7px;}',
      '#dkPanel .dk-x:hover{background:var(--surface-3);color:var(--ink);}',
      '#dkPanel .dk-body{flex:1;min-height:0;overflow:auto;padding:14px;}',
      '.dk-empty{color:var(--muted);font-size:12.5px;line-height:2;text-align:center;padding:30px 14px;}',

      /* ===== دفع المحتوى ===== */
      'body.dk-open{padding-inline-end:calc(var(--dk-rail) + var(--dk-panel));}',
      'body.dk-rail-on{padding-inline-end:var(--dk-rail);}',
      /* التوب بار sticky وجوه التدفّق — بنرجّعه لعرض الشاشة الكامل */
      'body.dk-open .topbar,body.dk-rail-on .topbar{',
      '  margin-inline-end:calc(-1 * (var(--dk-rail) + var(--dk-panel)));}',
      'body.dk-rail-on .topbar{margin-inline-end:calc(-1 * var(--dk-rail));}',

      '@media (prefers-reduced-motion:reduce){#dkPanel{transition:none;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function build() {
    if (built) return;
    css();
    var rail = document.createElement('div'); rail.id = 'dkRail';
    var panel = document.createElement('div'); panel.id = 'dkPanel';
    panel.innerHTML =
      '<div class="dk-head"><span class="dk-t" id="dkTitle"></span>' +
      '<button class="dk-x" id="dkClose" title="إقفال" aria-label="إقفال">✕</button></div>' +
      '<div class="dk-body" id="dkBody"></div>';
    document.body.appendChild(panel);
    document.body.appendChild(rail);
    document.getElementById('dkClose').addEventListener('click', close);
    built = true;
    addEventListener('resize', layout);
    // نفس المراقب اللي الصفحة بتستخدمه: بنسمع تغيّر class على body.
    // ⚠️ حارس ضروري: layout بنفسه بيحط/يشيل dk-open و dk-rail-on على
    //    body، فمن غير الحارس ده المراقب هينده layout اللي هيغيّر
    //    الكلاس اللي هينده المراقب… حلقة مقفولة.
    //    بنقارن حالة modal-open بس، ومانتحركش غير لما تتغيّر فعلاً.
    try {
      new MutationObserver(function () {
        var m = onMain();
        if (m === _lastMain) return;
        _lastMain = m;
        layout(); if (m) { renderRail(); if (expanded) renderPane(); }
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && expanded) close(); });
    setTimeout(layout, 600);           // التوب بار بيستقر بعد تحميل الخطوط
    layout();
  }

  // ⚠️ الرف على الشاشة الرئيسية بس.
  //    الصفحة فيها ١٨ أوفرلاي (الحسابات · الجرد · التقييم · التفاصيل …)
  //    ومراقبتهم واحد واحد هشة — أي أوفرلاي جديد هينسى.
  //    فبنقرا من الآلية الموجودة أصلاً: مراقب بيحط modal-open على
  //    body أول ما أي .overlay تتفتح. مصدر واحد للحقيقة.
  function onMain() {
    try { return !document.body.classList.contains('modal-open'); }
    catch (e) { return true; }
  }

  function layout() {
    var rail = document.getElementById('dkRail'), panel = document.getElementById('dkPanel');
    if (!rail || !panel) return;

    if (!onMain()) {
      rail.style.display = 'none'; panel.style.display = 'none';
      document.body.classList.remove('dk-open', 'dk-rail-on');
      return;
    }
    rail.style.display = ''; panel.style.display = '';
    var top = topOffset(), w = width();
    rail.style.top = top + 'px';  rail.style.bottom = '0';
    panel.style.top = top + 'px'; panel.style.bottom = '0';

    var root = document.documentElement.style;
    root.setProperty('--dk-rail', RAIL + 'px');
    root.setProperty('--dk-panel', (expanded ? w.panel : 0) + 'px');

    document.body.classList.toggle('dk-open', expanded && w.push);
    document.body.classList.toggle('dk-rail-on', !(expanded && w.push));
  }

  function renderRail() {
    var rail = document.getElementById('dkRail');
    if (!rail) return;
    // المفتوحة بتطلع أول الرف
    var list = TOOLS.slice().sort(function (a, b) {
      return (b.id === openId ? 1 : 0) - (a.id === openId ? 1 : 0);
    });
    var totalBadge = 0;
    rail.innerHTML = list.map(function (t) {
      var n = 0; try { n = t.badge ? (t.badge() || 0) : 0; } catch (e) {}
      totalBadge += n;
      return '<button class="dk-ico' + (t.id === openId && expanded ? ' act' : '') + '"' +
             ' data-id="' + t.id + '" title="' + (t.title || '') + '"' +
             ' aria-label="' + (t.title || '') + '">' + (t.icon || '•') +
             (n > 0 ? '<span class="dk-badge">' + (n > 99 ? '99+' : n) + '</span>' : '') +
             '</button>';
    }).join('');
    // بادچ نظام التشغيل على أيقونة التطبيق المثبّت (شغّال والتطبيق مفتوح أو في الخلفية)
    try {
      if (navigator.setAppBadge) {
        if (totalBadge > 0) navigator.setAppBadge(totalBadge);
        else if (navigator.clearAppBadge) navigator.clearAppBadge();
      }
    } catch (e) {}
    Array.prototype.forEach.call(rail.querySelectorAll('.dk-ico'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id');
        if (expanded && id === openId) close(); else open(id);
      });
    });
  }

  function renderPane() {
    var body = document.getElementById('dkBody'), title = document.getElementById('dkTitle');
    if (!body) return;
    var t = TOOLS.filter(function (x) { return x.id === openId; })[0];
    if (title) title.textContent = t ? (t.title || '') : '';
    if (!t) { body.innerHTML = '<div class="dk-empty">مفيش أدوات متسجّلة</div>'; return; }

    // العنصر بيتحفظ لكل أداة — فالسكرول واللي متكتب مبيضيعش لما تبدّل
    if (t._host) { body.innerHTML = ''; body.appendChild(t._host); }
    else {
      body.innerHTML = '';
      var host = document.createElement('div'); t._host = host; body.appendChild(host);
      try { if (t.render) t.render(host); }
      catch (e) { host.innerHTML = '<div class="dk-empty">الأداة دي مش راضية تفتح — جرّب تقفل الصفحة وتفتحها</div>'; }
    }
    try { if (t.onShow) t.onShow(t._host); } catch (e) {}
  }

  function open(id) {
    if (!TOOLS.some(function (x) { return x.id === id; })) return;
    openId = id; expanded = true;
    try { localStorage.setItem(LS_TOOL, id); localStorage.setItem(LS_OPEN, '1'); } catch (e) {}
    layout(); renderRail(); renderPane();
  }

  function close() {
    expanded = false;
    try { localStorage.setItem(LS_OPEN, '0'); } catch (e) {}
    layout(); renderRail();
  }

  function register(tool) {
    if (!tool || !tool.id) return;
    if (TOOLS.some(function (x) { return x.id === tool.id; })) return;
    TOOLS.push(tool);
    build();
    renderRail();
    if (expanded && openId === tool.id) renderPane();
  }

  function boot() {
    build();
    try {
      expanded = localStorage.getItem(LS_OPEN) === '1';
      openId = localStorage.getItem(LS_TOOL) || null;
    } catch (e) {}
    layout(); renderRail(); if (expanded) renderPane();
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();

  window.IFixDock = {
    register: register, open: open, close: close,
    toggle: function () { expanded ? close() : open(openId || (TOOLS[0] && TOOLS[0].id)); },
    refresh: renderRail,
    tools: function () { return TOOLS.map(function (t) { return t.id; }); }
  };
})();
