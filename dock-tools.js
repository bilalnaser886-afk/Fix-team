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
  var CH = { rows: [], open: null, loading: false, err: '' };

  // ============================================================
  // "شُوفت" — الرقم الأحمر بيتشال أول ما تفتح المحادثة
  // ------------------------------------------------------------
  // ⚠️ بنحفظ updated_at وقت الفتح مش مجرد علامة "شُوفت".
  //    لو حفظنا علامة بس، العميل يبعت رسالة جديدة على نفس المحادثة
  //    وتفضل متعلّمة مقروءة — وطلبه يضيع. المقارنة بالوقت بتخلي
  //    أي تحديث جديد يرجّعها "مش مشوفة" تلقائياً.
  var SEEN_KEY = 'ifix_chat_seen';
  var SEEN = {};
  try { SEEN = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch (e) { SEEN = {}; }

  function isSeen(c) {
    return !!(c && SEEN[c.token] && SEEN[c.token] >= (c.updated_at || ''));
  }
  function markSeen(c) {
    if (!c || !c.token) return;
    SEEN[c.token] = c.updated_at || new Date().toISOString();
    // بنقصّها على آخر ٣٠٠ محادثة عشان التخزين ما يكبرش للأبد
    var ks = Object.keys(SEEN);
    if (ks.length > 300) {
      ks.sort(function (a, b) { return (SEEN[a] || '') < (SEEN[b] || '') ? -1 : 1; });
      for (var i = 0; i < ks.length - 300; i++) delete SEEN[ks[i]];
    }
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(SEEN)); } catch (e) {}
  }
  // محتاجة رد **ولسه ما اتشافتش** — دي اللي بيتعدّ عليها الرقم الأحمر
  function needsEye(c) { return c && c.status === 'human' && !isSeen(c); }

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
      '.ch-row{border:1px solid var(--border);border-radius:12px;padding:10px 11px;',
      '  margin-bottom:7px;cursor:pointer;background:var(--surface-2);}',
      '.ch-row:hover{border-color:var(--accent);}',
      '.ch-nm{font:900 13px/1.4 "Cairo",sans-serif;color:var(--ink);}',
      '.ch-sub{font-size:11.5px;color:var(--muted);margin-top:3px;line-height:1.7;}',
      '.ch-tag{display:inline-block;font:900 10px/1.6 inherit;border-radius:6px;padding:1px 6px;}',
      '.ch-tag.hot{color:#DC2626;background:rgba(220,38,38,.13);border:1px solid rgba(220,38,38,.4);}',
      '.ch-tag.done{color:#15803D;background:rgba(21,128,61,.13);}',
      /* اللي محتاج رد له خط جانبي أحمر — يبان من طرف العين */
      '.ch-row.hot{border-inline-start:3px solid #DC2626;background:var(--surface);}',
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
      '.ch-empty{color:var(--muted);font-size:12.5px;text-align:center;padding:26px 10px;line-height:2;}',
      /* عناوين قسمي المقروء وغير المقروء */
      '.ch-sec{font:900 11px/1.6 inherit;color:var(--muted);margin:16px 2px 8px;',
      '  display:flex;align-items:center;gap:7px;}',
      '.ch-cnt{background:var(--surface-3);color:var(--ink);border-radius:20px;',
      '  min-width:18px;text-align:center;padding:1px 7px;font-size:10.5px;font-weight:900;}',
      /* رسالة العميل (متميزة عن البوت) + عنوان المرسِل + شريط رد الموظف */
      '.ch-msg.cust{background:var(--surface-2);border:1px solid var(--border);color:var(--ink);}',
      '.ch-cap{font:800 10px/1.5 inherit;color:var(--muted);margin:4px 2px 2px;}',
      '.ch-send{display:flex;gap:6px;margin-top:12px;}',
      '.ch-send input{flex:1;padding:10px 12px;border-radius:10px;border:1px solid var(--border);',
      '  background:var(--surface-2);color:var(--ink);font:inherit;font-size:12.5px;}',
      '.ch-send button{padding:10px 16px;border:none;border-radius:10px;background:var(--accent);',
      '  color:#fff;font:800 12px/1 inherit;cursor:pointer;}'
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
      CH.open = r.data;
      markSeen(r.data);                       // ← الرقم الأحمر بيقل من هنا
      paint();
      try { IFixDock.refresh(); } catch (e) {}
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

  // إرسال رسالة من الموظف للعميل — إضافة ذرية عبر assist_append_msg
  // (مبتدهسش لو العميل بيكتب في نفس اللحظة). العميل بيشوفها لو صفحته
  // مفتوحة (بيسحبها بالتوكن)، ولو قافل بيشوفها أول ما يفتح تاني.
  async function sendStaffMsg(token, text) {
    text = String(text || '').trim();
    if (!text) return;
    var db = DB(); if (!db) { alert('مفيش اتصال بقاعدة البيانات'); return; }
    // رسم فوري متفائل — الريل تايم بعد كده بيأكّده لباقي الأجهزة
    if (CH.open && CH.open.token === token) {
      if (!Array.isArray(CH.open.messages)) CH.open.messages = [];
      CH.open.messages.push({ who: 'staff', text: text, at: new Date().toISOString() });
      if (CH.open.status !== 'done') CH.open.status = 'human';
      CH.open.updated_at = new Date().toISOString();
      markSeen(CH.open);
      paint();
    }
    // Supabase مبيرميش خطأ — لازم نبصّ على .error ونوريه، مننساش ده تاني
    try {
      var res = await db.rpc('assist_append_msg', { p_token: token, p_who: 'staff', p_text: text });
      if (res && res.error) {
        console.error('assist_append_msg failed:', res.error);
        alert('الرسالة ماوصلتش للعميل:\n' + (res.error.message || res.error.code || 'خطأ غير معروف'));
      }
    } catch (e) {
      console.error('assist_append_msg threw:', e);
      alert('الرسالة ماوصلتش — تحقق من الاتصال:\n' + (e && e.message ? e.message : String(e)));
    }
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
          var w = m.who;
          var cls = w === 'staff' ? 'me' : (w === 'me' ? 'cust' : 'bot');
          var cap = w === 'staff' ? '<div class="ch-cap">🎧 موظف</div>'
                  : w === 'me'    ? '<div class="ch-cap">العميل</div>' : '';
          return cap + '<div class="ch-msg ' + cls + '">' +
                 esc(String(m.text || '').replace(/<[^>]*>/g, '')) + '</div>';
        }).join('') : '<div class="ch-empty">مفيش رسايل متسجّلة</div>') +
        (c.status !== 'done'
          ? '<div class="ch-send"><input id="chMsg" maxlength="500" placeholder="اكتب رسالة للعميل…"><button id="chSendBtn">إرسال</button></div>'
          : '') +
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
      var mi = document.getElementById('chMsg'), sbtn = document.getElementById('chSendBtn');
      if (mi && sbtn) {
        var send = function () { var v = mi.value.trim(); if (!v) return; mi.value = ''; sendStaffMsg(c.token, v); };
        sbtn.onclick = send;
        mi.onkeydown = function (e) { if (e.key === 'Enter') send(); };
      }
      return;
    }

    // قسمين: "غير مقروء" (فيه جديد من آخر ما فتحتها، ومش مقفولة) و"مقروء".
    // جوه غير المقروء: محتاج رد الأول، وبعدين الأحدث. المقفولة بتروح "مقروء".
    var unread = CH.rows.filter(function (c) { return c.status !== 'done' && !isSeen(c); });
    var read   = CH.rows.filter(function (c) { return !(c.status !== 'done' && !isSeen(c)); });
    unread.sort(function (a, b) {
      var d = (needsEye(b) ? 1 : 0) - (needsEye(a) ? 1 : 0);
      if (d) return d;
      return (b.updated_at || '') < (a.updated_at || '') ? -1 : 1;
    });
    read.sort(function (a, b) {
      return (b.updated_at || '') < (a.updated_at || '') ? -1 : 1;
    });

    function chRowHtml(c) {
      var eye = needsEye(c);
      return '<div class="ch-row' + (eye ? ' hot' : '') + '" data-t="' + esc(c.token) + '">' +
        '<div class="ch-nm">' + esc(c.customer || 'عميل من غير اسم') +
        (eye ? ' <span class="ch-tag hot">🔴 محتاج رد</span>' : '') +
        (c.status === 'done' ? ' <span class="ch-tag done">اتقفلت</span>' : '') + '</div>' +
        '<div class="ch-sub">' + esc([c.brand, c.model, c.issue].filter(Boolean).join(' · ') || 'لسه ما قالش المشكلة') + '</div>' +
        '<div class="ch-sub" style="direction:ltr;text-align:start;">' + esc(c.phone || '') +
        ' <span style="color:var(--muted-2);direction:rtl;display:inline-block;">' + when(c.updated_at) + '</span></div>' +
        '</div>';
    }
    function chSection(title, arr) {
      if (!arr.length) return '';
      return '<div class="ch-sec">' + esc(title) + ' <span class="ch-cnt">' + arr.length + '</span></div>' +
             arr.map(chRowHtml).join('');
    }

    host.innerHTML =
      '<button class="ch-back" id="chReload">↻ تحديث</button>' +
      (CH.err ? '<div class="ch-empty">' + esc(CH.err) + '</div>'
       : CH.loading ? '<div class="ch-empty">بنجيب المحادثات…</div>'
       : (unread.length || read.length)
          ? (chSection('غير مقروء', unread) + chSection('مقروء', read))
          : '<div class="ch-empty">مفيش محادثات هنا</div>');

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

              // المحادثة المفتوحة تتحدّث لحظياً كمان — أي كلام جديد
              // (من العميل أو من موظف) يظهر وانت فاتحها من غير تحديث.
              // payload.new بيجي بكل الأعمدة بما فيها messages.
              if (CH.open && CH.open.token === row.token) {
                if (payload.eventType === 'DELETE') CH.open = null;
                else { CH.open = row; markSeen(row); }
                paint();
              } else if (CH.host && !CH.open) {
                paint();
              }
            })
        .subscribe();
    } catch (e) { /* الاشتراك مايوقفش أي حاجة */ }
  }

  IFixDock.register({
    id: 'assist', icon: '💬', title: 'محادثات العملاء',
    badge: function () { return CH.rows.filter(needsEye).length; },
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
