/* ============================================================
   I Fix Team — شريط الأدوات السفلي (Dock)
   ------------------------------------------------------------
   شريط رفيع مركون تحت الشاشة، فيه زرار مثلث صغير. لما تدوس عليه
   الشريط بيكبر لتلت الشاشة تقريباً، وبيفتح على أول أداة.
   الأدوات مرصوصة في عمود على الجنب — واللي بتدوس عليها بتطلع فوق
   وتفتح مكان الأولى.

   ⚠️ الشريط ده **مش** بيعرف أي أدوات من نفسه. كل أداة بتسجّل
      نفسها، فالملف ده يقدر يشتغل في أي صفحة من غير تعديل:

        IFixDock.register({
          id:    'assist',
          icon:  '💬',
          title: 'محادثات العملاء',
          badge: () => 3,                 // اختياري: رقم على الأيقونة
          render: (host) => { ... }        // بتملا العنصر ده
        });

      و render بتتنادى مرة واحدة أول ما الأداة تتفتح. لو محتاجة
      تتحدّث بعد كده استخدم onShow.

   ⚠️ الارتفاع: الصفحة فيها تلات حاجات مركونة تحت —
        شريط STAGING            z-index 99999
        شريطي حالة الطباعة/الحفظ z-index 99998
      فالدوك بياخد 99990 (تحتيهم كلهم) وبيقيس ارتفاع شريط
      الـstaging ويقعد فوقه، عشان ما يتغطاش ولا يغطيه.
   ============================================================ */
(function () {
  'use strict';
  if (window.IFixDock) return;

  var TOOLS = [];
  var openId = null;
  var expanded = false;
  var built = false;
  var LS_OPEN = 'ifix-dock-open';
  var LS_TOOL = 'ifix-dock-tool';

  // ===== ارتفاع اللي مركون تحتنا =====
  // بنقيسه مش بنفترضه: شريط الـstaging بيظهر في التجريبي بس،
  // وارتفاعه بيختلف مع حجم الخط ولغة الجهاز.
  function bottomOffset() {
    var h = 0;
    try {
      var bars = document.querySelectorAll('body > div');
      for (var i = 0; i < bars.length; i++) {
        var el = bars[i], s = getComputedStyle(el);
        if (s.position === 'fixed' && s.bottom === '0px' &&
            parseInt(s.zIndex || '0', 10) > 99900 && el.id !== 'ifixDock') {
          h = Math.max(h, el.offsetHeight);
        }
      }
    } catch (e) {}
    return h;
  }

  function css() {
    if (document.getElementById('ifixDockCss')) return;
    var st = document.createElement('style');
    st.id = 'ifixDockCss';
    st.textContent = [
      '#ifixDock{position:fixed;left:0;right:0;z-index:99990;',
      '  background:var(--surface,#fff);border-top:1px solid var(--border,#E2E8F0);',
      '  box-shadow:0 -6px 24px rgba(0,0,0,.10);',
      '  display:flex;flex-direction:column;',
      '  transition:height .22s cubic-bezier(.4,0,.2,1);overflow:hidden;}',
      '#ifixDock .dk-handle{height:26px;flex:0 0 26px;display:flex;align-items:center;',
      '  justify-content:center;cursor:pointer;user-select:none;position:relative;}',
      '#ifixDock .dk-handle:hover{background:var(--surface-2,#F8FAFC);}',
      /* المثلث نفسه — صغير خالص زي ما طلبت */
      '#ifixDock .dk-tri{width:0;height:0;border-inline-start:6px solid transparent;',
      '  border-inline-end:6px solid transparent;border-bottom:7px solid var(--muted,#64748B);',
      '  transition:transform .22s;}',
      '#ifixDock.on .dk-tri{transform:rotate(180deg);}',
      '#ifixDock .dk-hint{position:absolute;inset-inline-start:12px;font-size:11px;',
      '  color:var(--muted-2,#94A3B8);font-weight:700;pointer-events:none;}',
      /* الجسم: عمود أيقونات + محتوى */
      '#ifixDock .dk-body{flex:1;display:flex;min-height:0;border-top:1px solid var(--border,#E2E8F0);}',
      '#ifixDock .dk-rail{flex:0 0 52px;display:flex;flex-direction:column;gap:4px;',
      '  padding:8px 6px;overflow-y:auto;background:var(--surface-2,#F8FAFC);',
      '  border-inline-end:1px solid var(--border,#E2E8F0);}',
      '#ifixDock .dk-ico{position:relative;width:40px;height:40px;flex:0 0 40px;border-radius:10px;',
      '  border:1px solid transparent;background:transparent;cursor:pointer;font-size:18px;',
      '  display:flex;align-items:center;justify-content:center;transition:.15s;}',
      '#ifixDock .dk-ico:hover{background:var(--surface,#fff);border-color:var(--border,#E2E8F0);}',
      '#ifixDock .dk-ico.act{background:var(--surface,#fff);border-color:var(--blue,#2563EB);',
      '  box-shadow:0 1px 4px rgba(0,0,0,.10);}',
      '#ifixDock .dk-badge{position:absolute;top:-2px;inset-inline-end:-2px;min-width:16px;height:16px;',
      '  border-radius:9px;background:#DC2626;color:#fff;font:900 10px/16px system-ui;text-align:center;',
      '  padding:0 4px;}',
      '#ifixDock .dk-pane{flex:1;min-width:0;overflow:auto;padding:12px 14px;}',
      '#ifixDock .dk-empty{color:var(--muted,#64748B);font-size:12.5px;text-align:center;padding:26px 12px;line-height:1.9;}',
      '#ifixDock .dk-title{font:900 13px/1.5 inherit;color:var(--ink,#101014);margin-bottom:8px;}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function build() {
    if (built) return;
    css();
    var d = document.createElement('div');
    d.id = 'ifixDock';
    d.innerHTML =
      '<div class="dk-handle" id="dkHandle">' +
        '<span class="dk-hint" id="dkHint"></span>' +
        '<span class="dk-tri"></span>' +
      '</div>' +
      '<div class="dk-body" id="dkBody">' +
        '<div class="dk-rail" id="dkRail"></div>' +
        '<div class="dk-pane" id="dkPane"></div>' +
      '</div>';
    document.body.appendChild(d);
    document.getElementById('dkHandle').addEventListener('click', toggle);
    built = true;
    layout();
    // شريط الـstaging بيتحط بعد DOMContentLoaded، والوضع الأفقي
    // بيغيّر الارتفاعات — فبنعيد القياس
    addEventListener('resize', layout);
    setTimeout(layout, 800);
  }

  function layout() {
    var d = document.getElementById('ifixDock');
    if (!d) return;
    d.style.bottom = bottomOffset() + 'px';
    // تلت الشاشة، بحد أدنى وأقصى معقولين
    var h = Math.round(innerHeight * 0.34);
    h = Math.max(200, Math.min(h, 460));
    d.style.height = expanded ? h + 'px' : '26px';
    d.classList.toggle('on', expanded);
    var body = document.getElementById('dkBody');
    if (body) body.style.display = expanded ? 'flex' : 'none';
  }

  function renderRail() {
    var rail = document.getElementById('dkRail');
    if (!rail) return;
    // ⚠️ المفتوحة بتطلع أول العمود — ده اللي بيخلي الترتيب يتغيّر
    //    مع كل ضغطة زي ما طلبت.
    var list = TOOLS.slice().sort(function (a, b) {
      return (b.id === openId ? 1 : 0) - (a.id === openId ? 1 : 0);
    });
    rail.innerHTML = list.map(function (t) {
      var n = 0;
      try { n = t.badge ? (t.badge() || 0) : 0; } catch (e) {}
      return '<button class="dk-ico' + (t.id === openId ? ' act' : '') + '" ' +
             'data-id="' + t.id + '" title="' + (t.title || '') + '">' +
             (t.icon || '•') +
             (n > 0 ? '<span class="dk-badge">' + (n > 99 ? '99+' : n) + '</span>' : '') +
             '</button>';
    }).join('');
    Array.prototype.forEach.call(rail.querySelectorAll('.dk-ico'), function (b) {
      b.addEventListener('click', function () { open(b.getAttribute('data-id')); });
    });
  }

  function renderPane() {
    var pane = document.getElementById('dkPane');
    var hint = document.getElementById('dkHint');
    if (!pane) return;
    var t = TOOLS.filter(function (x) { return x.id === openId; })[0];

    if (hint) hint.textContent = TOOLS.length && expanded && t ? (t.title || '') : '';

    if (!TOOLS.length) {
      pane.innerHTML = '<div class="dk-empty">🧰 الشريط جاهز — لسه مفيش أدوات متسجّلة</div>';
      return;
    }
    if (!t) { pane.innerHTML = ''; return; }

    // render بتتنادى مرة واحدة لكل أداة، وonShow مع كل فتحة
    if (t._host && t._host.parentNode === pane) {
      pane.innerHTML = ''; pane.appendChild(t._host);
    } else {
      pane.innerHTML = '';
      var host = document.createElement('div');
      t._host = host;
      pane.appendChild(host);
      try { if (t.render) t.render(host); } catch (e) { host.textContent = 'حصل خطأ في الأداة دي'; }
    }
    try { if (t.onShow) t.onShow(t._host); } catch (e) {}
  }

  function open(id) {
    var t = TOOLS.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    openId = id;
    try { localStorage.setItem(LS_TOOL, id); } catch (e) {}
    if (!expanded) { expanded = true; try { localStorage.setItem(LS_OPEN, '1'); } catch (e) {} }
    layout(); renderRail(); renderPane();
  }

  function toggle() {
    expanded = !expanded;
    try { localStorage.setItem(LS_OPEN, expanded ? '1' : '0'); } catch (e) {}
    if (expanded && !openId && TOOLS.length) openId = TOOLS[0].id;
    layout(); renderRail(); renderPane();
  }

  function register(tool) {
    if (!tool || !tool.id) return;
    if (TOOLS.some(function (x) { return x.id === tool.id; })) return;  // مفيش تسجيل مكرر
    TOOLS.push(tool);
    build();
    if (!openId) openId = TOOLS[0].id;
    renderRail();
    if (expanded) renderPane();
  }

  function refresh() { renderRail(); }   // لتحديث أرقام الأيقونات من برّه

  function boot() {
    build();
    try {
      expanded = localStorage.getItem(LS_OPEN) === '1';
      var saved = localStorage.getItem(LS_TOOL);
      if (saved) openId = saved;
    } catch (e) {}
    layout(); renderRail(); renderPane();
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();

  window.IFixDock = {
    register: register,
    open: open,
    toggle: toggle,
    refresh: refresh,
    close: function () { expanded = false; layout(); },
    tools: function () { return TOOLS.map(function (t) { return t.id; }); }
  };
})();
