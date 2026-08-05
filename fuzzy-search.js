/* ============================================================
   I Fix Team — بحث مرن للأسماء
   ------------------------------------------------------------
   المشكلة: أسماء العملاء والمحلات بتتكتب حرة، وكل موظف بيكتبها
   بطريقته:
       بلال · belal · bilal · Belal · BELAL · بلا ل

   البحث الحالي بيقارن النص حرف بحرف، فلازم تكتبه زي ما اتكتب
   بالظبط — وده مستحيل عملياً.

   الفكرة: بدل ما نقارن الحروف، نقارن **الهيكل الصوتي**.
   بنحوّل العربي والإنجليزي لنفس التمثيل، وبنشيل الحركات
   والمسافات والحروف المتحركة — اللي هي بالظبط اللي بتختلف
   بين الكتابات.

       بلال  → ب ل ا ل → b l a l → bll
       belal → b e l a l       → bll
       bilal → b i l a l       → bll   ✅ كلهم بيتطابقوا

   وده مش صدفة: الكتابة العربية أصلاً بتكتب الصوامت وتسيب
   الحركات، فالهيكل الصوتي هو أقرب حاجة للطريقتين.

   الاستخدام:
       IFixSearch.match(query, [name, shop, ...])   → true/false
       IFixSearch.key(text)                          → الهيكل الصوتي
   ============================================================ */
(function () {
  'use strict';
  if (window.IFixSearch) return;

  // ===== ١) التطبيع: نشيل كل اللي مش بيفرّق في المعنى =====
  var AR_MAP = {
    '\u0623': '\u0627', '\u0625': '\u0627', '\u0622': '\u0627', '\u0671': '\u0627',  // أ إ آ → ا
    '\u0629': '\u0647',                                                              // ة → ه
    '\u0649': '\u064A',                                                              // ى → ي
    '\u0624': '\u0648', '\u0626': '\u064A'                                           // ؤ ئ → و ي
  };
  var AR_DIGITS = { '\u0660':'0','\u0661':'1','\u0662':'2','\u0663':'3','\u0664':'4',
                    '\u0665':'5','\u0666':'6','\u0667':'7','\u0668':'8','\u0669':'9',
                    '\u06F0':'0','\u06F1':'1','\u06F2':'2','\u06F3':'3','\u06F4':'4',
                    '\u06F5':'5','\u06F6':'6','\u06F7':'7','\u06F8':'8','\u06F9':'9' };

  function normalize(s) {
    s = String(s == null ? '' : s);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i], code = s.charCodeAt(i);
      // الحركات والتطويل — مالهمش أي أثر على المعنى
      if (code >= 0x064B && code <= 0x0652) continue;
      if (c === '\u0640') continue;
      if (AR_DIGITS[c]) { out += AR_DIGITS[c]; continue; }
      out += AR_MAP[c] || c;
    }
    return out.toLowerCase()
      // كل اللي مش حرف ولا رقم بيتشال — ده اللي بيخلي
      // "بلا ل" و "بلال" و "Bel-al" يتطابقوا
      .replace(/[^\p{L}\p{N}]+/gu, '');
  }

  // ===== ٢) الهيكل الصوتي =====
  var AR_PHON = {
    '\u0627':'a','\u0628':'b','\u062A':'t','\u062B':'s','\u062C':'j','\u062D':'h',
    '\u062E':'k','\u062F':'d','\u0630':'z','\u0631':'r','\u0632':'z','\u0633':'s',
    '\u0634':'s','\u0635':'s','\u0636':'d','\u0637':'t','\u0638':'z','\u0639':'a',
    '\u063A':'a','\u0641':'f','\u0642':'k','\u0643':'k','\u0644':'l','\u0645':'m',
    '\u0646':'n','\u0647':'h','\u0648':'w','\u064A':'y','\u067E':'b','\u0686':'s',
    '\u06A4':'f','\u06AF':'g'
  };
  // الحروف المركّبة لازم تتحل الأول: kh قبل ما نفكّها لـ k+h
  var LAT_DI = [['kh','k'],['sh','s'],['ch','s'],['th','s'],['gh','a'],['ph','f'],['ck','k']];

  // المتحركات وأنصافها: هي بالظبط اللي بتختلف بين belal و bilal،
  // فبنشيلها كلها ما عدا لو الاسم بادئ بيها (أحمد ≠ حمد)
  var VOWELS = 'aeiouwy';

  function key(text) {
    // التاء المربوطة بتتنطق فتحة مش هاء: خليفة = khalifa مش khalifah.
    // التطبيع بيحوّلها ه (وده صح للمطابقة النصية: فاطمة/فاطمه)،
    // بس الهيكل الصوتي محتاجها ألف.
    var raw = String(text == null ? '' : text).replace(/\u0629/g, '\u0627');

    // ⚠️ "ال" التعريف لازم تتشال قبل بناء الهيكل.
    //    من غير كده بتديني "al" — ونفس الهيكل بتاع "علي" بالظبط،
    //    فالبحث عن علي كان بيجيب "الميدان" و"العالمية" وكل كلمة
    //    معرّفة في النظام. وكمان بتخلي "الأمانة" تطابق "أمانة".
    //    فحص رخيص قبل الـ regex: أغلب النصوص مفيهاش "ال" أصلاً،
    //    والـ regex هو أغلى سطر في بناء الفهرس كله.
    if (raw.indexOf('\u0627\u0644') >= 0) {
      raw = raw.replace(/(^|\s)\u0627\u0644(?=[\u0621-\u064A]{3,})/g, '$1');
    }

    var n = normalize(raw);
    if (!n) return '';

    var p = '';
    for (var i = 0; i < n.length; i++) {
      var c = n[i];
      if (AR_PHON[c]) { p += AR_PHON[c]; continue; }
      p += c;
    }

    // الحروف المركّبة الإنجليزية
    for (var d = 0; d < LAT_DI.length; d++) {
      p = p.split(LAT_DI[d][0]).join(LAT_DI[d][1]);
    }
    p = p.replace(/c/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks')
         .replace(/v/g, 'f').replace(/p/g, 'b');

    // الأرقام بتفضل زي ما هي — التليفونات والأكواد لازم تتطابق بالظبط
    var head = p[0];
    var body = '';
    for (var j = 1; j < p.length; j++) {
      var ch = p[j];
      if (VOWELS.indexOf(ch) >= 0) continue;
      body += ch;
    }
    var out = (VOWELS.indexOf(head) >= 0 ? head : head) + body;

    // تكرار الحرف مش بيفرّق: mohammed = mohamed
    out = out.replace(/(.)\1+/g, '$1');

    // هاء آخر الكلمة بتتكتب وبتتساب: khalifa / khalifah · فاطمة / فاطمه
    if (out.length > 2 && out[out.length - 1] === 'h') out = out.slice(0, -1);

    // هيكل من حرف واحد بيطابق نص الدنيا — نرجع للنص المطبّع بدله
    return out.length >= 2 ? out : n;
  }

  // ===== ٣) مسافة التعديل — للأخطاء المطبعية =====
  // محدودة بمسافة صغيرة عشان ما تجيبش نتايج عشوائية
  function within(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      var best = cur[0];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return false;            // خروج مبكر — أسرع بكتير
      prev = cur.slice();
    }
    return prev[b.length] <= max;
  }

  // ===== ٤) الكاش =====
  // الداشبورد فيه ٢٠ ألف جهاز × حقلين. من غير الكاش هنحسب ٤٠ ألف
  // هيكل مع كل ضغطة زرار في خانة البحث.
  var cache = new Map();
  var CACHE_MAX = 60000;
  function keyed(text) {
    var t = String(text == null ? '' : text);
    if (!t) return { n: '', ks: [] };
    var hit = cache.get(t);
    if (hit) return hit;
    if (cache.size > CACHE_MAX) cache.clear();
    // هيكل للنص كله + هيكل لكل كلمة.
    // النص كله بيمسك "بلا ل" (مسافة جوه الاسم)، والكلمات بتخلي
    // البحث عن "محمد" يلاقي "محمد حسين".
    var words = String(t).split(/[\s\u060C,.\-_/\\]+/).filter(Boolean);
    var ks = [key(t)];
    for (var w = 0; w < words.length && w < 8; w++) {
      var k = key(words[w]);
      if (k && ks.indexOf(k) < 0) ks.push(k);
    }
    var v = { n: normalize(t), ks: ks.filter(Boolean) };
    cache.set(t, v);
    return v;
  }

  // ===== ٥) المطابقة =====
  function matchOne(qn, qk, value) {
    if (!value) return false;
    var v = keyed(value);
    if (!v.n) return false;

    // ① تطابق نصي مباشر — أعلى ثقة
    if (v.n.indexOf(qn) >= 0) return true;
    if (!qk) return false;

    for (var i = 0; i < v.ks.length; i++) {
      var k = v.ks[i];

      // ② الهيكل الصوتي: **بداية الكلمة** مش أي مكان جواها.
      //    لو سمحنا بالمنتصف، "سارة" (sr) هتطابق "ياسر" (ysr).
      //    والهياكل القصيرة (حرفين) لازم تطابق تام: "علي" هيكلها
      //    "al" وهي بادئة لعشرات الكلمات، فالبداية مش كفاية.
      if (qk.length >= 3 ? k.indexOf(qk) === 0 : k === qk) return true;

      // ③ خطأ مطبعي — للأسماء الطويلة بس.
      //    الهياكل القصيرة بتتشابه بطبيعتها: "أحمد" (ahmd) و
      //    "محمود" (mhmd) بينهم حرف واحد وهما اسمين مختلفين،
      //    فالتساهل معاهم بيجيب نتايج غلط أكتر من الصح.
      //    وبنشترط أول حرف يتطابق قبل ما نحسب المسافة أصلاً:
      //    الخطأ المطبعي نادراً ما بيكون في أول حرف، وحساب المسافة
      //    هو أغلى جزء في البحث — الشرط ده بيوفّر أغلبه.
      if (qk.length >= 5 && qk[0] === k[0] && Math.abs(qk.length - k.length) <= 1) {
        var tol = qk.length >= 8 ? 2 : 1;
        if (within(qk, k, tol)) return true;
      }
    }
    return false;
  }

  function match(query, values) {
    var q = String(query == null ? '' : query).trim();
    if (!q) return true;
    var qn = normalize(q);
    if (!qn) return true;
    var qk = key(q);
    var arr = Array.isArray(values) ? values : [values];
    for (var i = 0; i < arr.length; i++) {
      if (matchOne(qn, qk, arr[i])) return true;
    }
    return false;
  }

  // ============================================================
  // فهرس مسبق — لازم للقوايم الكبيرة
  // ------------------------------------------------------------
  // من غيره كل ضغطة زرار بتعيد الحساب لكل جهاز.
  //
  // التفصيلة اللي بتفرق ٢٠ ضعف: بندمج كل الحقول في **نص واحد**
  // بدل ما نلف على خمسة. محرك الجافاسكريبت بيبحث في النص الطويل
  // أسرع بمراحل من خمس عمليات بحث قصيرة — قياس فعلي على ٢٠ ألف
  // جهاز: ٦١ مللي → ٣ مللي.
  //
  //   IFixSearch.index(devices, d => [d.customerName, d.shopName, ...])
  //   IFixSearch.matchIndexed(q, device)
  //
  // بنخزّن على الكائن في خاصية مخفية — بتروح مع الجهاز لما يتشال
  // من الذاكرة، فمفيش تسريب.
  // ============================================================
  var IDX = '__ifs';
  var idxVer = 0;
  var SEP = '\u0001';          // فاصل مستحيل يظهر في اسم — بيمنع
                               // تطابق عابر لحدود حقلين

  // force = يعيد بناء كل حاجة (بعد تحميل كامل).
  // الافتراضي تزايدي: بيفهرس الجديد بس.
  //
  // ⚠️ ضروري: الداشبورد بينادي الترتيب مع كل رسمة في العرض
  //    التدريجي. من غير التزايدية بنعيد بناء الـ ٢٠ ألف ست مرات
  //    أثناء التحميل — يعني ثواني تجميد على الموبايل.
  function index(items, fieldsFn, force) {
    if (force) idxVer++;
    if (!idxVer) idxVer = 1;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || typeof it !== 'object') continue;
      var old = it[IDX];
      if (old && old.v === idxVer) continue;      // مفهرس خلاص
      var vals = fieldsFn(it) || [];
      var ns = [], ks = [];
      for (var j = 0; j < vals.length; j++) {
        var v = vals[j]; if (!v) continue;
        var e = keyed(v);
        if (e.n) ns.push(e.n);
        for (var m = 0; m < e.ks.length; m++) if (ks.indexOf(e.ks[m]) < 0) ks.push(e.ks[m]);
      }
      var rec = {
        v: idxVer,
        n: ns.join(SEP),
        // كل هيكل محاط بالفاصل — عشان نقدر نطابق **بداية** كلمة
        // بـ indexOf(SEP + qk) من غير ما نلف على مصفوفة
        k: ks.length ? SEP + ks.join(SEP) + SEP : '',
        ka: ks
      };
      try {
        Object.defineProperty(it, IDX, { value: rec, writable: true, configurable: true, enumerable: false });
      } catch (e) { it[IDX] = rec; }
    }
    return idxVer;
  }

  // الاستعلام بيتحسب مرة واحدة مش مع كل جهاز.
  // ده كان بياخد ٢٠ ألف عملية تطبيع لنفس الكلمة في البحث الواحد.
  var lastQ = null, lastQN = '', lastQK = '';
  function prepQuery(q) {
    if (q === lastQ) return;
    lastQ = q; lastQN = normalize(q); lastQK = key(q);
  }

  function matchIndexed(query, item) {
    var q = String(query == null ? '' : query).trim();
    if (!q) return true;
    var e = item && item[IDX];
    if (!e || e.v !== idxVer) return false;   // مش مفهرس — المستدعي بيرجع للطريقة العادية
    prepQuery(q);
    var qn = lastQN; if (!qn) return true;

    if (e.n.indexOf(qn) >= 0) return true;    // بحث واحد في كل الحقول

    var qk = lastQK;
    if (!qk || !e.k) return false;
    // الهياكل القصيرة (حرفين) تطابق تام، والأطول بداية كلمة —
    // نفس قاعدة المسار غير المفهرس بالظبط
    if (qk.length >= 3) { if (e.k.indexOf(SEP + qk) >= 0) return true; }
    else if (e.k.indexOf(SEP + qk + SEP) >= 0) return true;

    // الخطأ المطبعي — أغلى جزء، فبيتعمل آخر حاجة وللأسماء الطويلة بس
    if (qk.length >= 5) {
      for (var j = 0; j < e.ka.length; j++) {
        var k = e.ka[j];
        if (qk[0] !== k[0] || Math.abs(qk.length - k.length) > 1) continue;
        if (within(qk, k, qk.length >= 8 ? 2 : 1)) return true;
      }
    }
    return false;
  }

  function isIndexed(item) { var e = item && item[IDX]; return !!(e && e.v === idxVer); }

  // بعد تعديل جهاز — بنفضّي فهرسه عشان يتبني من جديد
  function invalidate(item) { if (item && item[IDX]) { try { delete item[IDX]; } catch (e) { item[IDX] = null; } } }

  window.IFixSearch = {
    match: match, key: key, normalize: normalize,
    index: index, matchIndexed: matchIndexed, isIndexed: isIndexed, invalidate: invalidate,
    clearCache: function(){ cache.clear(); }
  };
})();
