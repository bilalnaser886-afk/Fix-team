/* ============================================================
   I Fix Team — فواتير المشتريات + مخزن قطع الغيار (Part 5 + Part 6)
   ملف مستقل واحد بيركّب نفسه على dashboard.html من غير ما نلمس كوده.
   بيحل محل purchases.js بالكامل (نفس شغل الفواتير + المخزن الجديد فوقه).

   التركيب:
     1) <script src="ai-invoice.js"></script>  قبل </body> مباشرة
        (وشيل سطر purchases.js القديم لو موجود)
     2) شغّل purchases-schema.sql (لو لسه) ثم spare-parts-schema.sql على Supabase
     3) انشر دالة parse-invoice (زي ما هي — مفيش تغيير فيها)
     4) افتح مفتاح gemini_invoice_ocr من لوحة الأدمن

   الميزتين (فواتير + مخزن) بيفضلوا مقفولين لحد ما المفتاح يتفتح.

   قطع الغيار بتتخزّن في جدول spare_parts. كل بند في فاتورة المشتريات
   بيتحوّل لصف قطعة عند الحفظ، وحالته بتيجي من "وجهة" البند:
     غير موجهة → مخزن عام | لوازم → لوازم صيانة | موجهة(+جهاز) → مربوطة بجهاز.
   والربط/إلغاء الربط/إعادة التصنيف بيتعملوا بعد كده من شاشة المخزن أو من الجهاز.
   ============================================================ */
(function () {
  'use strict';

  // ============================================================
  // الإعدادات — تقدر تغيّرها من dashboard.html قبل تحميل الملف ده
  // ============================================================
  const CFG = Object.assign({
    fnName: 'parse-invoice',       // اسم Edge Function
    table: 'purchase_invoices',
    partsTable: 'spare_parts',     // جدول قطع الغيار (Part 6)
    bucket: 'invoices',            // Storage bucket لصورة الفاتورة الأصلية
    keepOriginal: true,            // false = مفيش رفع للصورة خالص
    maxEdge: 1800,                 // أطول ضلع للصورة قبل الرفع (px)
    quality: 0.82,                 // جودة الـ JPEG بعد الضغط
    lowConfidence: 0.75,           // تحت كده = أصفر ومراجعة إجبارية
    totalTolerance: 1,             // فرق مقبول بالجنيه بين مجموع البنود والإجمالي
    timeoutMs: 90000,
    deviceSearchLimit: 8,          // أقصى نتائج في بحث الأجهزة السريع
    featureFlag: 'gemini_invoice_ocr',

    // ── خطّافات للربط بصفحة غير الداشبورد ─────────────────────
    // الموديول اتكتب أصلاً وهو فاهم إنه جوه dashboard.html، وبيقرا
    // منها devices و selectedId و currentUser مباشرة. لكن الديسباتشر
    // بيخزّن الأجهزة بشكل مختلف (type/customer بدل deviceType/customerName)،
    // فلو قرا منه على طول هيلاقي حقول فاضية.
    // الخطّافات دي بتخلي الصفحة تقول للموديول من فين ياخد اللي محتاجه.
    // سايبينها فاضية افتراضياً — فالداشبورد مايتأثرش بأي حاجة.
    devicesFn:      null,   // () => [سجلات الأجهزة الخام]
    openDeviceIdFn: null,   // () => id الجهاز المفتوح دلوقتي
    meNameFn:       null,   // () => اسم المستخدم
    flagFn:         null    // () => هل الميزة مفتوحة لليوزر ده؟
  }, window.PURCHASES_CONFIG || {});
  window.PURCHASES_CONFIG = CFG;

  // ============================================================
  // النصوص
  // ============================================================
  const STR = {
    ar: {
      'pur.menu': 'فواتير المشتريات',
      'pur.title': '🧾 فواتير المشتريات وقطع الغيار',
      'pur.addBtn': 'إضافة فاتورة مشتريات/قطع غيار بالذكاء الاصطناعي 📸',
      'pur.pickTitle': 'صوّر الفاتورة أو ارفعها',
      'pur.pickHint': 'صورة واضحة من فوق، والفاتورة كلها داخل الكادر.',
      'pur.pickCamera': '📷 تصوير بالكاميرا',
      'pur.pickPhoto': '🖼️ صورة من الجهاز',
      'pur.pickPdf': '📄 ملف PDF',
      'pur.reading': 'بنقرأ الفاتورة...',
      'pur.readingHint': 'بتاخد من ١٠ لـ ٣٠ ثانية حسب حجم الفاتورة.',
      'pur.cancel': 'إلغاء',
      'pur.verifyTitle': 'مراجعة الفاتورة قبل الحفظ',
      'pur.preview': 'الفاتورة الأصلية',
      'pur.openFile': 'فتح الملف في نافذة جديدة',
      'pur.pdfNoPreview': 'المتصفح مش بيعرض الـ PDF جوه الصفحة.',
      'pur.supplier': 'اسم المورد',
      'pur.date': 'تاريخ الفاتورة',
      'pur.number': 'رقم الفاتورة',
      'pur.grandTotal': 'إجمالي الفاتورة (ج.م)',
      'pur.items': 'البنود',
      'pur.itemName': 'الصنف',
      'pur.qty': 'الكمية',
      'pur.unit': 'سعر الوحدة',
      'pur.lineTotal': 'الإجمالي',
      'pur.target': 'الوجهة',
      'pur.targetAll': 'وجّه كل البنود إلى',
      'pur.target.allocated': 'قطع غيار موجهة',
      'pur.target.unallocated': 'قطع غيار غير موجهة',
      'pur.target.supplies': 'لوازم صيانة',
      'pur.addItem': '➕ إضافة بند يدوي',
      'pur.removeItem': 'حذف البند',
      'pur.sumItems': 'مجموع البنود',
      'pur.diff': 'الفرق',
      'pur.mismatch': '⚠️ مجموع البنود مش مطابق لإجمالي الفاتورة — فيه بند ناقص أو رقم غلط.',
      'pur.reviewCount': '⚠️ {n} حقل محتاج مراجعة — الذكاء الاصطناعي مش متأكد منها.',
      'pur.reviewNone': '✅ كل الحقول اتراجعت',
      'pur.reviewAll': 'راجعت كل الحقول',
      'pur.reviewChip': 'راجع',
      'pur.save': 'حفظ الفاتورة',
      'pur.saving': 'بنحفظ...',
      'pur.saved': 'الفاتورة اتسجلت ✅',
      'pur.retake': 'صورة تانية',
      'pur.needSupplier': 'اكتب اسم المورد الأول',
      'pur.needDate': 'اكتب تاريخ الفاتورة الأول',
      'pur.needItems': 'الفاتورة لازم يكون فيها بند واحد على الأقل',
      'pur.needReview': 'راجع الحقول الصفراء الأول',
      'pur.dupWarn': '⚠️ هذه الفاتورة تم إدخالها مسبقاً بتاريخ {d}، هل تريد المتابعة؟',
      'pur.dupContinue': 'أيوة، كمّل',
      'pur.dupCancel': 'لأ، إلغاء',
      'pur.dupBadge': 'مكررة',
      'pur.errNet': 'قراءة الفواتير محتاجة نت — استنى النت يرجع.',
      'pur.errBig': 'الملف كبير — صوّر الفاتورة تاني بجودة أقل.',
      'pur.errMime': 'النوع ده مش مدعوم — صورة أو PDF بس.',
      'pur.errRead': 'ما قدرناش نقرا الفاتورة: {m}',
      'pur.errNoItems': 'ما لقيناش بنود في الصورة دي — جرّب صورة أوضح أو ضيف البنود بإيدك.',
      'pur.errSave': 'الحفظ ما تمّش: {m}',
      'pur.recent': 'آخر الفواتير',
      'pur.empty': 'لسه مفيش فواتير مشتريات متسجلة',
      'pur.by': 'بواسطة',
      'pur.itemsCount': 'بند',
      'pur.searchPh': 'ابحث باسم المورد أو رقم الفاتورة...',
      'pur.periodTotals': 'إجماليات المعروض',
      'pur.aiNote': 'الأرقام مقروءة آلياً — المحاسب مسؤول عن مراجعتها قبل الحفظ.',
      'pur.itemDevice': 'الجهاز الموجهة له',
      'pur.itemDevicePick': 'اختر الجهاز',
      'pur.itemDeviceNone': 'من غير جهاز → هتتحط في المخزن العام',

      // مخزن قطع الغيار
      'inv.menu': 'مخزن قطع الغيار',
      'inv.title': '🧰 مخزن قطع الغيار',
      'inv.tab.unallocated': 'قطع غيار غير موجهة',
      'inv.tab.allocated': 'قطع غيار موجهة',
      'inv.tab.supplies': 'لوازم الصيانة',
      'inv.count': 'قطعة',
      'inv.totalCost': 'إجمالي التكلفة (ج.م)',
      'inv.searchPh': 'ابحث باسم القطعة أو الجهاز...',
      'inv.emptyUnallocated': 'المخزن العام فاضي — البنود بتيجي من فواتير المشتريات، أو ضيف قطعة يدوي.',
      'inv.emptyAllocated': 'لسه مفيش قطع مربوطة بأجهزة.',
      'inv.emptySupplies': 'مفيش لوازم صيانة متسجلة.',
      'inv.addManual': '➕ إضافة قطعة يدوي',
      'inv.name': 'اسم القطعة',
      'inv.qty': 'الكمية',
      'inv.unit': 'سعر الوحدة',
      'inv.cost': 'التكلفة',
      'inv.forDevice': 'الجهاز',
      'inv.source': 'من فاتورة',
      'inv.by': 'بواسطة',
      'inv.allocate': '🔗 ربط بجهاز',
      'inv.unlink': 'إلغاء الربط',
      'inv.toSupplies': 'تحويل إلى لوازم صيانة',
      'inv.toStock': 'إرجاع للمخزن العام',
      'inv.delete': 'حذف',
      'inv.save': 'حفظ',
      'inv.cancel': 'إلغاء',
      'inv.confirmDelete': 'تحذف القطعة دي نهائياً؟',
      'inv.needName': 'اكتب اسم القطعة الأول',
      'inv.linked': 'تم الربط بالجهاز ✅',
      'inv.unlinked': 'رجعت للمخزن العام ✅',
      'inv.movedSupplies': 'اتحوّلت للوازم الصيانة ✅',
      'inv.movedStock': 'رجعت للمخزن العام ✅',
      'inv.added': 'اتضافت للمخزن ✅',
      'inv.deleted': 'اتحذفت',
      'inv.errNet': 'العملية دي محتاجة نت — استنى النت يرجع.',
      'inv.errGeneric': 'العملية ما تمّتش: {m}',
      'inv.pickPartTitle': 'اختر قطعة من المخزن العام',
      'inv.noStock': 'المخزن العام فاضي — ضيف فاتورة مشتريات الأول أو قطعة يدوي.',
      'inv.link': 'ربط',

      // بحث الأجهزة السريع
      'dsrch.ph': 'رقم التذكرة / العميل / المحل / الموديل...',
      'dsrch.none': 'مفيش أجهزة مطابقة',
      'dsrch.change': 'تغيير',

      // قطع الغيار جوه شاشة الجهاز
      'dpart.title': '🧰 قطع الغيار المستخدمة',
      'dpart.empty': 'مفيش قطع غيار مربوطة بالجهاز ده.',
      'dpart.add': '➕ إضافة قطعة غيار من المخزن',
      'dpart.repair': 'قيمة الإصلاح',
      'dpart.partsCost': 'تكلفة قطع الغيار',
      'dpart.net': 'صافي ربح الجهاز',
      'dpart.unlink': 'إلغاء الربط',
      'dpart.suppliesNote': 'لوازم الصيانة مش داخلة في تكلفة الجهاز.'
    },
    en: {
      'pur.menu': 'Purchase Invoices',
      'pur.title': '🧾 Purchase & Spare-Part Invoices',
      'pur.addBtn': 'Add purchase / spare-part invoice with AI 📸',
      'pur.pickTitle': 'Photograph or upload the invoice',
      'pur.pickHint': 'Shoot straight from above with the whole invoice in frame.',
      'pur.pickCamera': '📷 Take a photo',
      'pur.pickPhoto': '🖼️ Choose an image',
      'pur.pickPdf': '📄 PDF file',
      'pur.reading': 'Reading the invoice...',
      'pur.readingHint': 'Takes 10–30 seconds depending on the invoice.',
      'pur.cancel': 'Cancel',
      'pur.verifyTitle': 'Review before saving',
      'pur.preview': 'Original invoice',
      'pur.openFile': 'Open file in a new tab',
      'pur.pdfNoPreview': 'This browser cannot preview PDFs inline.',
      'pur.supplier': 'Supplier name',
      'pur.date': 'Invoice date',
      'pur.number': 'Invoice number',
      'pur.grandTotal': 'Grand total (EGP)',
      'pur.items': 'Line items',
      'pur.itemName': 'Item',
      'pur.qty': 'Qty',
      'pur.unit': 'Unit cost',
      'pur.lineTotal': 'Total',
      'pur.target': 'Target',
      'pur.targetAll': 'Set all items to',
      'pur.target.allocated': 'Allocated spare parts',
      'pur.target.unallocated': 'Unallocated spare parts',
      'pur.target.supplies': 'Maintenance supplies',
      'pur.addItem': '➕ Add item manually',
      'pur.removeItem': 'Remove item',
      'pur.sumItems': 'Sum of items',
      'pur.diff': 'Difference',
      'pur.mismatch': '⚠️ Items do not add up to the grand total — a line is missing or a number is wrong.',
      'pur.reviewCount': '⚠️ {n} field(s) need review — the AI was not confident.',
      'pur.reviewNone': '✅ All fields reviewed',
      'pur.reviewAll': 'Mark all reviewed',
      'pur.reviewChip': 'review',
      'pur.save': 'Save invoice',
      'pur.saving': 'Saving...',
      'pur.saved': 'Invoice saved ✅',
      'pur.retake': 'Another photo',
      'pur.needSupplier': 'Enter the supplier name first',
      'pur.needDate': 'Enter the invoice date first',
      'pur.needItems': 'The invoice needs at least one line item',
      'pur.needReview': 'Review the highlighted fields first',
      'pur.dupWarn': '⚠️ This invoice was already entered on {d}. Continue anyway?',
      'pur.dupContinue': 'Yes, continue',
      'pur.dupCancel': 'No, cancel',
      'pur.dupBadge': 'duplicate',
      'pur.errNet': 'Reading invoices needs an internet connection.',
      'pur.errBig': 'File too large — retake the photo at lower quality.',
      'pur.errMime': 'Unsupported file — images or PDF only.',
      'pur.errRead': 'Could not read the invoice: {m}',
      'pur.errNoItems': 'No line items found — try a clearer photo or add them manually.',
      'pur.errSave': 'Save failed: {m}',
      'pur.recent': 'Recent invoices',
      'pur.empty': 'No purchase invoices recorded yet',
      'pur.by': 'by',
      'pur.itemsCount': 'items',
      'pur.searchPh': 'Search by supplier or invoice number...',
      'pur.periodTotals': 'Totals shown',
      'pur.aiNote': 'Figures are machine-read — the accountant reviews them before saving.',
      'pur.itemDevice': 'Allocated to device',
      'pur.itemDevicePick': 'Choose device',
      'pur.itemDeviceNone': 'No device → goes to general stock',

      'inv.menu': 'Spare-parts store',
      'inv.title': '🧰 Spare-parts store',
      'inv.tab.unallocated': 'Unallocated parts',
      'inv.tab.allocated': 'Allocated parts',
      'inv.tab.supplies': 'Maintenance supplies',
      'inv.count': 'items',
      'inv.totalCost': 'Total cost (EGP)',
      'inv.searchPh': 'Search by part or device...',
      'inv.emptyUnallocated': 'General stock is empty — items arrive from purchase invoices, or add one manually.',
      'inv.emptyAllocated': 'No parts linked to devices yet.',
      'inv.emptySupplies': 'No maintenance supplies recorded.',
      'inv.addManual': '➕ Add part manually',
      'inv.name': 'Part name',
      'inv.qty': 'Qty',
      'inv.unit': 'Unit cost',
      'inv.cost': 'Cost',
      'inv.forDevice': 'Device',
      'inv.source': 'from invoice',
      'inv.by': 'by',
      'inv.allocate': '🔗 Link to device',
      'inv.unlink': 'Unlink',
      'inv.toSupplies': 'Move to supplies',
      'inv.toStock': 'Return to stock',
      'inv.delete': 'Delete',
      'inv.save': 'Save',
      'inv.cancel': 'Cancel',
      'inv.confirmDelete': 'Delete this part permanently?',
      'inv.needName': 'Enter the part name first',
      'inv.linked': 'Linked to device ✅',
      'inv.unlinked': 'Returned to general stock ✅',
      'inv.movedSupplies': 'Moved to maintenance supplies ✅',
      'inv.movedStock': 'Returned to general stock ✅',
      'inv.added': 'Added to stock ✅',
      'inv.deleted': 'Deleted',
      'inv.errNet': 'This action needs an internet connection.',
      'inv.errGeneric': 'Action failed: {m}',
      'inv.pickPartTitle': 'Choose a part from general stock',
      'inv.noStock': 'General stock is empty — add a purchase invoice or a manual part first.',
      'inv.link': 'Link',

      'dsrch.ph': 'Ticket # / customer / shop / model...',
      'dsrch.none': 'No matching devices',
      'dsrch.change': 'Change',

      'dpart.title': '🧰 Spare parts used',
      'dpart.empty': 'No spare parts linked to this device.',
      'dpart.add': '➕ Add spare part from store',
      'dpart.repair': 'Repair charge',
      'dpart.partsCost': 'Spare-parts cost',
      'dpart.net': 'Device net profit',
      'dpart.unlink': 'Unlink',
      'dpart.suppliesNote': 'Maintenance supplies are excluded from device cost.'
    }
  };

  try {
    if (window.I18N && I18N.STRINGS) {
      Object.assign(I18N.STRINGS.ar, STR.ar);
      Object.assign(I18N.STRINGS.en, STR.en);
    }
  } catch (e) { /* الملف شغال بالعربي لوحده لو i18n مش موجود */ }

  const T = (k, v) => {
    if (window.t) return window.t(k, v);
    let s = STR.ar[k] || k;
    if (v) Object.keys(v).forEach(x => { s = s.split('{' + x + '}').join(v[x]); });
    return s;
  };

  // ============================================================
  // أدوات صغيرة
  // ============================================================
  const $ = id => document.getElementById(id);
  const esc = s => { const d = document.createElement('div'); d.innerText = s == null ? '' : s; return d.innerHTML; };
  const online = () => (typeof isOnline === 'function' ? isOnline() : navigator.onLine !== false);
  const flagOn = () => {
    if (typeof CFG.flagFn === 'function') {
      try { return CFG.flagFn() === true; } catch (e) { return false; }
    }
    try { return typeof isFeatureEnabled === 'function' && isFeatureEnabled(CFG.featureFlag); }
    catch (e) { return false; }
  };
  const uid = () => 'i' + Math.random().toString(36).slice(2, 9);
  const money = n => (Number(n) || 0).toLocaleString('en-EG', { maximumFractionDigits: 2 });

  // الأرقام العربية والفواصل → رقم حقيقي
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const s = String(v ?? '')
      .replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x0660)
      .replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 0x06F0)
      .replace(/[^\d.\-]/g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function toast(msg, ok) {
    const el = document.createElement('div');
    el.className = 'pur-toast';
    el.style.background = ok === false ? 'var(--danger,#DC2626)' : 'var(--success,#15803D)';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 350); }, 3600);
  }

  const TARGETS = [
    { key: 'unallocated', k: 'pur.target.unallocated', color: 'var(--info,#2563EB)' },
    { key: 'allocated', k: 'pur.target.allocated', color: 'var(--success,#15803D)' },
    { key: 'supplies', k: 'pur.target.supplies', color: 'var(--warn,#B45309)' }
  ];
  const targetLabel = k => T((TARGETS.find(x => x.key === k) || TARGETS[0]).k);

  // ============================================================
  // بحث الأجهزة السريع (Part 6)
  // بيدوّر جوه مصفوفة devices العامة في الصفحة — سريع وبيشتغل أوفلاين،
  // برقم التذكرة (آخر ٥ من المعرّف) أو العميل أو المحل أو الموديل.
  // ============================================================
  const ticketNo = d => (d && d.id ? String(d.id).slice(-5).toUpperCase() : '');
  function deviceLabelOf(d) {
    if (!d) return '';
    const model = [d.deviceType, d.model].filter(Boolean).join(' ').trim();
    return '#' + ticketNo(d) + (d.customerName ? ' — ' + d.customerName : '') + (model ? ' — ' + model : '');
  }
  // العطل — بيتعرض في سطر تاني تحت العنوان في نتايج البحث،
  // عشان المستخدم يعرف الجهاز من غير ما يفتحه
  function deviceIssueOf(d) {
    return (d && d.reportedIssue) ? String(d.reportedIssue).trim() : '';
  }
  // ============================================================
  // ⚠️ الوصول لمتغيرات الداشبورد العامة
  // ------------------------------------------------------------
  // في dashboard.html المتغيرات دي معرّفة بـ let:
  //     let devices = [];   let selectedId = null;   let currentUser = {...}
  // والمتغيّر المعرّف بـ let مش بيتعلّق على window — ده سلوك جافاسكريبت نفسها
  // مش غلط في الداشبورد. يعني window.devices بترجع undefined دايماً، وأي
  // كود بيعتمد عليها بيفشل بصمت (زي قسم قطع الغيار في شاشة الجهاز).
  // بس الاسم متاح في النطاق العام المشترك، فبنقراه كاسم مجرد.
  // ============================================================
  function allDevices() {
    if (typeof CFG.devicesFn === 'function') {
      try { const v = CFG.devicesFn(); if (Array.isArray(v)) return v; } catch (e) {}
    }
    try { if (typeof devices !== 'undefined' && Array.isArray(devices)) return devices; } catch (e) {}
    return Array.isArray(window.devices) ? window.devices : [];
  }
  function openDeviceId() {
    if (typeof CFG.openDeviceIdFn === 'function') {
      try { const v = CFG.openDeviceIdFn(); if (v) return v; } catch (e) {}
    }
    try { if (typeof selectedId !== 'undefined' && selectedId) return selectedId; } catch (e) {}
    return window.selectedId || null;
  }
  function meName() {
    if (typeof CFG.meNameFn === 'function') {
      try { const v = CFG.meNameFn(); if (v) return v; } catch (e) {}
    }
    try { if (typeof currentUser !== 'undefined' && currentUser) return currentUser.name || ''; } catch (e) {}
    return (window.currentUser && window.currentUser.name) || '';
  }

  function deviceById(id) {
    try { return allDevices().find(d => d.id === id) || null; } catch (e) { return null; }
  }
  // آخر لمسة — أساس الترتيب.
  // ⚠️ lastModifiedAt فاضي على الأجهزة القديمة، فبننزل لتاريخ
  //    الاستلام بدل ما يتحطوا في آخر القايمة بالغلط.
  function touchedAt(d) {
    return new Date((d && (d.lastModifiedAt || d.intakeDate)) || 0).getTime();
  }

  function searchDevices(q, limit) {
    const list = allDevices();
    const s = String(q || '').trim().toLowerCase();
    if (!s) return [];
    const cap = limit || CFG.deviceSearchLimit;
    const res = [];
    // ⚠️ بنلف على القايمة كلها مش بنقف عند أول "cap" نتيجة.
    //    الوقوف بدري كان بيمنع الترتيب من الشغل: كنا بناخد أول ٢٠
    //    بترتيب الذاكرة وبعدين نرتّبهم — يعني الجهاز اللي اتلمس
    //    دلوقتي ممكن ما يدخلش أصلاً.
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const hay = [ticketNo(d), d.customerName, d.shopName, d.deviceType,
                   d.model, d.serialNumber,
                   d.reportedIssue]          // ← جديد: البحث بالعطل
        .filter(Boolean).join(' ').toLowerCase();
      if (hay.indexOf(s) !== -1) res.push(d);
    }
    // آخر لمسة الأول
    res.sort((a, b) => touchedAt(b) - touchedAt(a));
    return res.slice(0, cap);
  }

  // مكوّن قابل لإعادة الاستخدام.
  //  chosen  = { device_id, device_label, devQuery }
  //  onQuery = جملة oninput كاملة، مثال: "PUR.itemDevQuery('X', this.value)"
  //  onPick  = بادئة نداء بيتقفل عليها 'معرّف_الجهاز') — مثال: "PUR.setItemDev('X', " أو "INV.pickAllocDev("
  //  onClear = جملة onclick كاملة، مثال: "PUR.clearItemDev('X')"
  function deviceSearchHtml(domId, chosen, onQuery, onPick, onClear) {
    if (chosen.device_id) {
      const d = deviceById(chosen.device_id);
      const label = (d ? deviceLabelOf(d) : chosen.device_label) || chosen.device_label || '';
      return `<div class="dsrch-chosen">
        <span class="dsrch-picked">${esc(label)}</span>
        <button type="button" class="dsrch-change" onclick="${onClear}">${esc(T('dsrch.change'))}</button>
      </div>`;
    }
    const q = chosen.devQuery || '';
    // النتايج في حاوية منفصلة — عشان نحدّثها لوحدها من غير ما نلمس
    // خانة الكتابة (لمسها بيقفل الكيبورد على الموبايل)
    return `<div class="dsrch" id="${domId}">
      <input class="dsrch-inp" value="${esc(q)}" placeholder="${esc(T('dsrch.ph'))}"
             oninput="${onQuery}" autocomplete="off" />
      <div id="${domId}_drop">${deviceDropHtml(q, onPick)}</div>
    </div>`;
  }

  // نتايج بحث الأجهزة لوحدها
  function deviceDropHtml(q, onPick) {
    if (!String(q || '').trim()) return '';
    const hits = searchDevices(q, CFG.deviceSearchLimit);
    return `<div class="dsrch-drop">${
      hits.length
        ? hits.map(d => {
            const iss = deviceIssueOf(d);
            return `<button type="button" class="dsrch-opt" onclick="${onPick}'${esc(d.id)}')">`
              + `<span class="dsrch-t">${esc(deviceLabelOf(d))}</span>`
              + (iss ? `<span class="dsrch-i">🛠️ ${esc(iss)}</span>` : '')
              + `</button>`;
          }).join('')
        : `<div class="dsrch-empty">${esc(T('dsrch.none'))}</div>`
    }</div>`;
  }

  // ============================================================
  // الستايل
  // ============================================================
  function injectCss() {
    if ($('purStyles')) return;
    const s = document.createElement('style');
    s.id = 'purStyles';
    s.textContent = `
  .pur-toast{position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:9999;
    color:#fff; padding:12px 18px; border-radius:10px; font-family:'Tajawal',sans-serif;
    font-size:14px; font-weight:700; box-shadow:0 6px 20px rgba(0,0,0,.25); transition:opacity .3s;
    max-width:90vw; text-align:center;}
  #purOverlay{z-index:40;}
  .pur-hero{background:var(--surface,#fff); border:1px solid var(--border,#EEF0F3); border-radius:14px; padding:18px;
    box-shadow:0 2px 8px rgba(16,16,20,.04); margin-bottom:16px;}
  .pur-cta{width:100%; background:var(--accent,#0891A8); color:var(--on-accent,#fff); border:none; border-radius:12px;
    padding:16px 18px; font-family:'Cairo',sans-serif; font-size:15.5px; font-weight:800;
    cursor:pointer; line-height:1.6;}
  .pur-cta:hover{background:var(--accent-dark,#077A8F);}
  .pur-cta:disabled{background:var(--border-strong,#CBD5E1); color:var(--muted-2,#94A3B8); cursor:not-allowed;}
  .pur-note{font-size:12.5px; color:var(--muted,#64748B); margin-top:10px; line-height:1.7;}
  .pur-pick{display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:14px;}
  @media (max-width:560px){ .pur-pick{grid-template-columns:1fr;} }
  .pur-pick button{background:var(--surface-2,#F8FAFC); border:1.5px solid var(--border,#E2E8F0); border-radius:10px; padding:14px 10px;
    font-family:inherit; font-size:14px; font-weight:700; color:var(--ink,#1A2332); cursor:pointer;}
  .pur-pick button:hover{border-color:var(--accent,#0891A8); background:var(--surface,#fff);}

  /* شاشة القراءة */
  .pur-busy{text-align:center; padding:34px 16px;}
  .pur-spin{width:42px; height:42px; margin:0 auto 14px; border-radius:50%;
    border:4px solid var(--border,#E2E8F0); border-top-color:var(--accent,#0891A8); animation:purSpin .9s linear infinite;}
  @keyframes purSpin{to{transform:rotate(360deg);}}
  @media (prefers-reduced-motion:reduce){ .pur-spin{animation-duration:2.4s;} }

  /* الشاشة المقسومة */
  .pur-split{display:grid; grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr); gap:16px; align-items:start;}
  @media (max-width:940px){ .pur-split{grid-template-columns:1fr;} }
  .pur-pane{background:var(--surface,#fff); border:1px solid var(--border,#EEF0F3); border-radius:14px; padding:14px;
    box-shadow:0 2px 8px rgba(16,16,20,.04);}
  @media (min-width:941px){ .pur-pane-img{position:sticky; top:12px;} }
  .pur-pane-title{font-family:'Cairo',sans-serif; font-size:14px; font-weight:800; margin:0 0 10px;}
  .pur-img{width:100%; max-height:70vh; object-fit:contain; border-radius:10px; background:#0F172A0D;
    display:block; cursor:zoom-in;}
  .pur-pdf{width:100%; height:70vh; border:1px solid var(--border,#E2E8F0); border-radius:10px; background:var(--surface,#fff);}
  .pur-zoom{position:fixed; inset:0; background:rgba(0,0,0,.9); z-index:9998; display:flex;
    align-items:center; justify-content:center; padding:12px; cursor:zoom-out;}
  .pur-zoom img{max-width:100%; max-height:100%; object-fit:contain;}

  /* الحقول */
  .pur-f{display:block; margin-bottom:12px;}
  .pur-f span{font-size:12px; color:var(--muted,#64748B); display:flex; align-items:center; gap:6px; margin-bottom:4px;}
  .pur-f input, .pur-f select{width:100%; border:1px solid var(--border,#E2E8F0); border-radius:8px; padding:10px 12px;
    font-size:14px; font-family:inherit; color:var(--ink,#1A2332); background:var(--surface,#fff);}
  .pur-f input:focus{outline:2px solid rgba(8,145,168,.3); border-color:var(--accent,#0891A8);}
  .pur-low{background:var(--warn-border,#FEF08A) !important; border-color:var(--warn,#EAB308) !important;}
  .pur-chip{font-size:10.5px; font-weight:800; background:var(--warn-border,#FEF08A); color:var(--warn-strong,#854D0E); border:1px solid var(--warn,#EAB308);
    border-radius:999px; padding:2px 8px; cursor:pointer; font-family:inherit;}
  .pur-chip:hover{background:var(--warn-border,#FDE047);}
  .pur-row2{display:grid; grid-template-columns:1fr 1fr; gap:10px;}
  @media (max-width:560px){ .pur-row2{grid-template-columns:1fr;} }

  /* شريط المراجعة */
  .pur-review{display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;
    border-radius:10px; padding:10px 14px; font-size:13px; font-weight:700; margin-bottom:12px;}
  .pur-review.warn{background:var(--warn-tint,#FEFCE8); border:1px solid var(--warn-border,#FDE047); color:var(--warn-strong,#854D0E);}
  .pur-review.ok{background:var(--success-bg,#F0FDF4); border:1px solid var(--success-border,#BBF7D0); color:var(--success,#15803D);}
  .pur-mini{background:var(--surface,#fff); border:1px solid currentColor; border-radius:8px; padding:6px 12px;
    font-size:12.5px; font-weight:700; font-family:inherit; cursor:pointer; color:inherit;}

  /* البنود */
  .pur-item{border:1px solid var(--border,#EEF0F3); border-radius:12px; padding:12px; margin-bottom:10px; background:var(--surface-2,#FCFDFE);}
  .pur-item-head{display:flex; align-items:center; gap:8px; margin-bottom:8px;}
  .pur-item-no{font-family:'Cairo',sans-serif; font-weight:800; font-size:12px; color:var(--muted-2,#94A3B8);
    min-width:22px;}
  .pur-item-del{margin-inline-start:auto; background:none; border:none; color:var(--danger,#DC2626); cursor:pointer;
    font-size:17px; min-width:34px; min-height:34px;}
  .pur-item-grid{display:grid; grid-template-columns:2.4fr 0.8fr 1fr 1fr; gap:8px;}
  @media (max-width:760px){ .pur-item-grid{grid-template-columns:1fr 1fr;} }
  .pur-tsel{width:100%; margin-top:8px; border:1px solid var(--border,#E2E8F0); border-radius:8px; padding:9px 10px;
    font-size:13px; font-family:inherit; background:var(--surface,#fff); font-weight:700;}
  .pur-bulk{display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px;
    font-size:12.5px; color:var(--muted,#64748B);}
  .pur-bulk select{border:1px solid var(--border,#E2E8F0); border-radius:8px; padding:8px 10px; font-family:inherit;
    font-size:13px; background:var(--surface,#fff);}

  /* الإجماليات */
  .pur-sums{display:flex; gap:14px; flex-wrap:wrap; justify-content:space-between; align-items:center;
    background:var(--surface-2,#F8FAFC); border-radius:10px; padding:12px 14px; margin:12px 0; font-size:13.5px;}
  .pur-sums b{font-family:'Cairo',sans-serif; font-size:16px;}
  .pur-alert{background:var(--danger-bg,#FEF2F2); border:1px solid var(--danger-border,#FECACA); color:var(--danger-strong,#B91C1C); border-radius:10px;
    padding:10px 14px; font-size:13px; font-weight:700; margin-bottom:12px; line-height:1.7;}

  /* التكرار */
  .pur-dup{background:var(--warn-tint,#FFFBEB); border:1.5px solid var(--warn-border,#FDE047); border-radius:12px; padding:14px;
    margin-bottom:12px;}
  .pur-dup p{margin:0 0 10px; font-size:13.5px; font-weight:700; color:var(--warn-strong,#854D0E); line-height:1.8;}
  .pur-dup-btns{display:flex; gap:8px; flex-wrap:wrap;}

  /* القائمة */
  .pur-card{background:var(--surface,#fff); border:1px solid var(--border,#EEF0F3); border-radius:12px; padding:14px 16px;
    margin-bottom:8px; box-shadow:0 2px 8px rgba(16,16,20,.04); cursor:pointer;}
  .pur-card:hover{background:var(--surface-2,#F8FAFC);}
  .pur-card-top{display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;}
  .pur-card-name{font-family:'Cairo',sans-serif; font-weight:800; font-size:14.5px;}
  .pur-card-total{font-family:'Cairo',sans-serif; font-weight:900; font-size:16px; color:var(--ink,#1A2332);}
  .pur-card-sub{font-size:12.5px; color:var(--muted,#64748B); margin-top:4px; display:flex; gap:10px; flex-wrap:wrap;}
  .pur-tag{display:inline-block; font-size:11px; font-weight:800; padding:3px 8px; border-radius:6px;}
  .pur-tot-cards{display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:14px;}
  .pur-tot{background:var(--surface,#fff); border:1px solid var(--border,#EEF0F3); border-radius:12px; padding:14px; text-align:center;}
  .pur-tot-n{font-family:'Cairo',sans-serif; font-size:22px; font-weight:900;}
  .pur-tot-l{font-size:12.5px; color:var(--ink-2,#475569); margin-top:4px; font-weight:600;}
  .pur-detail{margin-top:10px; border-top:1px dashed var(--border,#E2E8F0); padding-top:10px;}
  .pur-detail table{width:100%; border-collapse:collapse; font-size:12.5px;}
  .pur-detail th{text-align:start; color:var(--muted-2,#94A3B8); font-weight:700; padding:4px 6px;}
  .pur-detail td{padding:5px 6px; border-top:1px solid var(--surface-3,#F1F5F9);}
  `;
    document.head.appendChild(s);
  }

  // ============================================================
  // الشاشة
  // ============================================================
  function injectDom() {
    if ($('purOverlay')) return;
    const o = document.createElement('div');
    o.id = 'purOverlay';
    o.className = 'overlay hidden';
    o.style.cssText = 'align-items:stretch; justify-content:stretch; padding:0; overflow-y:auto;';
    o.innerHTML = `
      <div class="summaries-page">
        <div class="modal-head" style="padding:16px 20px;">
          <h2 data-i18n="pur.title">${esc(T('pur.title'))}</h2>
          <button class="close-btn" onclick="PUR.close()">×</button>
        </div>
        <div id="purBody" style="padding:12px 20px 48px;"></div>
      </div>`;
    document.body.appendChild(o);

    const mk = (id, accept, capture) => {
      const i = document.createElement('input');
      i.type = 'file'; i.id = id; i.accept = accept; i.style.display = 'none';
      if (capture) i.setAttribute('capture', 'environment');
      // ⚠️ بنفضّي الخانة **قبل** ما نبدأ القراءة. لو الحدث اتطلق مرتين
      //    (بيحصل على أندرويد)، المرة التانية بتلاقيها فاضية فمتبعتش
      //    طلب تاني لـ Gemini.
      i.onchange = () => {
        const f = i.files && i.files[0];
        i.value = '';
        if (f) PUR.onFile(f);
      };
      document.body.appendChild(i);
    };
    mk('purCam', 'image/*', true);
    mk('purImg', 'image/*', false);
    mk('purPdf', 'application/pdf', false);
  }

  // أزرار القائمة — بتظهر بس لما المفتاح يكون مفتوح
  function syncMenu() {
    const dd = $('menuDropdown');
    if (!dd) return;
    const on = flagOn();
    const out = dd.querySelector('button[onclick="logout()"]');
    const ensure = (id, label, handler) => {
      let b = $(id);
      if (on) {
        if (!b) {
          b = document.createElement('button');
          b.id = id;
          b.onclick = handler;
          out ? dd.insertBefore(b, out) : dd.appendChild(b);
        }
        b.textContent = label;
      } else if (b) { b.remove(); }
    };
    ensure('purMenuBtn', '🧾 ' + T('pur.menu'), () => PUR.open());
    ensure('invMenuBtn', '🧰 ' + T('inv.menu'), () => INV.open());
  }

  // ============================================================
  // الحالة
  // ============================================================
  const S = {
    view: 'home',        // home | busy | verify
    file: null, mime: '', url: '', b64: '',
    header: {}, conf: {}, seen: {}, items: [],
    model: '', raw: null, warnings: [],
    dup: null, dupOk: false,
    saving: false, list: [], listOpen: null, q: ''
  };

  function resetEntry() {
    if (S.url) { try { URL.revokeObjectURL(S.url); } catch (e) {} }
    Object.assign(S, {
      view: 'home', file: null, mime: '', url: '', b64: '',
      header: {}, conf: {}, seen: {}, items: [],
      model: '', raw: null, warnings: [], dup: null, dupOk: false, saving: false
    });
  }

  // ============================================================
  // منطق المراجعة الإجبارية
  // ============================================================
  // الأصفر مش مبني على ثقة الموديل لوحدها. الموديل ممكن يقول "متأكد" وهو غلط،
  // فبنضيف فحوصات حسابية جنبها: الحقل الفاضي، التاريخ المستحيل، وسطر
  // ضربه مش طالع صح — كلهم بيولّعوا أصفر مهما كانت الثقة.
  const LOW = () => CFG.lowConfidence;

  function headerNeeds(f) {
    if (S.seen[f]) return false;
    const v = S.header[f];
    if (f === 'invoice_number') {
      if (!v) return false;                       // مش كل الفواتير عليها رقم
      return (S.conf[f] ?? 0) < LOW();
    }
    if (f === 'supplier_name') return !v || (S.conf[f] ?? 0) < LOW();
    if (f === 'invoice_date') {
      if (!v) return true;
      const d = new Date(v + 'T00:00:00');
      if (isNaN(d)) return true;
      const now = Date.now();
      if (d.getTime() > now + 86400000) return true;                 // فاتورة من المستقبل
      if (d.getTime() < now - 5 * 365 * 86400000) return true;       // أقدم من ٥ سنين
      return (S.conf[f] ?? 0) < LOW();
    }
    if (f === 'grand_total') {
      if (!num(v)) return true;
      if (Math.abs(sumItems() - num(v)) > CFG.totalTolerance) return true;
      return (S.conf[f] ?? 0) < LOW();
    }
    return false;
  }

  function itemNeeds(it, f) {
    if (it.seen[f]) return false;
    const lowConf = (it.confidence ?? 0) < LOW();
    if (f === 'item_name') return !it.item_name || lowConf;
    const bad = Math.abs(num(it.quantity) * num(it.unit_cost_price) - num(it.total_price)) > 0.5;
    if (f === 'quantity') return !num(it.quantity) || bad || lowConf;
    if (f === 'unit_cost_price') return !num(it.unit_cost_price) || bad || lowConf;
    if (f === 'total_price') return !num(it.total_price) || bad || lowConf;
    return false;
  }

  function reviewCount() {
    let n = 0;
    ['supplier_name', 'invoice_date', 'invoice_number', 'grand_total'].forEach(f => { if (headerNeeds(f)) n++; });
    S.items.forEach(it => {
      ['item_name', 'quantity', 'unit_cost_price', 'total_price'].forEach(f => { if (itemNeeds(it, f)) n++; });
    });
    return n;
  }

  const sumItems = () => S.items.reduce((t, it) => t + num(it.total_price), 0);

  // ============================================================
  // الملف: ضغط + base64
  // ============================================================
  async function toBase64(blob) {
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('read'));
      r.readAsDataURL(blob);
    });
    return String(dataUrl).split(',')[1] || '';
  }

  // بنصغّر الصورة قبل الرفع: أسرع على نت المحل، وأرخص في التوكنز.
  // لو المتصفح مش عارف يفك الصورة (HEIC من الآيفون مثلاً) بنبعتها زي ما هي.
  async function shrink(file) {
    if (!/^image\//.test(file.type)) return { blob: file, mime: file.type };
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, CFG.maxEdge / Math.max(bmp.width, bmp.height));
      if (scale >= 1 && file.size < 1.5 * 1024 * 1024) { bmp.close && bmp.close(); return { blob: file, mime: file.type }; }
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close && bmp.close();
      const out = await new Promise(r => c.toBlob(r, 'image/jpeg', CFG.quality));
      if (!out || out.size > file.size) return { blob: file, mime: file.type };
      return { blob: out, mime: 'image/jpeg' };
    } catch (e) {
      return { blob: file, mime: file.type || 'image/jpeg' };
    }
  }

  // ============================================================
  // نداء الدالة
  // ============================================================
  async function parseInvoice(mime, b64) {
    const { data: { session } } = await sb.auth.getSession();
    const token = session && session.access_token;
    const body = JSON.stringify({ mimeType: mime, dataBase64: b64 });

    // fetch مباشر عشان نقدر نقطع الطلب لو طوّل
    const base = sb.supabaseUrl || (sb.functions && sb.functions.url);
    if (base && token) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), CFG.timeoutMs);
      try {
        const url = String(base).replace(/\/+$/, '') +
          (String(base).includes('/functions/v1') ? '' : '/functions/v1') + '/' + CFG.fnName;
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'apikey': sb.supabaseKey || ''
          },
          body, signal: ctl.signal
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error((j && j.message) || (j && j.error) || ('HTTP ' + r.status));
        return j;
      } finally { clearTimeout(timer); }
    }

    // احتياطي: عميل supabase-js
    const { data, error } = await sb.functions.invoke(CFG.fnName, { body: JSON.parse(body) });
    if (error) throw error;
    return data;
  }

  // ============================================================
  // حارس التكرار: (المورد + التاريخ + الإجمالي)
  // ============================================================
  async function findDuplicate(supplier, date, total) {
    if (!supplier || !date) return null;
    try {
      const { data, error } = await sb.from(CFG.table)
        .select('id, supplier_name, invoice_date, grand_total, created_at, created_by_name')
        .eq('invoice_date', date)
        .limit(50);
      if (error) throw error;
      const norm = s => String(s || '').trim().toLowerCase();
      return (data || []).find(r =>
        norm(r.supplier_name) === norm(supplier) &&
        Math.abs(num(r.grand_total) - num(total)) < 0.01
      ) || null;
    } catch (e) { return null; }
  }

  // ============================================================
  // الرسم
  // ============================================================
  function render() {
    const b = $('purBody');
    if (!b) return;
    b.innerHTML =
      S.view === 'busy' ? viewBusy() :
      S.view === 'verify' ? viewVerify() : viewHome();
    if (window.I18N) { try { I18N.applyTranslations(b); } catch (e) {} }
  }

  function viewHome() {
    return `
      <div class="pur-hero">
        <button class="pur-cta" onclick="PUR.pick()">${esc(T('pur.addBtn'))}</button>
        <div class="pur-note">${esc(T('pur.pickHint'))} ${esc(T('pur.aiNote'))}</div>
        <div class="pur-pick" id="purPickRow" style="display:none;">
          <button onclick="PUR.choose('purCam')">${esc(T('pur.pickCamera'))}</button>
          <button onclick="PUR.choose('purImg')">${esc(T('pur.pickPhoto'))}</button>
          <button onclick="PUR.choose('purPdf')">${esc(T('pur.pickPdf'))}</button>
        </div>
      </div>
      ${listHtml()}`;
  }

  function viewBusy() {
    return `<div class="pur-pane pur-busy">
      <div class="pur-spin"></div>
      <div style="font-family:'Cairo',sans-serif; font-weight:800; font-size:15px;">${esc(T('pur.reading'))}</div>
      <div class="pur-note">${esc(T('pur.readingHint'))}</div>
      <button class="pur-mini" style="margin-top:16px; color:var(--danger,#DC2626);" onclick="PUR.abort()">${esc(T('pur.cancel'))}</button>
    </div>`;
  }

  function fieldHtml(f, label, type) {
    const need = headerNeeds(f);
    const v = S.header[f] == null ? '' : S.header[f];
    return `<label class="pur-f">
      <span>${esc(label)}<span id="purHchip_${f}">${need ? `<button class="pur-chip" onclick="PUR.ack('${f}')">${esc(T('pur.reviewChip'))} ✓</button>` : ''}</span></span>
      <input id="purH_${f}" type="${type}" value="${esc(v)}" class="${need ? 'pur-low' : ''}"
             oninput="PUR.setH('${f}', this.value)" />
    </label>`;
  }

  function itemHtml(it, i) {
    const cell = (f, label, type, step) => {
      const need = itemNeeds(it, f);
      return `<label class="pur-f" style="margin:0;">
        <span>${esc(label)}<span id="purIchip_${it.id}_${f}">${need ? `<button class="pur-chip" onclick="PUR.ackI('${it.id}','${f}')">✓</button>` : ''}</span></span>
        <input id="purI_${it.id}_${f}" type="${type}" ${step ? 'step="' + step + '" inputmode="decimal"' : ''} value="${esc(it[f])}"
               class="${need ? 'pur-low' : ''}" oninput="PUR.setI('${it.id}','${f}',this.value)" />
      </label>`;
    };
    return `<div class="pur-item">
      <div class="pur-item-head">
        <span class="pur-item-no">${i + 1}.</span>
        <button class="pur-item-del" title="${esc(T('pur.removeItem'))}" onclick="PUR.delI('${it.id}')">🗑</button>
      </div>
      <div class="pur-item-grid">
        ${cell('item_name', T('pur.itemName'), 'text')}
        ${cell('quantity', T('pur.qty'), 'number', '1')}
        ${cell('unit_cost_price', T('pur.unit'), 'number', '0.01')}
        ${cell('total_price', T('pur.lineTotal'), 'number', '0.01')}
      </div>
      <select class="pur-tsel" onchange="PUR.setI('${it.id}','target',this.value)">
        ${TARGETS.map(tg => `<option value="${tg.key}" ${it.target === tg.key ? 'selected' : ''}>${esc(T(tg.k))}</option>`).join('')}
      </select>
      ${it.target === 'allocated' ? `
        <div class="pur-devwrap">
          <span class="pur-devlbl">${esc(T('pur.itemDevice'))}</span>
          ${deviceSearchHtml('pdev_' + it.id, it,
            `PUR.itemDevQuery('${it.id}', this.value)`,
            `PUR.setItemDev('${it.id}', `,
            `PUR.clearItemDev('${it.id}')`)}
          ${!it.device_id ? `<div class="pur-devhint">${esc(T('pur.itemDeviceNone'))}</div>` : ''}
        </div>` : ''}
    </div>`;
  }

  // ---- الأجزاء الحيّة: بتتحدّث لوحدها مع كل تعديل من غير إعادة رسم الشاشة ----
  function reviewBarHtml() {
    const n = reviewCount();
    return `<div class="pur-review ${n ? 'warn' : 'ok'}">
      <span>${n ? esc(T('pur.reviewCount', { n: n })) : esc(T('pur.reviewNone'))}</span>
      ${n ? `<button class="pur-mini" onclick="PUR.ackAll()">${esc(T('pur.reviewAll'))}</button>` : ''}
    </div>`;
  }

  function sumsHtml() {
    const sum = sumItems();
    const gt = num(S.header.grand_total);
    const diff = sum - gt;
    const mismatch = Math.abs(diff) > CFG.totalTolerance;
    return `
      ${mismatch ? `<div class="pur-alert" style="margin-top:12px;">${esc(T('pur.mismatch'))}</div>` : ''}
      <div class="pur-sums">
        <span>${esc(T('pur.sumItems'))}: <b>${money(sum)}</b> ج.م</span>
        <span>${esc(T('pur.grandTotal'))}: <b>${money(gt)}</b> ج.م</span>
        <span style="color:${mismatch ? 'var(--danger,#DC2626)' : 'var(--success,#15803D)'};">
          ${esc(T('pur.diff'))}: <b>${money(diff)}</b> ج.م</span>
      </div>`;
  }

  function saveBarHtml() {
    const n = reviewCount();
    return `
      <button class="pur-cta" ${n || S.saving ? 'disabled' : ''} onclick="PUR.save()">
        ${S.saving ? esc(T('pur.saving')) : esc(T('pur.save'))}
      </button>
      ${n ? `<div class="pur-note" style="color:var(--warn,#B45309);">${esc(T('pur.needReview'))}</div>` : ''}`;
  }

  const setHtml = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

  // بتتنادى بعد أي تعديل في خانة — بتحدّث العدّادات والإجماليات وزرار الحفظ بس
  function refreshLive() {
    setHtml('purReviewBar', reviewBarHtml());
    setHtml('purSumsBar', sumsHtml());
    setHtml('purSaveBar', saveBarHtml());
  }

  // شيل علامة "محتاج مراجعة" من خانة واحدة من غير إعادة رسم
  function clearNeedH(f) {
    const inp = $('purH_' + f); if (inp) inp.classList.remove('pur-low');
    setHtml('purHchip_' + f, '');
  }
  function clearNeedI(id, f) {
    const inp = $('purI_' + id + '_' + f); if (inp) inp.classList.remove('pur-low');
    setHtml('purIchip_' + id + '_' + f, '');
  }

  function viewVerify() {
    const preview = /pdf/.test(S.mime)
      ? `<iframe class="pur-pdf" src="${S.url}"></iframe>
         <div class="pur-note">${esc(T('pur.pdfNoPreview'))}
           <a href="${S.url}" target="_blank" rel="noopener">${esc(T('pur.openFile'))}</a></div>`
      : `<img class="pur-img" src="${S.url}" alt="" onclick="PUR.zoom()" />`;

    const dup = S.dup && !S.dupOk ? `
      <div class="pur-dup">
        <p>${esc(T('pur.dupWarn', { d: S.dup.invoice_date }))}</p>
        <div style="font-size:12.5px;color:var(--warn-strong,#854D0E);margin-bottom:10px;">
          ${esc(S.dup.supplier_name)} — ${money(S.dup.grand_total)} ج.م
          ${S.dup.created_by_name ? ' — ' + esc(T('pur.by')) + ' ' + esc(S.dup.created_by_name) : ''}
        </div>
        <div class="pur-dup-btns">
          <button class="pur-mini" style="color:var(--warn-strong,#854D0E);" onclick="PUR.dupContinue()">${esc(T('pur.dupContinue'))}</button>
          <button class="pur-mini" style="color:var(--danger,#DC2626);" onclick="PUR.reset()">${esc(T('pur.dupCancel'))}</button>
        </div>
      </div>` : '';

    const warn = S.warnings.length
      ? `<div class="pur-alert" style="background:var(--warn-tint,#FFFBEB);border-color:var(--warn-border,#FDE047);color:var(--warn-strong,#854D0E);">
           ${S.warnings.map(w => '• ' + esc(w)).join('<br>')}</div>` : '';

    return `
      ${dup}
      <div class="pur-split">
        <div class="pur-pane pur-pane-img">
          <h3 class="pur-pane-title">${esc(T('pur.preview'))}</h3>
          ${preview}
          <button class="pur-mini" style="margin-top:10px;color:var(--muted,#64748B);" onclick="PUR.reset()">↺ ${esc(T('pur.retake'))}</button>
        </div>

        <div class="pur-pane">
          <h3 class="pur-pane-title">${esc(T('pur.verifyTitle'))}</h3>

          <div id="purReviewBar">${reviewBarHtml()}</div>
          ${warn}

          ${fieldHtml('supplier_name', T('pur.supplier'), 'text')}
          <div class="pur-row2">
            ${fieldHtml('invoice_date', T('pur.date'), 'date')}
            ${fieldHtml('invoice_number', T('pur.number'), 'text')}
          </div>
          ${fieldHtml('grand_total', T('pur.grandTotal'), 'number')}

          <h3 class="pur-pane-title" style="margin-top:18px;">${esc(T('pur.items'))} (${S.items.length})</h3>
          <div class="pur-bulk">
            <span>${esc(T('pur.targetAll'))}:</span>
            <select onchange="PUR.bulkTarget(this.value); this.selectedIndex=0;">
              <option value="">—</option>
              ${TARGETS.map(tg => `<option value="${tg.key}">${esc(T(tg.k))}</option>`).join('')}
            </select>
          </div>

          ${S.items.map(itemHtml).join('')}
          <button class="pur-mini" style="color:var(--accent,#0891A8);" onclick="PUR.addI()">${esc(T('pur.addItem'))}</button>

          <div id="purSumsBar">${sumsHtml()}</div>
          <div id="purSaveBar">${saveBarHtml()}</div>
        </div>
      </div>`;
  }

  // الفواتير بعد تصفية البحث
  function listRows() {
    const q = S.q.trim().toLowerCase();
    return S.list.filter(r => !q ||
      String(r.supplier_name || '').toLowerCase().includes(q) ||
      String(r.invoice_number || '').toLowerCase().includes(q));
  }

  function listCardsHtml() {
    const rows = listRows();
    const tot = k => rows.reduce((t, r) => t + num(r[k]), 0);
    return `
      <div class="pur-tot-cards">
        <div class="pur-tot"><div class="pur-tot-n" style="color:var(--ink,#1A2332);">${money(tot('grand_total'))}</div>
          <div class="pur-tot-l">${esc(T('pur.periodTotals'))} (ج.م)</div></div>
        ${TARGETS.map(tg => {
          const key = tg.key === 'allocated' ? 'total_allocated'
            : tg.key === 'unallocated' ? 'total_unallocated' : 'total_supplies';
          return `<div class="pur-tot"><div class="pur-tot-n" style="color:${tg.color};">${money(tot(key))}</div>
            <div class="pur-tot-l">${esc(T(tg.k))}</div></div>`;
        }).join('')}
      </div>`;
  }

  function listBodyHtml() {
    const rows = listRows();
    return rows.length === 0
      ? `<div class="empty-col">${esc(T('pur.empty'))}</div>`
      : rows.map(r => {
        const open = S.listOpen === r.id;
        const items = Array.isArray(r.items) ? r.items : [];
        return `<div class="pur-card" onclick="PUR.toggle('${r.id}')">
          <div class="pur-card-top">
            <div>
              <div class="pur-card-name">${esc(r.supplier_name)}</div>
              <div class="pur-card-sub">
                <span>${esc(r.invoice_date)}</span>
                ${r.invoice_number ? `<span>#${esc(r.invoice_number)}</span>` : ''}
                <span>${items.length} ${esc(T('pur.itemsCount'))}</span>
                ${r.created_by_name ? `<span>${esc(T('pur.by'))} ${esc(r.created_by_name)}</span>` : ''}
              </div>
            </div>
            <div class="pur-card-total">${money(r.grand_total)} ج.م</div>
          </div>
          ${open ? `<div class="pur-detail">
            <table>
              <tr><th>${esc(T('pur.itemName'))}</th><th>${esc(T('pur.qty'))}</th>
                  <th>${esc(T('pur.unit'))}</th><th>${esc(T('pur.lineTotal'))}</th><th>${esc(T('pur.target'))}</th></tr>
              ${items.map(it => `<tr>
                <td>${esc(it.item_name)}</td><td>${money(it.quantity)}</td>
                <td>${money(it.unit_cost_price)}</td><td>${money(it.total_price)}</td>
                <td><span class="pur-tag" style="background:${(TARGETS.find(x => x.key === it.target) || TARGETS[0]).color}1A;
                  color:${(TARGETS.find(x => x.key === it.target) || TARGETS[0]).color};">${esc(targetLabel(it.target))}</span></td>
              </tr>`).join('')}
            </table>
          </div>` : ''}
        </div>`;
      }).join('');
  }

  // خانة البحث بتفضل برّه الحاويتين اللي بيتحدّثوا مع كل حرف —
  // لو اتعادت هي كمان، المتصفح بيفقد التركيز والكيبورد بتقفل
  function listHtml() {
    return `
      <h3 class="inv-section-title">${esc(T('pur.recent'))}</h3>
      <div id="purListTop">${listCardsHtml()}</div>
      <div class="modal-search" style="position:static;padding:0 0 10px;">
        <input value="${esc(S.q)}" oninput="PUR.search(this.value)" placeholder="${esc(T('pur.searchPh'))}" />
      </div>
      <div id="purListBody">${listBodyHtml()}</div>`;
  }

  // ============================================================
  // الواجهة العامة
  // ============================================================
  const PUR = window.PUR = {
    open() {
      const dd = $('menuDropdown'); if (dd) dd.classList.add('hidden');
      injectDom();
      $('purOverlay').classList.remove('hidden');
      resetEntry();
      render();
      PUR.loadList();
    },
    close() { $('purOverlay').classList.add('hidden'); },
    reset() { resetEntry(); render(); },

    pick() {
      const row = $('purPickRow');
      if (row) row.style.display = row.style.display === 'none' ? 'grid' : 'none';
    },
    choose(id) { const el = $(id); if (el) el.click(); },

    async onFile(file) {
      // 🔒 حارس التكرار: على بعض الأجهزة (خصوصاً أندرويد) حدث اختيار
      //    الملف بيتطلق مرتين، فكانت الفاتورة الواحدة بتبعت طلبين لـ
      //    Gemini في نفس الثانية وتحرق الحصة. القفل ده بيمنع أي قراءة
      //    تانية طول ما فيه واحدة شغّالة.
      if (S.busyParse) { console.warn('parse-invoice: طلب مكرر — اتجاهل'); return; }
      if (!online()) { toast(T('pur.errNet'), false); return; }
      const ok = /^image\//.test(file.type) || file.type === 'application/pdf';
      if (!ok) { toast(T('pur.errMime'), false); return; }
      if (file.size > 20 * 1024 * 1024) { toast(T('pur.errBig'), false); return; }

      S.busyParse = true;
      S.aborted = false;
      S.view = 'busy'; render();

      try {
        const { blob, mime } = await shrink(file);
        if (S.aborted) return;
        const b64 = await toBase64(blob);
        if (b64.length > 8 * 1024 * 1024) { S.view = 'home'; render(); toast(T('pur.errBig'), false); return; }

        S.file = blob; S.mime = mime; S.b64 = b64;
        if (S.url) { try { URL.revokeObjectURL(S.url); } catch (e) {} }
        S.url = URL.createObjectURL(blob);

        const res = await parseInvoice(mime, b64);
        if (S.aborted) return;

        const d = (res && res.data) || {};
        S.model = (res && res.model) || '';
        S.raw = (res && res.raw) || null;
        S.warnings = d.warnings || [];
        S.header = {
          supplier_name: d.supplier_name || '',
          invoice_date: d.invoice_date || '',
          invoice_number: d.invoice_number || '',
          grand_total: d.grand_total || 0,
          currency: d.currency || 'EGP'
        };
        S.conf = d.confidence || {};
        S.seen = {};
        S.items = (d.items || []).map(it => ({
          id: uid(),
          item_name: it.item_name || '',
          quantity: num(it.quantity) || 1,
          unit_cost_price: num(it.unit_cost_price),
          total_price: num(it.total_price),
          confidence: num(it.confidence),
          target: 'unallocated',
          device_id: '', device_label: '', devQuery: '',
          seen: {}
        }));

        if (!S.items.length) toast(T('pur.errNoItems'), false);

        // حارس التكرار قبل ما المحاسب يبدأ يعدّل
        S.dup = await findDuplicate(S.header.supplier_name, S.header.invoice_date, S.header.grand_total);
        S.dupOk = false;
        if (S.dup) toast(T('pur.dupWarn', { d: S.dup.invoice_date }), false);

        S.view = 'verify'; render();
      } catch (e) {
        if (S.aborted) return;
        S.view = 'home'; render();
        const m = (e && (e.message || e.error_description)) || 'خطأ غير معروف';
        toast(T('pur.errRead', { m: m }), false);
      } finally {
        S.busyParse = false;   // يتفتح دايماً — حتى لو حصل خطأ
      }
    },

    abort() { S.aborted = true; resetEntry(); render(); },
    zoom() {
      const z = document.createElement('div');
      z.className = 'pur-zoom';
      z.innerHTML = `<img src="${S.url}" alt="">`;
      z.onclick = () => z.remove();
      document.body.appendChild(z);
    },

    // ⚠️ الكتابة مش بتعيد رسم الشاشة أبداً — بنحدّث الحالة والأجزاء الحيّة بس.
    // إعادة الرسم أثناء الكتابة بتشيل الخانة من الصفحة وتعملها من جديد،
    // فالمتصفح بيفقد التركيز والكيبورد بتقفل بعد كل حرف.
    setH(f, v) {
      S.header[f] = v;
      S.seen[f] = true;
      clearNeedH(f);
      refreshLive();
    },
    ack(f) { S.seen[f] = true; clearNeedH(f); refreshLive(); },
    ackAll() {
      ['supplier_name', 'invoice_date', 'invoice_number', 'grand_total']
        .forEach(f => { S.seen[f] = true; clearNeedH(f); });
      S.items.forEach(it => ['item_name', 'quantity', 'unit_cost_price', 'total_price']
        .forEach(f => { it.seen[f] = true; clearNeedI(it.id, f); }));
      refreshLive();
    },
    ackI(id, f) {
      const it = S.items.find(x => x.id === id); if (!it) return;
      it.seen[f] = true; clearNeedI(id, f); refreshLive();
    },

    setI(id, f, v) {
      const it = S.items.find(x => x.id === id); if (!it) return;
      if (f === 'target') {
        // تغيير الوجهة بيغيّر شكل البند نفسه — إعادة الرسم هنا مقبولة
        // لأنها جاية من قايمة منسدلة مش من كتابة
        it.target = v;
        if (v !== 'allocated') { it.device_id = ''; it.device_label = ''; it.devQuery = ''; }
        render(); return;
      }
      it[f] = (f === 'item_name') ? v : num(v);
      it.seen[f] = true;
      clearNeedI(id, f);
      // الوحدة والكمية بيحسبوا الإجمالي — إلا لو المحاسب كتب الإجمالي بإيده
      if ((f === 'quantity' || f === 'unit_cost_price') && !it.seen.total_price) {
        it.total_price = +(num(it.quantity) * num(it.unit_cost_price)).toFixed(2);
        const tot = $('purI_' + id + '_total_price');
        // ما نلمسش الخانة لو المحاسب واقف فيها بيكتب
        if (tot && document.activeElement !== tot) tot.value = it.total_price;
      }
      refreshLive();
    },
    addI() {
      S.items.push({
        id: uid(), item_name: '', quantity: 1, unit_cost_price: 0, total_price: 0,
        confidence: 1, target: 'unallocated', device_id: '', device_label: '', devQuery: '',
        seen: { item_name: true, quantity: true, unit_cost_price: true, total_price: true }
      });
      render();
    },
    delI(id) { S.items = S.items.filter(x => x.id !== id); render(); },
    bulkTarget(v) {
      if (!v) return;
      S.items.forEach(it => {
        it.target = v;
        if (v !== 'allocated') { it.device_id = ''; it.device_label = ''; it.devQuery = ''; }
      });
      render();
    },
    // بحث الجهاز جوه بند "موجهة"
    itemDevQuery(id, v) {
      const it = S.items.find(x => x.id === id); if (!it) return;
      it.devQuery = v;
      // نحدّث نتايج البحث بس — خانة الكتابة ما بتتلمسش
      setHtml('pdev_' + id + '_drop', deviceDropHtml(v, `PUR.setItemDev('${id}', `));
    },
    setItemDev(id, devId) {
      const it = S.items.find(x => x.id === id); if (!it) return;
      const d = deviceById(devId);
      it.device_id = devId || '';
      it.device_label = d ? deviceLabelOf(d) : '';
      it.devQuery = ''; render();
    },
    clearItemDev(id) {
      const it = S.items.find(x => x.id === id); if (!it) return;
      it.device_id = ''; it.device_label = ''; it.devQuery = ''; render();
    },
    dupContinue() { S.dupOk = true; render(); },

    async save() {
      if (S.saving) return;
      const h = S.header;
      if (!String(h.supplier_name || '').trim()) { toast(T('pur.needSupplier'), false); return; }
      if (!h.invoice_date) { toast(T('pur.needDate'), false); return; }
      if (!S.items.length) { toast(T('pur.needItems'), false); return; }
      if (reviewCount()) { toast(T('pur.needReview'), false); return; }
      if (!online()) { toast(T('pur.errNet'), false); return; }

      // فحص تكرار تاني: المحاسب ممكن يكون عدّل المورد أو الإجمالي بعد القراءة
      if (!S.dupOk) {
        const d = await findDuplicate(h.supplier_name, h.invoice_date, h.grand_total);
        if (d) { S.dup = d; render(); toast(T('pur.dupWarn', { d: d.invoice_date }), false); return; }
      }

      S.saving = true; render();
      try {
        const { data: { user } } = await sb.auth.getUser();
        const items = S.items.map(it => {
          const alloc = it.target === 'allocated' && it.device_id;
          return {
            item_name: String(it.item_name).trim(),
            quantity: num(it.quantity),
            unit_cost_price: num(it.unit_cost_price),
            total_price: num(it.total_price),
            target: it.target || 'unallocated',
            device_id: alloc ? it.device_id : null,
            device_label: alloc ? (it.device_label || '') : null
          };
        });
        const per = k => items.filter(i => i.target === k).reduce((t, i) => t + i.total_price, 0);

        // رفع الصورة الأصلية — لو فشل بنكمّل حفظ، الفاتورة أهم من صورتها
        let path = null;
        if (CFG.keepOriginal && S.file) {
          try {
            const ext = /pdf/.test(S.mime) ? 'pdf' : 'jpg';
            path = `${h.invoice_date}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
            const up = await sb.storage.from(CFG.bucket).upload(path, S.file, { contentType: S.mime, upsert: false });
            if (up.error) path = null;
          } catch (e) { path = null; }
        }

        const edited = Object.keys(S.seen).filter(k => S.seen[k]);
        const { data: inserted, error } = await sb.from(CFG.table).insert({
          supplier_name: String(h.supplier_name).trim(),
          invoice_date: h.invoice_date,
          invoice_number: String(h.invoice_number || '').trim() || null,
          grand_total: num(h.grand_total),
          currency: h.currency || 'EGP',
          items: items,
          total_allocated: per('allocated'),
          total_unallocated: per('unallocated'),
          total_supplies: per('supplies'),
          image_path: path,
          ai_raw: S.raw,
          ai_model: S.model,
          edited_fields: edited,
          created_by: user ? user.id : null,
          created_by_name: meName()
        }).select('id').single();
        if (error) throw error;
        const invId = inserted && inserted.id ? inserted.id : null;

        // قطع الغيار (Part 6): كل بند مشترى بيتحوّل لصف قطعة في المخزن.
        // الحالة من الوجهة: لوازم → لوازم | موجهة(+جهاز) → مربوطة بجهاز | غير كده → مخزن عام.
        // ⚠️ البند اللي **من غير سعر** بيتساب كمان (بسعر صفر) — كتير من
        //    فواتير المحل بتكتب الأصناف والأسعار بتتحط بعدين. قبل كده كان
        //    بيتشال خالص فمكانش ينفع يتربط بجهاز أصلاً. السعر بيتعدّل
        //    لاحقاً من مخزن قطع الغيار.
        const partsRows = items
          .filter(it => it.item_name)
          .map(it => {
            const alloc = it.target === 'allocated' && it.device_id;
            const qty = num(it.quantity) || 1;
            const unit = num(it.unit_cost_price) || (qty ? +(num(it.total_price) / qty).toFixed(2) : 0);
            const total = num(it.total_price) || +(qty * unit).toFixed(2);
            return {
              name: it.item_name,
              quantity: qty,
              unit_cost: unit,
              total_cost: total,
              category: it.target === 'supplies' ? 'supplies' : (alloc ? 'allocated' : 'unallocated'),
              device_id: alloc ? it.device_id : null,
              device_label: alloc ? (it.device_label || null) : null,
              source_invoice_id: invId,
              created_by: user ? user.id : null,
              created_by_name: meName()
            };
          });
        if (partsRows.length) {
          const pr = await sb.from(CFG.partsTable).insert(partsRows);
          // لو ده فشل، الفاتورة اتسجلت بالفعل — منرميش الحفظ، بس ننبّه إن المخزن ما اتحدّثش.
          if (pr.error) toast(T('inv.errGeneric', { m: pr.error.message || '' }), false);
        }

        toast(T('pur.saved'), true);
        resetEntry();
        render();
        PUR.loadList();
      } catch (e) {
        S.saving = false; render();
        toast(T('pur.errSave', { m: (e && (e.message || e.hint)) || '' }), false);
      }
    },

    async loadList() {
      try {
        const { data, error } = await sb.from(CFG.table)
          .select('*')
          .order('invoice_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        S.list = data || [];
      } catch (e) { S.list = []; }
      if (S.view === 'home') render();
    },
    toggle(id) { S.listOpen = S.listOpen === id ? null : id; render(); },
    search(v) {
      S.q = v;
      if (S.view !== 'home') return;
      // الإجماليات والنتايج بس — خانة البحث نفسها ما بتتلمسش
      setHtml('purListTop', listCardsHtml());
      setHtml('purListBody', listBodyHtml());
    },
    syncMenu: syncMenu
  };

  // ============================================================
  // ============================================================
  //  مخزن قطع الغيار (Part 6)
  // ============================================================
  // ============================================================

  const TABS = [
    { key: 'unallocated', k: 'inv.tab.unallocated', color: 'var(--info,#2563EB)' },
    { key: 'allocated', k: 'inv.tab.allocated', color: 'var(--success,#15803D)' },
    { key: 'supplies', k: 'inv.tab.supplies', color: 'var(--warn,#B45309)' }
  ];

  // حالة شاشة المخزن
  const IS = {
    tab: 'unallocated',
    list: [], loaded: false, q: '',
    adding: false, form: { name: '', quantity: 1, unit_cost: 0 },
    allocId: null, allocQuery: ''
  };

  // حالة قطع الغيار المعروضة جوه شاشة الجهاز (كاش لكل جهاز)
  // openId = الجهاز المفتوح حالياً (بنمسكه بنفسنا لأن selectedId في dashboard
  // متغير lexical مش خاصية على window، فمش هنقدر نقراه من هنا مباشرة).
  const DP = { openId: null, deviceId: null, rows: [], loading: false };
  // قطع الاختيار لجهاز + البحث فيها
  const DPICK = { rows: [] };
  function dpPickListHtml(rows) {
    return (rows && rows.length)
      ? rows.map(p => `<button type="button" class="dp-pick-opt" onclick="INV.linkToDevice('${esc(p.id)}')">
          <span>${esc(p.name)}</span><span class="dp-pick-cost">${Number(p.total_cost) ? money(p.total_cost) + ' ج.م' : 'من غير سعر'}</span></button>`).join('')
      : `<div class="dp-empty">${esc(T('inv.noStock'))}</div>`;
  }

  // ---------- الستايل ----------
  function injectInvCss() {
    if ($('invStyles')) return;
    const s = document.createElement('style');
    s.id = 'invStyles';
    s.textContent = `
  #invOverlay{z-index:45;}
  #dpPickOverlay{z-index:80;}

  /* بحث الأجهزة السريع */
  .dsrch{position:relative; margin-top:6px;}
  .dsrch-inp{width:100%; border:1px solid var(--border,#E2E8F0); border-radius:8px; padding:9px 11px; font-size:13.5px;
    font-family:inherit; background:var(--surface,#fff);}
  .dsrch-inp:focus{outline:2px solid rgba(8,145,168,.3); border-color:var(--accent,#0891A8);}
  .dsrch-drop{border:1px solid var(--border,#E2E8F0); border-top:none; border-radius:0 0 8px 8px; background:var(--surface,#fff);
    max-height:230px; overflow-y:auto; box-shadow:0 8px 18px rgba(16,16,20,.08);}
  .dsrch-opt{display:block; width:100%; text-align:start; border:none; background:var(--surface,#fff); cursor:pointer;
    padding:10px 12px; font-family:inherit; font-size:13px; color:var(--ink,#1A2332); border-top:1px solid var(--surface-3,#F1F5F9);}
  .dsrch-opt:hover{background:var(--surface-3,#F0F9FB);}
  /* سطر العطل تحت اسم الجهاز في نتايج البحث */
  .dsrch-t{display:block;}
  .dsrch-i{display:block; font-size:11.5px; color:var(--muted,#64748B); margin-top:3px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .dsrch-empty{padding:10px 12px; font-size:12.5px; color:var(--muted-2,#94A3B8);}
  .dsrch-chosen{display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:6px;}
  .dsrch-picked{background:var(--success-bg,#ECFDF5); border:1px solid var(--success-border,#A7F3D0); color:var(--success,#065F46); border-radius:8px;
    padding:7px 11px; font-size:13px; font-weight:700;}
  .dsrch-change{background:none; border:none; color:var(--accent,#0891A8); font-weight:800; cursor:pointer;
    font-family:inherit; font-size:12.5px;}

  /* بند فاتورة موجه لجهاز */
  .pur-devwrap{margin-top:8px; background:var(--success-bg,#F0FDF4); border:1px solid var(--success-border,#BBF7D0); border-radius:8px; padding:8px 10px;}
  .pur-devlbl{font-size:11.5px; color:var(--success,#15803D); font-weight:800; display:block; margin-bottom:2px;}
  .pur-devhint{font-size:11.5px; color:var(--muted,#64748B); margin-top:6px;}

  /* تبويبات المخزن */
  .inv-tabs{display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px;}
  @media (max-width:560px){ .inv-tabs{grid-template-columns:1fr;} }
  .inv-tab{background:var(--surface,#fff); border:1.5px solid var(--border,#E2E8F0); border-radius:10px; padding:11px 8px;
    font-family:'Cairo',sans-serif; font-size:13.5px; font-weight:800; color:var(--muted,#64748B); cursor:pointer;
    display:flex; align-items:center; justify-content:center; gap:7px;}
  .inv-tab.active{border-color:var(--tabc,#0891A8); color:var(--tabc,#0891A8); background:var(--surface,#fff);
    box-shadow:0 2px 8px rgba(16,16,20,.06);}
  .inv-tab-n{background:var(--surface-3,#F1F5F9); color:var(--ink-2,#475569); border-radius:999px; font-size:11.5px; padding:1px 8px; font-weight:800;}
  .inv-tab.active .inv-tab-n{background:var(--tabc,#0891A8); color:var(--on-accent,#fff);}

  .inv-tot{background:var(--surface,#fff); border:1px solid var(--border,#EEF0F3); border-radius:12px; padding:14px; text-align:center; margin-bottom:12px;}
  .inv-tot-n{font-family:'Cairo',sans-serif; font-size:22px; font-weight:900; color:var(--ink,#1A2332);}
  .inv-tot-l{font-size:12.5px; color:var(--ink-2,#475569); margin-top:4px; font-weight:600;}

  .inv-add-btn{width:100%; background:var(--surface-2,#F8FAFC); border:1.5px dashed var(--border-strong,#CBD5E1); border-radius:10px; padding:12px;
    font-family:inherit; font-size:13.5px; font-weight:700; color:var(--accent,#0891A8); cursor:pointer; margin-bottom:12px;}
  .inv-add-btn:hover{background:var(--surface,#fff); border-color:var(--accent,#0891A8);}
  .inv-add{background:var(--surface,#fff); border:1px solid var(--border,#E2E8F0); border-radius:12px; padding:14px; margin-bottom:12px;}
  .inv-add-foot{display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-top:6px; font-size:13px;}
  .inv-add-foot b{font-family:'Cairo',sans-serif; font-size:15px;}

  .inv-card{background:var(--surface,#fff); border:1px solid var(--border,#EEF0F3); border-radius:12px; padding:13px 15px; margin-bottom:8px;
    box-shadow:0 2px 8px rgba(16,16,20,.04);}
  .inv-card-top{display:flex; justify-content:space-between; align-items:center; gap:10px;}
  .inv-card-name{font-family:'Cairo',sans-serif; font-weight:800; font-size:14.5px;}
  .inv-card-cost{font-family:'Cairo',sans-serif; font-weight:900; font-size:15px; color:var(--ink,#1A2332); white-space:nowrap;}
  .inv-card-meta{font-size:12.5px; color:var(--muted,#64748B); margin-top:5px; line-height:1.7;}
  .inv-actions{display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;}
  .inv-btn{background:var(--surface-2,#F8FAFC); border:1px solid var(--border,#E2E8F0); border-radius:8px; padding:8px 12px;
    font-family:inherit; font-size:12.5px; font-weight:700; color:var(--ink-3,#334155); cursor:pointer;}
  .inv-btn:hover{background:var(--surface,#fff); border-color:var(--border-strong,#CBD5E1);}
  .inv-btn.primary{background:var(--accent,#0891A8); border-color:var(--accent,#0891A8); color:var(--on-accent,#fff);}
  .inv-btn.primary:hover{background:var(--accent-dark,#077A8F);}
  .inv-btn.del{color:var(--danger,#DC2626); border-color:var(--danger-border,#FECACA);}
  .inv-btn.del:hover{background:var(--danger-bg,#FEF2F2);}
  .inv-btn.cancel{color:var(--muted,#64748B);}
  .inv-alloc{width:100%;}

  /* قطع الغيار جوه شاشة الجهاز */
  .dp-section{margin-top:16px; border-top:2px solid var(--border,#EEF0F3); padding-top:14px;}
  .dp-head{font-family:'Cairo',sans-serif; font-weight:800; font-size:15px; margin-bottom:10px;}
  .dp-item{display:flex; align-items:center; gap:10px; background:var(--surface-2,#F8FAFC); border:1px solid var(--border,#EEF0F3);
    border-radius:10px; padding:10px 12px; margin-bottom:8px;}
  .dp-item-main{flex:1; display:flex; justify-content:space-between; align-items:center; gap:10px; min-width:0;}
  .dp-item-name{font-weight:700; font-size:13.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
  .dp-item-cost{font-family:'Cairo',sans-serif; font-weight:800; font-size:13.5px; color:var(--warn,#B45309); white-space:nowrap;}
  .dp-unlink{background:var(--surface,#fff); border:1px solid var(--danger-border,#FECACA); color:var(--danger,#DC2626); border-radius:8px; padding:6px 10px;
    font-family:inherit; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;}
  .dp-unlink:hover{background:var(--danger-bg,#FEF2F2);}
  .dp-add{width:100%; background:var(--surface-3,#F0F9FB); border:1.5px dashed var(--accent,#0891A8); color:var(--accent,#0891A8);
    border-radius:10px; padding:11px; font-family:inherit; font-size:13.5px; font-weight:800; cursor:pointer; margin:4px 0 12px;}
  .dp-add:hover{background:var(--surface-alt,#E6F6F9);}
  .dp-empty{font-size:13px; color:var(--muted-2,#94A3B8); text-align:center; padding:12px 0;}
  .dp-fin{background:#0F172A08; border-radius:10px; padding:12px 14px;}
  .dp-fin-row{display:flex; justify-content:space-between; align-items:center; font-size:13.5px; padding:4px 0; color:var(--ink-2,#475569);}
  .dp-fin-row b{font-family:'Cairo',sans-serif;}
  .dp-net{border-top:1px dashed var(--border-strong,#CBD5E1); margin-top:4px; padding-top:8px; font-weight:800; color:var(--ink,#1A2332);}
  .dp-net b{font-size:17px;}
  .dp-note{font-size:11.5px; color:var(--muted-2,#94A3B8); margin-top:8px; text-align:center;}
  .dp-pick-list{max-height:60vh; overflow-y:auto;}
  .dp-pick-opt{display:flex; justify-content:space-between; align-items:center; gap:10px; width:100%;
    text-align:start; background:var(--surface,#fff); border:1px solid var(--border,#EEF0F3); border-radius:10px; padding:12px 14px;
    margin-bottom:8px; font-family:inherit; font-size:13.5px; color:var(--ink,#1A2332); cursor:pointer; font-weight:700;}
  .dp-pick-opt:hover{background:var(--surface-3,#F0F9FB); border-color:var(--accent,#0891A8);}
  .dp-pick-cost{font-family:'Cairo',sans-serif; font-weight:800; color:var(--warn,#B45309); white-space:nowrap;}
  `;
    document.head.appendChild(s);
  }

  // ---------- الشاشة (DOM) ----------
  function injectInvDom() {
    if ($('invOverlay')) return;
    const o = document.createElement('div');
    o.id = 'invOverlay';
    o.className = 'overlay hidden';
    o.style.cssText = 'align-items:stretch; justify-content:stretch; padding:0; overflow-y:auto;';
    o.innerHTML = `
      <div class="summaries-page">
        <div class="modal-head" style="padding:16px 20px;">
          <h2 data-i18n="inv.title">${esc(T('inv.title'))}</h2>
          <button class="close-btn" onclick="INV.close()">×</button>
        </div>
        <div id="invBody" style="padding:12px 20px 48px;"></div>
      </div>`;
    document.body.appendChild(o);
  }

  const isInvOpen = () => { const o = $('invOverlay'); return o && !o.classList.contains('hidden'); };

  // ---------- الرسم ----------
  function invFiltered() {
    const q = IS.q.trim().toLowerCase();
    return IS.list.filter(p => {
      if (p.category !== IS.tab) return false;
      if (!q) return true;
      return String(p.name || '').toLowerCase().indexOf(q) !== -1 ||
             String(p.device_label || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function invAddHtml() {
    if (!IS.adding) return `<button class="inv-add-btn" onclick="INV.toggleAdd()">${esc(T('inv.addManual'))}</button>`;
    const f = IS.form;
    return `<div class="inv-add">
      <label class="pur-f"><span>${esc(T('inv.name'))}</span>
        <input value="${esc(f.name)}" oninput="INV.setForm('name', this.value)" /></label>
      <div class="pur-row2">
        <label class="pur-f" style="margin:0;"><span>${esc(T('inv.qty'))}</span>
          <input type="number" step="1" inputmode="decimal" value="${esc(f.quantity)}" oninput="INV.setForm('quantity', this.value)" /></label>
        <label class="pur-f" style="margin:0;"><span>${esc(T('inv.unit'))}</span>
          <input type="number" step="0.01" inputmode="decimal" value="${esc(f.unit_cost)}" oninput="INV.setForm('unit_cost', this.value)" /></label>
      </div>
      <div class="inv-add-foot">
        <span>${esc(T('inv.cost'))}: <b id="invFormCost">${money((num(f.quantity) * num(f.unit_cost)) || 0)} ج.م</b></span>
        <div>
          <button class="inv-btn cancel" onclick="INV.toggleAdd()">${esc(T('inv.cancel'))}</button>
          <button class="inv-btn primary" onclick="INV.saveManual()">${esc(T('inv.save'))}</button>
        </div>
      </div>
    </div>`;
  }

  function invItemHtml(p) {
    const meta = [`${money(p.quantity)} × ${money(p.unit_cost)} ج.م`];
    if (p.category === 'allocated' && p.device_label) meta.push(esc(T('inv.forDevice')) + ': ' + esc(p.device_label));
    if (p.created_by_name) meta.push(esc(T('inv.by')) + ' ' + esc(p.created_by_name));

    let actions;
    if (IS.allocId === p.id) {
      actions = `<div class="inv-alloc">
        ${deviceSearchHtml('ialloc_' + p.id, { device_id: '', device_label: '', devQuery: IS.allocQuery },
          `INV.allocQueryFn(this.value)`, `INV.pickAllocDev(`, `INV.cancelAlloc()`)}
        <div class="inv-actions"><button class="inv-btn cancel" onclick="INV.cancelAlloc()">${esc(T('inv.cancel'))}</button></div>
      </div>`;
    } else if (p.category === 'unallocated') {
      actions = `
        <button class="inv-btn primary" onclick="INV.beginAlloc('${esc(p.id)}')">${esc(T('inv.allocate'))}</button>
        <button class="inv-btn" onclick="INV.toSupplies('${esc(p.id)}')">${esc(T('inv.toSupplies'))}</button>
        <button class="inv-btn del" onclick="INV.del('${esc(p.id)}')">${esc(T('inv.delete'))}</button>`;
    } else if (p.category === 'allocated') {
      actions = `
        <button class="inv-btn" onclick="INV.unlink('${esc(p.id)}')">${esc(T('inv.unlink'))}</button>
        <button class="inv-btn del" onclick="INV.del('${esc(p.id)}')">${esc(T('inv.delete'))}</button>`;
    } else {
      actions = `
        <button class="inv-btn" onclick="INV.toStock('${esc(p.id)}')">${esc(T('inv.toStock'))}</button>
        <button class="inv-btn del" onclick="INV.del('${esc(p.id)}')">${esc(T('inv.delete'))}</button>`;
    }

    const noPrice = !num(p.total_cost);
    return `<div class="inv-card"${noPrice ? ' style="border-color:#B45309;"' : ''}>
      <div class="inv-card-top">
        <div class="inv-card-name">${esc(p.name)}</div>
        <div class="inv-card-cost"${noPrice ? ' style="color:#B45309;"' : ''}>${noPrice ? 'من غير سعر' : money(p.total_cost) + ' ج.م'}</div>
      </div>
      <div class="inv-card-meta">${meta.join(' — ')}</div>
      <div class="inv-actions">
        <button class="inv-btn" onclick="INV.editCost('${esc(p.id)}')">${noPrice ? '💰 اكتب السعر' : '✏️ عدّل السعر'}</button>
        ${actions}</div>
    </div>`;
  }

  function invHomeHtml() {
    const counts = k => IS.list.filter(p => p.category === k).length;
    const tabBar = `<div class="inv-tabs">${TABS.map(tg => `
      <button class="inv-tab ${IS.tab === tg.key ? 'active' : ''}" style="--tabc:${tg.color};"
        onclick="INV.setTab('${tg.key}')">${esc(T(tg.k))} <span class="inv-tab-n">${counts(tg.key)}</span></button>`).join('')}</div>`;

    const rows = invFiltered();
    const totalCost = rows.reduce((t, p) => t + num(p.total_cost), 0);
    const totCard = `<div class="inv-tot"><div class="inv-tot-n">${money(totalCost)}</div>
      <div class="inv-tot-l">${esc(T('inv.totalCost'))}</div></div>`;

    const emptyKey = IS.tab === 'allocated' ? 'inv.emptyAllocated'
      : IS.tab === 'supplies' ? 'inv.emptySupplies' : 'inv.emptyUnallocated';
    const list = rows.length ? rows.map(invItemHtml).join('') : `<div class="empty-col">${esc(T(emptyKey))}</div>`;

    // الإضافة اليدوية متاحة في المخزن العام واللوازم بس (الموجه بيتربط من الجهاز)
    const add = IS.tab === 'allocated' ? '' : invAddHtml();

    return `
      ${tabBar}
      <div id="invTotBar">${totCard}</div>
      <div class="modal-search" style="position:static;padding:0 0 10px;">
        <input value="${esc(IS.q)}" oninput="INV.search(this.value)" placeholder="${esc(T('inv.searchPh'))}" />
      </div>
      ${add}
      <div id="invListBody">${list}</div>`;
  }

  // الجزئين اللي بيتغيّروا مع البحث — من غير ما نلمس خانة البحث نفسها
  function invTotHtml() {
    const totalCost = invFiltered().reduce((t, p) => t + num(p.total_cost), 0);
    return `<div class="inv-tot"><div class="inv-tot-n">${money(totalCost)}</div>
      <div class="inv-tot-l">${esc(T('inv.totalCost'))}</div></div>`;
  }

  function invListBodyHtml() {
    const rows = invFiltered();
    const emptyKey = IS.tab === 'allocated' ? 'inv.emptyAllocated'
      : IS.tab === 'supplies' ? 'inv.emptySupplies' : 'inv.emptyUnallocated';
    return rows.length ? rows.map(invItemHtml).join('') : `<div class="empty-col">${esc(T(emptyKey))}</div>`;
  }

  function invRender() {
    const b = $('invBody');
    if (!b) return;
    b.innerHTML = invHomeHtml();
    if (window.I18N) { try { I18N.applyTranslations(b); } catch (e) {} }
  }

  // ---------- تحديث قطعة (ربط/إلغاء/إعادة تصنيف) ----------
  async function updatePart(id, patch, okKey) {
    if (!online()) { toast(T('inv.errNet'), false); return; }
    try {
      const { error } = await sb.from(CFG.partsTable).update(patch).eq('id', id);
      if (error) throw error;
      toast(T(okKey), true);
      await INV.loadParts();
      if (DP.openId) { DP.deviceId = null; injectDeviceParts(); }   // لو شاشة جهاز مفتوحة، تتحدّث
    } catch (e) { toast(T('inv.errGeneric', { m: (e && e.message) || '' }), false); }
  }

  // ============================================================
  // قطع الغيار جوه شاشة تفاصيل الجهاز + صافي الربح
  // ============================================================
  function devicePartsSectionHtml(d) {
    const rows = DP.rows;
    const partsCost = rows.reduce((t, p) => t + num(p.total_cost), 0);
    const repair = parseInt(d.agreedPrice) || 0;
    const net = repair - partsCost;

    const list = DP.loading
      ? `<div class="dp-empty">…</div>`
      : (rows.length
          ? rows.map(p => `<div class="dp-item">
              <div class="dp-item-main">
                <span class="dp-item-name">${esc(p.name)}</span>
                <span class="dp-item-cost">${money(p.total_cost)} ج.م</span>
              </div>
              <button type="button" class="dp-unlink" onclick="INV.unlinkFromDevice('${esc(p.id)}')">${esc(T('dpart.unlink'))}</button>
            </div>`).join('')
          : `<div class="dp-empty">${esc(T('dpart.empty'))}</div>`);

    return `
      <div class="dp-head">${esc(T('dpart.title'))}</div>
      ${list}
      <button type="button" class="dp-add" onclick="INV.openPickForDevice()">${esc(T('dpart.add'))}</button>
      <div class="dp-fin">
        <div class="dp-fin-row"><span>${esc(T('dpart.repair'))}</span><b>${money(repair)} ج.م</b></div>
        <div class="dp-fin-row"><span>${esc(T('dpart.partsCost'))}</span><b style="color:var(--warn,#B45309);">− ${money(partsCost)} ج.م</b></div>
        <div class="dp-fin-row dp-net"><span>${esc(T('dpart.net'))}</span><b style="color:${net >= 0 ? 'var(--success,#15803D)' : 'var(--danger,#DC2626)'};">${money(net)} ج.م</b></div>
      </div>
      <div class="dp-note">${esc(T('dpart.suppliesNote'))}</div>`;
  }

  function paintDeviceSection(id) {
    if (DP.openId !== id) return;
    const host = $('dpSection');
    const d = allDevices().find(x => x.id === id);
    if (host && d) host.innerHTML = devicePartsSectionHtml(d);
  }

  async function loadDeviceParts(id) {
    DP.loading = true;
    try {
      const { data, error } = await sb.from(CFG.partsTable)
        .select('*').eq('device_id', id).eq('category', 'allocated')
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (DP.deviceId !== id) return;     // اتغير الجهاز أثناء التحميل
      DP.rows = data || [];
    } catch (e) { if (DP.deviceId === id) DP.rows = []; }
    DP.loading = false;
    paintDeviceSection(id);
    // إخطار الداشبورد يعيد حساب النقط (يغطّي فتح الجهاز + الربط/الفصل)
    try { if (typeof window.onDevicePartsChanged === 'function') window.onDevicePartsChanged(id); } catch (e) {}
  }

  // بتتنادى بعد ما renderDetail يرسم المودال (عن طريق التغليف في boot)
  function injectDeviceParts() {
    if (!flagOn()) return;
    const modal = $('detailModal');
    // احتياطي: لو تغليف openDetail ما اشتغلش لأي سبب، بنجيب الجهاز المفتوح
    // من الداشبورد مباشرة بدل ما القسم يختفي خالص
    const id = DP.openId || openDeviceId();
    if (!modal || !id) return;
    DP.openId = id;
    const d = allDevices().find(x => x.id === id);
    if (!d) return;

    let host = $('dpSection');
    if (!host) {
      host = document.createElement('div');
      host.id = 'dpSection';
      host.className = 'dp-section';
      modal.appendChild(host);
    }
    if (DP.deviceId !== id) {           // كاش لجهاز تاني → هات من السيرفر
      DP.deviceId = id; DP.rows = []; DP.loading = true;
      host.innerHTML = devicePartsSectionHtml(d);
      loadDeviceParts(id);
    } else {
      host.innerHTML = devicePartsSectionHtml(d);
    }
  }

  // ---------- الواجهة العامة للمخزن ----------
  const INV = window.INV = {
    open() {
      const dd = $('menuDropdown'); if (dd) dd.classList.add('hidden');
      injectInvCss(); injectInvDom();
      $('invOverlay').classList.remove('hidden');
      IS.adding = false; IS.allocId = null; IS.q = '';
      invRender();
      INV.loadParts();
    },
    close() { const o = $('invOverlay'); if (o) o.classList.add('hidden'); },

    // أسماء قطع الغيار المربوطة بجهاز (للحاسبة) — بترجّع null لو لسه ما اتحمّلتش
    getDevicePartNames(id) { return (DP.deviceId === id && !DP.loading) ? DP.rows.map(r => r.name).filter(Boolean) : null; },

    setTab(tk) { IS.tab = tk; IS.adding = false; IS.allocId = null; invRender(); },
    search(v) {
      IS.q = v;
      // الإجمالي والقايمة بس — خانة البحث ما بتتلمسش فالكيبورد بتفضل مفتوحة
      setHtml('invTotBar', invTotHtml());
      setHtml('invListBody', invListBodyHtml());
    },

    async loadParts() {
      try {
        const { data, error } = await sb.from(CFG.partsTable).select('*')
          .order('created_at', { ascending: false }).limit(3000);
        if (error) throw error;
        IS.list = data || []; IS.loaded = true;
      } catch (e) { IS.list = []; }
      if (isInvOpen()) invRender();
    },

    // الإضافة اليدوية
    toggleAdd() { IS.adding = !IS.adding; if (IS.adding) IS.form = { name: '', quantity: 1, unit_cost: 0 }; invRender(); },
    setForm(f, v) {
      IS.form[f] = (f === 'name') ? v : num(v);
      const c = $('invFormCost');
      if (c) c.textContent = money((num(IS.form.quantity) * num(IS.form.unit_cost)) || 0) + ' ج.م';
    },
    async saveManual() {
      const name = String(IS.form.name || '').trim();
      if (!name) { toast(T('inv.needName'), false); return; }
      if (!online()) { toast(T('inv.errNet'), false); return; }
      const qty = num(IS.form.quantity) || 1;
      const unit = num(IS.form.unit_cost);
      const cat = IS.tab === 'supplies' ? 'supplies' : 'unallocated';
      try {
        const { data: { user } } = await sb.auth.getUser();
        const { error } = await sb.from(CFG.partsTable).insert({
          name, quantity: qty, unit_cost: unit, total_cost: +(qty * unit).toFixed(2),
          category: cat, device_id: null, device_label: null,
          created_by: user ? user.id : null,
          created_by_name: meName()
        });
        if (error) throw error;
        toast(T('inv.added'), true);
        IS.adding = false;
        await INV.loadParts();
      } catch (e) { toast(T('inv.errGeneric', { m: (e && e.message) || '' }), false); }
    },

    // إعادة التصنيف وإلغاء الربط (من شاشة المخزن)
    unlink(id) { updatePart(id, { category: 'unallocated', device_id: null, device_label: null }, 'inv.unlinked'); },
    // تعديل سعر القطعة — مهم للقطع اللي دخلت من فاتورة من غير سعر
    editCost(id) {
      const p = IS.list.find(x => x.id === id);
      if (!p) return;
      const qty = num(p.quantity) || 1;
      const cur = num(p.unit_cost) || (qty ? +(num(p.total_cost) / qty).toFixed(2) : 0);
      const v = prompt(`سعر الوحدة لـ "${p.name}" (الكمية: ${money(qty)})`, cur || '');
      if (v === null) return;                    // اتلغى
      const unit = num(String(v).replace(/[^\d.\-]/g, ''));
      if (!(unit >= 0)) { toast('اكتب رقم صحيح', false); return; }
      updatePart(id, { unit_cost: unit, total_cost: +(qty * unit).toFixed(2) }, 'inv.saved');
    },
    toSupplies(id) { updatePart(id, { category: 'supplies', device_id: null, device_label: null }, 'inv.movedSupplies'); },
    toStock(id) { updatePart(id, { category: 'unallocated', device_id: null, device_label: null }, 'inv.movedStock'); },

    async del(id) {
      if (!confirm(T('inv.confirmDelete'))) return;
      if (!online()) { toast(T('inv.errNet'), false); return; }
      try {
        const { error } = await sb.from(CFG.partsTable).delete().eq('id', id);
        if (error) throw error;
        toast(T('inv.deleted'), true);
        IS.list = IS.list.filter(p => p.id !== id);
        invRender();
        if (DP.openId) { DP.deviceId = null; injectDeviceParts(); }
      } catch (e) { toast(T('inv.errGeneric', { m: (e && e.message) || '' }), false); }
    },

    // ربط قطعة من المخزن العام بجهاز (بحث جهاز جوه كارت القطعة)
    beginAlloc(id) { IS.allocId = id; IS.allocQuery = ''; invRender(); },
    cancelAlloc() { IS.allocId = null; IS.allocQuery = ''; invRender(); },
    allocQueryFn(v) {
      IS.allocQuery = v;
      // نتايج البحث بس — خانة الكتابة ما بتتلمسش
      if (IS.allocId) setHtml('ialloc_' + IS.allocId + '_drop', deviceDropHtml(v, 'INV.pickAllocDev('));
    },
    async pickAllocDev(devId) {
      const partId = IS.allocId;
      if (!partId) return;
      if (!online()) { toast(T('inv.errNet'), false); return; }
      const d = deviceById(devId);
      try {
        const { error } = await sb.from(CFG.partsTable).update({
          category: 'allocated', device_id: devId, device_label: d ? deviceLabelOf(d) : null
        }).eq('id', partId);
        if (error) throw error;
        toast(T('inv.linked'), true);
      } catch (e) { toast(T('inv.errGeneric', { m: (e && e.message) || '' }), false); return; }
      IS.allocId = null; IS.allocQuery = '';
      await INV.loadParts();
      if (DP.openId === devId) { DP.deviceId = null; injectDeviceParts(); }
    },

    // ---- من شاشة الجهاز ----
    unlinkFromDevice(partId) {
      if (!online()) { toast(T('inv.errNet'), false); return; }
      sb.from(CFG.partsTable).update({ category: 'unallocated', device_id: null, device_label: null }).eq('id', partId)
        .then(({ error }) => {
          if (error) { toast(T('inv.errGeneric', { m: error.message || '' }), false); return; }
          toast(T('inv.unlinked'), true);
          DP.deviceId = null; injectDeviceParts();
          if (isInvOpen()) INV.loadParts();
        });
    },
    async openPickForDevice() {
      // الصفحة المضيفة ممكن تحدد الجهاز صراحةً (زي صفحة مراجعة قطع
      // الغيار عند الديسباتشر) — وإلا بنجيبه من الجهاز المفتوح.
      const id = DP.openId || openDeviceId();
      if (!id) { toast(T('inv.errGeneric', { m: 'مفيش جهاز محدد' }), false); return; }
      DP.openId = id;
      if (!online()) { toast(T('inv.errNet'), false); return; }
      let rows = [];
      try {
        const { data } = await sb.from(CFG.partsTable).select('*')
          .eq('category', 'unallocated').order('created_at', { ascending: false }).limit(1000);
        rows = data || [];
      } catch (e) { rows = []; }

      let ov = $('dpPickOverlay');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'dpPickOverlay';
        ov.className = 'overlay hidden';
        document.body.appendChild(ov);
      }
      DPICK.rows = rows;                       // نحتفظ بيهم للبحث
      ov.innerHTML = `<div class="modal" style="max-width:460px;">
        <div class="modal-head"><h2>${esc(T('inv.pickPartTitle'))}</h2>
          <button class="close-btn" onclick="INV.closePick()">×</button></div>
        <div style="padding:10px 14px 0;">
          <input id="dpPickQ" placeholder="ابحث عن قطعة…" oninput="INV.pickSearch(this.value)"
            style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border,#334155);
                   background:var(--surface-2,#0f172a);color:var(--ink,#e2e8f0);font:inherit;font-size:13.5px;">
        </div>
        <div class="dp-pick-list" id="dpPickList">${dpPickListHtml(rows)}</div>
      </div>`;
      ov.classList.remove('hidden');
    },
    // بحث حي جوه القطع غير الموجهة — الخانة نفسها ما بتتلمسش عشان
    // الكيبورد ما تقفلش بعد كل حرف
    pickSearch(v) {
      const q = String(v || '').trim();
      const rows = !q ? DPICK.rows : DPICK.rows.filter(p => {
        const name = String(p.name || '');
        if (window.IFixSearch) return IFixSearch.match(q, [name]);
        return name.includes(q);
      });
      const host = $('dpPickList');
      if (host) host.innerHTML = dpPickListHtml(rows);
    },
    closePick() { const ov = $('dpPickOverlay'); if (ov) ov.classList.add('hidden'); },
    linkToDevice(partId) {
      const id = DP.openId;
      if (!id) return;
      const d = allDevices().find(x => x.id === id);
      sb.from(CFG.partsTable).update({
        category: 'allocated', device_id: id, device_label: d ? deviceLabelOf(d) : null
      }).eq('id', partId).then(({ error }) => {
        if (error) { toast(T('inv.errGeneric', { m: error.message || '' }), false); return; }
        toast(T('inv.linked'), true);
        INV.closePick();
        DP.deviceId = null; injectDeviceParts();
        if (isInvOpen()) INV.loadParts();
        // لو صفحة "مراجعة قطع الغيار" مفتوحة، تتحدّث على طول
        try { if (typeof window.prOnPartsChanged === 'function') window.prOnPartsChanged(); } catch (e) {}
      });
    },

    syncMenu: syncMenu
  };

  // ============================================================
  // التركيب
  // ============================================================
  function boot() {
    injectCss();
    injectInvCss();
    injectDom();
    injectInvDom();
    syncMenu();
    wrapDetailFns();

    // مفاتيح الميزات بتتحمّل بعد الصفحة — بنعيد الفحص شوية مرات
    let tries = 0;
    const iv = setInterval(() => { syncMenu(); wrapDetailFns(); if (++tries > 20) clearInterval(iv); }, 700);

    // أي فتح للقايمة بيعيد فحص الأزرار (لو الأدمن فتح المفتاح والصفحة مفتوحة)
    if (typeof window.toggleMenu === 'function' && !window.toggleMenu.__pur) {
      const orig = window.toggleMenu;
      const wrapped = function () { try { syncMenu(); } catch (e) {} return orig.apply(this, arguments); };
      wrapped.__pur = true;
      window.toggleMenu = wrapped;
    }
  }

  // بنغلّف دوال التفاصيل عشان (١) نحقن قطع الغيار وصافي الربح بعد الرسم،
  // و(٢) نمسك معرّف الجهاز المفتوح بنفسنا. بيشتغل حتى لو الدوال اتعرّفت بعد
  // تحميل السكربت (بنعيد المحاولة في الـ interval).
  function wrapDetailFns() {
    if (typeof window.renderDetail === 'function' && !window.renderDetail.__aiv) {
      const origR = window.renderDetail;
      const wrapR = function () {
        const r = origR.apply(this, arguments);
        try { injectDeviceParts(); } catch (e) {}
        return r;
      };
      wrapR.__aiv = true;
      window.renderDetail = wrapR;
    }
    if (typeof window.openDetail === 'function' && !window.openDetail.__aiv) {
      const origO = window.openDetail;
      const wrapO = function (id) { DP.openId = id; return origO.apply(this, arguments); };
      wrapO.__aiv = true;
      window.openDetail = wrapO;
    }
    if (typeof window.closeDetail === 'function' && !window.closeDetail.__aiv) {
      const origC = window.closeDetail;
      const wrapC = function () { DP.openId = null; return origC.apply(this, arguments); };
      wrapC.__aiv = true;
      window.closeDetail = wrapC;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
