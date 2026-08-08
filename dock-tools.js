/* ============================================================
   أدوات الرف
   ------------------------------------------------------------
   dock.js مش عارف أي أداة — الأدوات بتسجّل نفسها هنا.
   ============================================================ */
(function () {
  'use strict';
  if (!window.IFixDock) return;

  // ⚠️ ماينفعش نستخدم window.sb — الداشبورد بيعرّفه بـ:
  //        const sb = supabase.createClient(...)
  //    و const على المستوى الأعلى بيعمل ربط في نطاق السكربتات مش
  //    خاصية على window. يعني window.sb بيفضل undefined للأبد،
  //    وأي شرط عليه بيفشل في صمت — القايمة تفضل فاضية والاشتراك
  //    مايتعملش، من غير أي خطأ في الكونسول.
  //    والمعرّف المجرّد بيشتغل لأن السكربت ده بيتحمّل قبله، والنداء
  //    بيحصل بعد ما الصفحة تخلص.
  function DB() {
    try { return (typeof sb !== 'undefined' && sb) ? sb : null; } catch (e) { return null; }
  }

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  };

  // ============================================================
  // 💬 محادثات العملاء
  // ------------------------------------------------------------
  // بتقرا assistant_chats. الحالات:
  //   human → العميل طالب موظف (طلب مندوب أو مكالمة) — دي المهمة
  //   bot   → لسه بيتكلم مع البوت
  //   done  → اتقفلت
  //
  // ⚠️ مفيش سحب دوري (polling). القايمة بتتحمّل أول ما تفتح الأداة
  //    وبزرار تحديث. الصفحة دي كانت سبب أزمة نقل قبل كده — أي حلقة
  //    كل ثانية هنا بتتضرب في عدد التابات المفتوحة طول اليوم.
  //
  // ⚠️ والرسايل بتتجاب لما تفتح محادثة بعينها بس. عمود messages
  //    فيه المحادثة كاملة، وسحبه لكل الصفوف في القايمة معناه
  //    تحميل كل الكلام عشان تعرض أول سطر منه.
  // ============================================================
  var CH = { rows: [], open: null, filter: 'human', loading: false, err: '' };

  var STATUS = {
    human: { t: 'محتاج رد', c: '#DC2626', bg: 'rgba(220,38,38,.12)' },
    bot:   { t: 'مع البوت', c: '#0891A8', bg: 'rgba(8,145,168,.12)' },
    done:  { t: 'اتقفلت',  c: '#15803D', bg: 'rgba(21,128,61,.12)' }
  };

  function when(s) {
    if (!s) return '';
    var d = new Date(s), m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return 'دلوقتي';
    if (m < 60) return 'من ' + m + ' دقيقة';
    if (m < 1440) return 'من ' + Math.round(m / 60) + ' ساعة';
    try { return d.toLocaleDateString('ar-EG'); } catch (e) { return ''; }
  }

  function css() {
    if (document.getElementById('dkChatCss')) return;
    var s = document.createElement('style');
    s.id = 'dkChatCss';
    s.textContent = [
      '.ch-tabs{display:flex;gap:6px;margin-bottom:10px;}',
      '.ch-tab{flex:1;padding:7px 4px;border-radius:9px;border:1px solid var(--border);',
      '  background:transparent;color:var(--muted);font:800 11.5px/1.3 inherit;cursor:pointer;}',
      '.ch-tab.on{background:var(--accent);border-color:var(--accent);color:#fff;}',
      '.ch-row{border:1px solid var(--border);border-radius:12px;padding:10px 11px;',
      '  margin-bottom:7px;cursor:pointer;background:var(--surface-2);}',
      '.ch-row:hover{border-color:var(--accent);}',
      '.ch-nm{font:900 13px/1.4 "Cairo",sans-serif;color:var(--ink);}',
      '.ch-sub{font-size:11.5px;color:var(--muted);margin-top:3px;line-height:1.7;}',
      '.ch-tag{display:inline-block;font:900 10px/1.6 inherit;border-radius:6px;padding:1px 6px;}',
      '.ch-back{background:none;border:none;color:var(--accent);font:800 12px/1 inherit;',
      '  cursor:pointer;padding:4px 0;margin-bottom:10px;}',
      '.ch-msg{border-radius:11px;padding:8px 11px;margin-bottom:6px;font-size:12.5px;',
      '  line-height:1.85;max-width:88%;white-space:pre-wrap;word-break:break-word;}',
      '.ch-msg.bot{background:var(--surface-3);color:var(--ink);}',
      '.ch-msg.me{background:var(--accent);color:#fff;margin-inline-start:auto;}',
      '.ch-act{display:flex;gap:6px;margin-top:12px;}',
      '.ch-act a,.ch-act button{flex:1;text-align:center;padding:10px;border-radius:10px;',
      '  font:800 12px/1 inherit;cursor:pointer;text-decoration:none;border:1px solid var(--border);',
      '  background:var(--surface-2);color:var(--ink);}',
      '.ch-act .wa{background:#16A34A;border-color:#16A34A;color:#fff;}',
      '.ch-empty{color:var(--muted);font-size:12.5px;text-align:center;padding:26px 10px;line-height:2;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  async function load() {
    var db = DB();
    if (!db) { CH.err = 'مفيش اتصال بالسيرفر'; return; }
    CH.loading = true; CH.err = ''; paint();
    try {
      // الأعمدة الخفيفة بس — messages بتتجاب لما تفتح محادثة
      var r = await db.from('assistant_chats')
        .select('id,token,customer,phone,brand,model,issue,status,updated_at')
        .order('updated_at', { ascending: false })
        .limit(80);
      if (r.error) throw r.error;
      CH.rows = r.data || [];
    } catch (e) {
      CH.err = 'مقدرناش نجيب المحادثات — اتأكد من النت وجرّب تاني';
    }
    CH.loading = false;
    paint();
    try { IFixDock.refresh(); } catch (e) {}
  }

  async function openChat(token) {
    var host = CH.host; if (!host) return;
    host.innerHTML = '<div class="ch-empty">بنفتح المحادثة…</div>';
    try {
      var db = DB(); if (!db) throw new Error();
      var r = await db.from('assistant_chats')
        .select('token,customer,phone,brand,model,issue,status,messages,updated_at')
        .eq('token', token).maybeSingle();
      if (r.error || !r.data) throw (r.error || new Error());
      CH.open = r.data; paint();
    } catch (e) {
      host.innerHTML = '<div class="ch-empty">مقدرناش نفتح المحادثة دي</div>';
    }
  }

  async function setStatus(token, status) {
    try {
      var db = DB(); if (!db) return;
      await db.from('assistant_chats').update({ status: status }).eq('token', token);
      if (CH.open) CH.open.status = status;
      var row = CH.rows.filter(function (x) { return x.token === token; })[0];
      if (row) row.status = status;
      paint(); try { IFixDock.refresh(); } catch (e) {}
    } catch (e) {}
  }

  function paint() {
    var host = CH.host; if (!host) return;

    if (CH.open) {
      var c = CH.open, st = STATUS[c.status] || STATUS.bot;
      var msgs = Array.isArray(c.messages) ? c.messages : [];
      var wa = c.phone ? ('https://wa.me/2' + String(c.phone).replace(/\D/g, '').replace(/^2/, '')) : '';
      host.innerHTML =
        '<button class="ch-back" id="chBack">← كل المحادثات</button>' +
        '<div class="ch-nm">' + esc(c.customer || 'عميل من غير اسم') + '</div>' +
        '<div class="ch-sub" style="direction:ltr;text-align:start;">' + esc(c.phone || '—') + '</div>' +
        '<div class="ch-sub">' + esc([c.brand, c.model, c.issue].filter(Boolean).join(' · ') || '—') + '</div>' +
        '<div style="margin:12px 0 10px;border-top:1px solid var(--border);"></div>' +
        (msgs.length ? msgs.map(function (m) {
          return '<div class="ch-msg ' + (m.who === 'me' ? 'me' : 'bot') + '">' +
                 esc(String(m.text || '').replace(/<[^>]*>/g, '')) + '</div>';
        }).join('') : '<div class="ch-empty">مفيش رسايل متسجّلة</div>') +
        '<div class="ch-act">' +
          (wa ? '<a class="wa" href="' + wa + '" target="_blank" rel="noopener">💬 رد على واتساب</a>' : '') +
          (c.status !== 'done' ? '<button id="chDone">✓ خلصت</button>'
                               : '<button id="chReopen">↩ ارجعها</button>') +
        '</div>';
      document.getElementById('chBack').onclick = function () { CH.open = null; paint(); };
      var dn = document.getElementById('chDone');
      if (dn) dn.onclick = function () { setStatus(c.token, 'done'); };
      var ro = document.getElementById('chReopen');
      if (ro) ro.onclick = function () { setStatus(c.token, 'human'); };
      return;
    }

    var tabs = [['human', 'محتاج رد'], ['bot', 'مع البوت'], ['all', 'الكل']];
    var list = CH.filter === 'all' ? CH.rows
             : CH.rows.filter(function (x) { return x.status === CH.filter; });

    host.innerHTML =
      '<div class="ch-tabs">' + tabs.map(function (t) {
        var n = t[0] === 'all' ? CH.rows.length
              : CH.rows.filter(function (x) { return x.status === t[0]; }).length;
        return '<button class="ch-tab' + (CH.filter === t[0] ? ' on' : '') + '" data-f="' + t[0] + '">' +
               t[1] + (n ? ' (' + n + ')' : '') + '</button>';
      }).join('') + '</div>' +
      '<button class="ch-back" id="chReload">↻ تحديث</button>' +
      (CH.err ? '<div class="ch-empty">' + esc(CH.err) + '</div>'
       : CH.loading ? '<div class="ch-empty">بنجيب المحادثات…</div>'
       : list.length ? list.map(function (c) {
          var st = STATUS[c.status] || STATUS.bot;
          return '<div class="ch-row" data-t="' + esc(c.token) + '">' +
            '<div class="ch-nm">' + esc(c.customer || 'عميل من غير اسم') +
            ' <span class="ch-tag" style="color:' + st.c + ';background:' + st.bg + ';">' + st.t + '</span></div>' +
            '<div class="ch-sub">' + esc([c.brand, c.model, c.issue].filter(Boolean).join(' · ') || 'لسه ما قالش المشكلة') + '</div>' +
            '<div class="ch-sub" style="direction:ltr;text-align:start;">' + esc(c.phone || '') +
            ' <span style="color:var(--muted-2);direction:rtl;display:inline-block;">' + when(c.updated_at) + '</span></div>' +
            '</div>';
         }).join('')
       : '<div class="ch-empty">مفيش محادثات هنا</div>');

    Array.prototype.forEach.call(host.querySelectorAll('.ch-tab'), function (b) {
      b.onclick = function () { CH.filter = b.getAttribute('data-f'); paint(); };
    });
    Array.prototype.forEach.call(host.querySelectorAll('.ch-row'), function (b) {
      b.onclick = function () { openChat(b.getAttribute('data-t')); };
    });
    document.getElementById('chReload').onclick = load;
  }

  // ============================================================
  // الإشعارات اللحظية
  // ------------------------------------------------------------
  // ⚠️ ليه ريل تايم مش سحب دوري؟
  //    السحب كل ثانية بيتضرب في عدد التابات المفتوحة طول اليوم —
  //    ودي نفس الحفرة اللي كلّفت ٩٦ جيجا. الريل تايم بيبعت لما
  //    يحصل تغيير بس، وقياس الاستهلاك عندك كان ٥٪ من حصته.
  //
  // ⚠️ محتاج الجدول يكون في نشرة الريل تايم:
  //       alter publication supabase_realtime add table public.assistant_chats;
  //    (في ملف 08-assist-realtime.sql). من غيرها الاشتراك بينجح
  //    في صمت ومفيش أي حدث بيوصل — وده أسوأ من خطأ ظاهر.
  //
  // ⚠️ والـ RLS بتتطبق على الريل تايم كمان: سياسة assistant_staff_read
  //    بتخلي الأحداث توصل للأدمن والمحاسب والديسباتشر بس.
  // ============================================================
  var chan = null;

  function toast(txt) {
    var t = document.createElement('div');
    t.textContent = txt;
    t.style.cssText = 'position:fixed;inset-inline-start:50%;transform:translateX(-50%);' +
      'bottom:22px;z-index:99997;background:#DC2626;color:#fff;padding:12px 18px;' +
      'border-radius:12px;font:800 13px/1.5 inherit;box-shadow:0 8px 24px rgba(0,0,0,.28);' +
      'cursor:pointer;max-width:88vw;text-align:center;';
    t.onclick = function () { try { IFixDock.open('assist'); } catch (e) {} t.remove(); };
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 9000);
  }

  function mergeRow(row) {
    if (!row || !row.token) return;
    // بنشيل messages من النسخة اللي في الذاكرة — القايمة مش
    // محتاجاها، وبتتجاب لما تفتح المحادثة.
    var slim = {
      id: row.id, token: row.token, customer: row.customer, phone: row.phone,
      brand: row.brand, model: row.model, issue: row.issue,
      status: row.status, updated_at: row.updated_at
    };
    var i = -1;
    for (var k = 0; k < CH.rows.length; k++) if (CH.rows[k].token === row.token) { i = k; break; }
    if (i >= 0) CH.rows.splice(i, 1);
    CH.rows.unshift(slim);
    if (CH.rows.length > 80) CH.rows.length = 80;
  }

  function subscribeChats() {
    var db = DB();
    if (chan || !db) return;
    try {
      chan = db.channel('assist_chats_live')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'assistant_chats' },
            function (payload) {
              var row = payload.new || payload.old;
              if (!row) return;
              var was = CH.rows.filter(function (x) { return x.token === row.token; })[0];
              var wasHuman = was && was.status === 'human';

              if (payload.eventType === 'DELETE') {
                CH.rows = CH.rows.filter(function (x) { return x.token !== row.token; });
              } else mergeRow(row);

              // إشعار لما محادثة تبقى "محتاج رد" وهي مكانتش كده
              if (row.status === 'human' && !wasHuman) {
                toast('🔔 ' + (row.customer || 'عميل') + ' محتاج رد — اضغط للفتح');
              }
              try { IFixDock.refresh(); } catch (e) {}
              if (CH.host && !CH.open) paint();
            })
        .subscribe();
    } catch (e) { /* الاشتراك مايوقفش أي حاجة */ }
  }

  IFixDock.register({
    id: 'assist', icon: '💬', title: 'محادثات العملاء',
    badge: function () {
      return CH.rows.filter(function (x) { return x.status === 'human'; }).length;
    },
    render: function (h) { css(); CH.host = h; paint(); load(); },
    onShow: function () { if (!CH.rows.length && !CH.loading) load(); }
  });

  // ⚠️ بنحمّل مرة واحدة عند الإقلاع من غير ما الأداة تتفتح — عشان
  //    الرقم الأحمر على الأيقونة يبان من أول ثانية. من غير ده
  //    الرقم مكانش هيظهر غير لما تفتح الأداة، يعني نفس مشكلة
  //    "لازم أدخل أشوف".
  var _tries = 0;
  function bootChats() {
    // بنستنى لحد ما العميل يتعرّف — السكربت ده بيتحمّل قبل ما
    // الداشبورد يعمله، فالمحاولة الأولى غالباً بتلاقيه لسه فاضي.
    if (!DB()) { if (_tries++ < 40) setTimeout(bootChats, 400); return; }
    load(); subscribeChats();
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', bootChats);
  else bootChats();
})();
