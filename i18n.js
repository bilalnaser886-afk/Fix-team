/* ============================================================
   I Fix Team — طبقة تعدد اللغات (i18n)
   ملف واحد مشترك بين كل صفحات النظام.
   الاستخدام:
     t('btn.newDevice')                  → النص حسب اللغة الحالية
     t('msg.deviceCount', {n: 12})       → مع متغيّرات
     <span data-i18n="app.subtitle">     → نص ثابت في HTML
     <input data-i18n-ph="search.ph">    → placeholder
   ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'ifix_lang';
  const DEFAULT_LANG = 'ar';

  /* ---------- قاموس الترجمة ----------
     ملاحظة: النصوص العربية هنا مكتوبة بالفصحى المبسّطة (المعيار الجديد).
     أي نص جديد يتضاف هنا الأول، وبعدين يتنادى بـ t('key'). */
  const STRINGS = {
    ar: {
      /* الهوية والرأس */
      'app.name': 'I Fix Team',
      'app.subtitle': 'نظام إدارة الصيانة',
      'app.loading': 'جارٍ التحميل...',
      'app.langName': 'العربية',

      /* أزرار عامة */
      'btn.newDevice': '+ جهاز جديد',
      'btn.backup': 'نسخة احتياطية',
      'btn.close': 'إغلاق',
      'btn.save': 'حفظ',
      'btn.cancel': 'إلغاء',
      'btn.confirm': 'تأكيد',
      'btn.delete': 'حذف',
      'btn.edit': 'تعديل',
      'btn.export': 'تصدير',
      'btn.print': 'طباعة',
      'btn.understood': 'تم الاطلاع',

      /* القائمة الرئيسية */
      'menu.analytics': 'الملخص المالي',
      'menu.techEval': 'تقييم الفنيين',
      'menu.inventory': 'الجرد',
      'menu.accounts': 'الحسابات',
      'menu.admin': 'لوحة الإدارة',
      'menu.logout': 'تسجيل الخروج',

      /* حالات الأجهزة */
      'status.waiting': 'قيد الانتظار',
      'status.diagnosing': 'جاري الكشف',
      'status.repairing': 'جاري الصيانة',
      'status.done': 'تم الصيانة',
      'status.delivered': 'تم التسليم',
      'status.delivered_paid': 'تم التسليم والدفع',
      'status.delivered_unpaid': 'تم التسليم بانتظار الدفع',
      'status.rejected': 'تم الرفض',
      'status.returned': 'المرتجعات',

      /* اللوحة الرئيسية */
      'board.deviceCountHint': 'جهاز — اضغط للعرض',
      'board.empty': 'لا توجد أجهزة',

      /* البحث */
      'search.column.ph': 'ابحث بالاسم أو المحل أو الرقم التسلسلي...',
      'search.inventory.ph': 'ابحث باسم العميل أو المحل أو الفني أو الطراز أو رقم الهاتف',
      'search.accounts.ph': 'ابحث باسم المحل...',
      'search.noResults': 'لا توجد نتائج مطابقة',

      /* النسخ الاحتياطي */
      'backup.download': 'تنزيل نسخة احتياطية',
      'backup.import': 'استيراد نسخة محفوظة',
      'backup.wipe': 'حذف جميع البيانات',
      'backup.autoLabel': 'النسخ التلقائي الدوري',
      'backup.freq.off': 'متوقف',
      'backup.freq.daily': 'يومي',
      'backup.freq.weekly': 'أسبوعي',
      'backup.freq.monthly': 'شهري',

      /* الأدوار */
      'role.technician': 'الفني المختص',
      'role.dispatcher': 'مسؤول الاستلام والتسليم',
      'role.accountant': 'محاسب',
      'role.superAdmin': 'مدير النظام',

      /* حقول شائعة */
      'field.initialPrice': 'السعر المبدئي',
      'field.customerName': 'اسم العميل',
      'field.shopName': 'اسم المحل',
      'field.phone': 'رقم الهاتف',
      'field.deviceType': 'نوع الجهاز',
      'field.model': 'الطراز',
      'field.serial': 'الرقم التسلسلي',
      'field.issue': 'العطل المُبلَّغ عنه',
      'field.intakeNotes': 'سجل الملاحظات الأولية',

      /* الدفع */
      'pay.method': 'طريقة الدفع',
      'pay.immediate': 'دفع فوري',
      'pay.deferred': 'آجل — على حساب المحل',
      'pay.confirm': 'تأكيد الدفع',
      'pay.settled': 'تم الدفع',

      /* شاشة تسجيل جهاز جديد */
      'add.title': 'تسجيل جهاز جديد',
      'add.customerName': 'اسم العميل',
      'add.shopName': 'اسم المحل',
      'add.registeredBy': 'اسم المحاسب اللي بيسجل الجهاز',
      'add.phone': 'رقم التليفون',
      'add.deviceType': 'نوع الجهاز',
      'add.model': 'الموديل',
      'add.serial': 'الرقم التسلسلي (IMEI/SN)',
      'add.dealType': 'نوع التعامل',
      'add.retail': 'قطاعي',
      'add.wholesale': 'جملة (بدون نقاط للفني)',
      'add.issue': 'العطل حسب كلام العميل',
      'add.condition': 'حالة الجهاز الشكلية عند الاستلام',
      'add.condition.ph': 'خدوش، كسور، حالة الشاشة...',
      'add.price': 'السعر المبدئي (اختياري) — أرقام صحيحة بالجنيه',
      'add.payType': 'طريقة الدفع',
      'add.payCash': 'فوري',
      'add.payDeferred': 'آجل — على حساب المحل',
      'add.intakeDate': 'تاريخ الدخول',
      'add.intakeTime': 'وقت الدخول',
      'add.submit': 'تسجيل الجهاز — يدخل تلقائياً في "قيد الانتظار"',

      /* رمز قفل الجهاز */
      'lock.title': 'رمز قفل الجهاز (اختياري)',
      'lock.tabText': 'رقم/نص',
      'lock.tabPattern': 'نمط',
      'lock.tabImage': 'صورة',
      'lock.textPh': 'رمز الفتح (أرقام أو نص)',
      'lock.drawHint': 'ارسم النمط بإصبعك',
      'lock.redraw': 'إعادة الرسم',
      'lock.edit': 'تعديل رمز قفل الجهاز',
      'lock.save': 'حفظ رمز القفل',
      'lock.replay': 'تشغيل النمط خطوة بخطوة',
      'lock.none': 'مفيش رمز قفل متسجل',

      /* شاشة تفاصيل الجهاز */
      'det.customerName': 'اسم العميل',
      'det.shopName': 'اسم المحل',
      'det.price': 'السعر — أرقام صحيحة بالجنيه',
      'det.payMethod': 'طريقة الدفع',
      'det.payCash': 'دفع فوري',
      'det.payDeferred': 'آجل — على حساب المحل',
      'det.paidViaAccount': 'اتضاف على حساب المحل',
      'det.settled': 'محاسَب عليه',
      'det.deferredPending': 'آجل على حساب المحل',
      'det.deferredPendingHint': 'هيتضاف على الحساب أول ما الجهاز يتسلّم',
      'det.paidCash': 'تم الدفع (فوري)',
      'det.confirmPay': 'تأكيد الدفع',
      'det.billedTo': 'متحاسب على حساب محل',
      'det.issue': 'العطل / المشكلة',
      'det.intakeAt': 'تاريخ ووقت الدخول',
      'det.serial': 'الرقم التسلسلي',
      'det.condition': 'حالة الجهاز عند الاستلام',
      'det.lastEdit': 'آخر تعديل',
      'det.technician': 'الفني المسؤول عن الصيانة',
      'det.technicianPh': 'اسم الفني',
      'det.accountant': 'اسم المحاسب اللي سجله',
      'det.accountantPh': 'اسم المحاسب',
      'det.techWarn': 'لازم تحدد الفني المسؤول قبل ما الجهاز يخرج من "قيد الانتظار"',
      'det.pointsToggle': 'إدارة النقاط والفني المساعد',
      'det.dealType': 'نوع التعامل',
      'det.retail': 'قطاعي',
      'det.wholesale': 'جملة (بدون نقاط)',
      'det.points': 'نقاط الصيانة (لتقييم الفني في الملخص)',
      'det.assistTech': 'فني مساعد (اختياري)',
      'det.assistTechPh': 'اسم الفني المساعد',
      'det.assistPercent': 'نسبته من النقاط %',
      'det.assistNeedMain': 'حدد الفني الرئيسي الأول عشان تقدر تضيف مساعد',
      'det.wholesaleNote': 'الجهاز مسجل جملة — مش بيتحسب عليه نقاط لأي فني',
      'det.changeStatus': 'تغيير حالة الجهاز',
      'det.trackLink': 'لينك المتابعة',
      'det.waCustomer': 'واتساب العميل',
      'det.printLabel': 'طباعة ليبل',
      'det.statusLog': 'سجل الحالات',
      'det.notesTitle': 'ملاحظات إضافية (سجل بيتزاد وميتعدّلش)',
      'det.noNotes': 'مفيش ملاحظات إضافية لسه',
      'det.newNotePh': 'اكتب ملاحظة جديدة تتسجّل باسمك ووقتها...',
      'det.addNote': 'إضافة ملاحظة',
      'det.timeline': 'فروقات التوقيت بين الخانات',
      'det.delete': 'حذف الجهاز',
      'det.by': 'بواسطة',
      'det.deepReq': 'طلب موافقة العميل على فحص دقيق',
      'det.deepWaiting': 'في انتظار رد العميل على طلب الفحص الدقيق...',
      'det.deepCancel': 'إلغاء الطلب',
      'det.deepYes': 'العميل وافق على الفحص الدقيق',
      'det.deepNo': 'العميل رفض الفحص الدقيق',
      'det.deepRetry': 'إعادة الطلب',
      'det.priceWaiting': 'في انتظار رد العميل على السعر...',
      'det.priceYes': 'العميل وافق على السعر',
      'det.priceNo': 'العميل رفض السعر',

      /* شاشة الحسابات */
      'acc.title': 'الحسابات — آجل المحلات',
      'acc.recordPayment': 'تسجيل دفعة من محل',
      'acc.shopNamePh': 'اسم المحل',
      'acc.amountPh': 'المبلغ بالجنيه',
      'acc.notePh': 'ملاحظة (اختياري)',
      'acc.submitPayment': 'تسجيل الدفعة',
      'acc.openingBalance': 'حساب محل جديد برصيد افتتاحي سابق',
      'acc.noMatch': 'مفيش محل بالاسم ده',
      'acc.empty': 'لسه مفيش حسابات آجلة — أول جهاز آجل يتسلم هيظهر هنا',
      'acc.totalOpen': 'إجمالي الديون المفتوحة على المحلات',
      'acc.groupOpen': 'الحسابات المفتوحة',
      'acc.groupPaid': 'الحسابات المدفوعة',
      'acc.none': 'مفيش',
      'acc.owed': 'عليه',
      'acc.paidDisc': 'مدفوع/خصم',
      'acc.remaining': 'المتبقي',
      'acc.wa': 'واتساب',
      'acc.phone': 'رقم',
      'acc.discount': 'خصم',
      'acc.deleteAccount': 'حذف الحساب',
      'acc.newCycle': 'بداية دورة حسابية جديدة',
      'acc.egp': 'ج.م',

      /* شاشة الجرد */
      'inv.title': 'الجرد',
      'inv.today': 'النهارده',
      'inv.week': 'آخر ٧ أيام',
      'inv.month': 'آخر ٣٠ يوم',
      'inv.all': 'الكل',
      'inv.from': 'من',
      'inv.to': 'إلى',
      'inv.tapToView': 'اضغط لعرض الأجهزة',
      'inv.hide': 'إخفاء',
      'inv.showDevices': 'عرض الأجهزة',
      'inv.received': 'جهاز استُلم في الفترة',
      'inv.deliveredPaid': 'تم التسليم والدفع',
      'inv.deliveredUnpaid': 'تم التسليم بانتظار الدفع',
      'inv.inProgress': 'جهاز شغال عليه دلوقتي',
      'inv.stuckCard': 'جهاز تجاوز {d} أيام — محتاج متابعة',
      'inv.emptyCard': 'مفيش أجهزة في الخانة دي',
      'inv.noStuck': 'مفيش أجهزة واقفة — كله ماشي',
      'inv.stuckIn': 'واقف في',
      'inv.days': 'يوم',
      'inv.searchResults': 'نتائج البحث عن',
      'inv.noResults': 'مفيش نتائج',
      'inv.noTechDevices': 'مفيش أجهزة مع فنيين دلوقتي',
      'inv.techTapToView': 'اضغط لعرض أجهزته',
      'inv.lateCount': 'واقف بقاله كتير',
      'inv.techSection': 'الأجهزة مع الفنيين (لسه ما اتسلّمتش)',

      /* اللغة */
      'lang.switch': 'English',
      'lang.switchTitle': 'تغيير لغة النظام'
    },

    en: {
      'app.name': 'I Fix Team',
      'app.subtitle': 'Repair Management System',
      'app.loading': 'Loading...',
      'app.langName': 'English',

      'btn.newDevice': '+ New Device',
      'btn.backup': 'Backup',
      'btn.close': 'Close',
      'btn.save': 'Save',
      'btn.cancel': 'Cancel',
      'btn.confirm': 'Confirm',
      'btn.delete': 'Delete',
      'btn.edit': 'Edit',
      'btn.export': 'Export',
      'btn.print': 'Print',
      'btn.understood': 'Got it',

      'menu.analytics': 'Financial Summary',
      'menu.techEval': 'Technician Performance',
      'menu.inventory': 'Inventory',
      'menu.accounts': 'Accounts',
      'menu.admin': 'Admin Panel',
      'menu.logout': 'Sign Out',

      'status.waiting': 'Pending',
      'status.diagnosing': 'Under Diagnosis',
      'status.repairing': 'In Progress',
      'status.done': 'Repaired',
      'status.delivered': 'Delivered',
      'status.delivered_paid': 'Delivered & Paid',
      'status.delivered_unpaid': 'Delivered - Pending Payment',
      'status.rejected': 'Rejected',
      'status.returned': 'Returns',

      'board.deviceCountHint': 'devices — tap to view',
      'board.empty': 'No devices',

      'search.column.ph': 'Search by name, store, or serial number...',
      'search.inventory.ph': 'Search by customer, store, technician, model, or phone',
      'search.accounts.ph': 'Search by store name...',
      'search.noResults': 'No matching results',

      'backup.download': 'Download backup',
      'backup.import': 'Import saved backup',
      'backup.wipe': 'Delete all data',
      'backup.autoLabel': 'Scheduled automatic backup',
      'backup.freq.off': 'Off',
      'backup.freq.daily': 'Daily',
      'backup.freq.weekly': 'Weekly',
      'backup.freq.monthly': 'Monthly',

      'role.technician': 'Specialist Technician',
      'role.dispatcher': 'Dispatcher',
      'role.accountant': 'Accountant',
      'role.superAdmin': 'Super Admin',

      'field.initialPrice': 'Initial Price',
      'field.customerName': 'Customer Name',
      'field.shopName': 'Store Name',
      'field.phone': 'Phone Number',
      'field.deviceType': 'Device Type',
      'field.model': 'Model',
      'field.serial': 'Serial Number',
      'field.issue': 'Reported Issue',
      'field.intakeNotes': 'Initial Intake Notes',

      'pay.method': 'Payment Method',
      'pay.immediate': 'Immediate Payment',
      'pay.deferred': 'Deferred — Store Account',
      'pay.confirm': 'Confirm Payment',
      'pay.settled': 'Paid',

      /* New device form */
      'add.title': 'Register New Device',
      'add.customerName': 'Customer Name',
      'add.shopName': 'Store Name',
      'add.registeredBy': 'Registered By (Accountant)',
      'add.phone': 'Phone Number',
      'add.deviceType': 'Device Type',
      'add.model': 'Model',
      'add.serial': 'Serial Number (IMEI/SN)',
      'add.dealType': 'Deal Type',
      'add.retail': 'Retail',
      'add.wholesale': 'Wholesale (no technician points)',
      'add.issue': 'Reported Issue',
      'add.condition': 'Physical Condition on Intake',
      'add.condition.ph': 'Scratches, cracks, screen condition...',
      'add.price': 'Initial Price (optional) — whole numbers in EGP',
      'add.payType': 'Payment Method',
      'add.payCash': 'Immediate',
      'add.payDeferred': 'Deferred — Store Account',
      'add.intakeDate': 'Intake Date',
      'add.intakeTime': 'Intake Time',
      'add.submit': 'Register Device — goes to "Pending"',

      /* Device lock code */
      'lock.title': 'Device Lock Code (optional)',
      'lock.tabText': 'PIN/Text',
      'lock.tabPattern': 'Pattern',
      'lock.tabImage': 'Image',
      'lock.textPh': 'Unlock code (digits or text)',
      'lock.drawHint': 'Draw the pattern with your finger',
      'lock.redraw': 'Redraw',
      'lock.edit': 'Edit Device Lock Code',
      'lock.save': 'Save Lock Code',
      'lock.replay': 'Replay pattern step by step',
      'lock.none': 'No lock code saved',

      /* Device details screen */
      'det.customerName': 'Customer Name',
      'det.shopName': 'Store Name',
      'det.price': 'Price — whole numbers in EGP',
      'det.payMethod': 'Payment Method',
      'det.payCash': 'Immediate Payment',
      'det.payDeferred': 'Deferred — Store Account',
      'det.paidViaAccount': 'Posted to store account',
      'det.settled': 'Settled',
      'det.deferredPending': 'Deferred to store account',
      'det.deferredPendingHint': 'will be posted once the device is delivered',
      'det.paidCash': 'Paid (immediate)',
      'det.confirmPay': 'Confirm Payment',
      'det.billedTo': 'Billed to store account',
      'det.issue': 'Fault / Issue',
      'det.intakeAt': 'Intake Date & Time',
      'det.serial': 'Serial Number',
      'det.condition': 'Condition on Intake',
      'det.lastEdit': 'Last Modified',
      'det.technician': 'Assigned Technician',
      'det.technicianPh': 'Technician name',
      'det.accountant': 'Registered By',
      'det.accountantPh': 'Accountant name',
      'det.techWarn': 'Assign a technician before moving the device out of "Pending"',
      'det.pointsToggle': 'Points & Assistant Technician',
      'det.dealType': 'Deal Type',
      'det.retail': 'Retail',
      'det.wholesale': 'Wholesale (no points)',
      'det.points': 'Repair points (for technician evaluation)',
      'det.assistTech': 'Assistant technician (optional)',
      'det.assistTechPh': 'Assistant technician name',
      'det.assistPercent': 'Share of points %',
      'det.assistNeedMain': 'Assign the main technician first to add an assistant',
      'det.wholesaleNote': 'Registered as wholesale — no points awarded',
      'det.changeStatus': 'Change device status',
      'det.trackLink': 'Tracking link',
      'det.waCustomer': 'WhatsApp customer',
      'det.printLabel': 'Print label',
      'det.statusLog': 'Status history',
      'det.notesTitle': 'Additional notes (append-only log)',
      'det.noNotes': 'No additional notes yet',
      'det.newNotePh': 'Write a note — saved with your name and time...',
      'det.addNote': 'Add note',
      'det.timeline': 'Time between stages',
      'det.delete': 'Delete device',
      'det.by': 'by',
      'det.deepReq': 'Request customer approval for deep diagnosis',
      'det.deepWaiting': 'Waiting for customer response on deep diagnosis...',
      'det.deepCancel': 'Cancel request',
      'det.deepYes': 'Customer approved the deep diagnosis',
      'det.deepNo': 'Customer declined the deep diagnosis',
      'det.deepRetry': 'Request again',
      'det.priceWaiting': 'Waiting for customer response on price...',
      'det.priceYes': 'Customer approved the price',
      'det.priceNo': 'Customer declined the price',

      /* Accounts screen */
      'acc.title': 'Accounts — Store Credit',
      'acc.recordPayment': 'Record a store payment',
      'acc.shopNamePh': 'Store name',
      'acc.amountPh': 'Amount in EGP',
      'acc.notePh': 'Note (optional)',
      'acc.submitPayment': 'Record Payment',
      'acc.openingBalance': 'New store account with opening balance',
      'acc.noMatch': 'No store with that name',
      'acc.empty': 'No credit accounts yet — the first deferred delivery will appear here',
      'acc.totalOpen': 'Total outstanding store debt',
      'acc.groupOpen': 'Open Accounts',
      'acc.groupPaid': 'Settled Accounts',
      'acc.none': 'None',
      'acc.owed': 'Owed',
      'acc.paidDisc': 'Paid/Discount',
      'acc.remaining': 'Balance',
      'acc.wa': 'WhatsApp',
      'acc.phone': 'Phone',
      'acc.discount': 'Discount',
      'acc.deleteAccount': 'Delete account',
      'acc.newCycle': 'Start of a new billing cycle',
      'acc.egp': 'EGP',

      /* Inventory screen */
      'inv.title': 'Inventory',
      'inv.today': 'Today',
      'inv.week': 'Last 7 days',
      'inv.month': 'Last 30 days',
      'inv.all': 'All',
      'inv.from': 'From',
      'inv.to': 'To',
      'inv.tapToView': 'Tap to view devices',
      'inv.hide': 'Hide',
      'inv.showDevices': 'Show devices',
      'inv.received': 'devices received in period',
      'inv.deliveredPaid': 'Delivered & Paid',
      'inv.deliveredUnpaid': 'Delivered - Pending Payment',
      'inv.inProgress': 'devices currently in progress',
      'inv.stuckCard': 'devices over {d} days — need follow-up',
      'inv.emptyCard': 'No devices in this group',
      'inv.noStuck': 'No stalled devices — all on track',
      'inv.stuckIn': 'stalled in',
      'inv.days': 'days',
      'inv.searchResults': 'Search results for',
      'inv.noResults': 'No results',
      'inv.noTechDevices': 'No devices with technicians right now',
      'inv.techTapToView': 'Tap to view their devices',
      'inv.lateCount': 'stalled too long',
      'inv.techSection': 'Devices with technicians (not yet delivered)',

      'lang.switch': 'العربية',
      'lang.switchTitle': 'Change system language'
    }
  };

  /* ---------- الحالة ---------- */
  let currentLang = DEFAULT_LANG;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && STRINGS[saved]) currentLang = saved;
  } catch (e) { /* التخزين المحلي غير متاح — نكمل بالافتراضي */ }

  function getLang() { return currentLang; }

  /* الترجمة: اللغة الحالية ← العربية ← المفتاح نفسه */
  function t(key, vars) {
    let s = (STRINGS[currentLang] && STRINGS[currentLang][key]);
    if (s == null) s = (STRINGS[DEFAULT_LANG] && STRINGS[DEFAULT_LANG][key]);
    if (s == null) return key;
    if (vars) {
      Object.keys(vars).forEach(k => {
        s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
      });
    }
    return s;
  }

  /* هل المفتاح موجود فعلاً؟ (مفيد للنصوص اللي لسه ما اتترجمتش) */
  function has(key) {
    return !!(STRINGS[currentLang] && STRINGS[currentLang][key]) ||
           !!(STRINGS[DEFAULT_LANG] && STRINGS[DEFAULT_LANG][key]);
  }

  /* ضبط اتجاه الصفحة والخط */
  function applyDirection() {
    const rtl = currentLang === 'ar';
    const html = document.documentElement;
    html.setAttribute('lang', currentLang);
    html.setAttribute('dir', rtl ? 'rtl' : 'ltr');
    html.classList.toggle('lang-en', !rtl);
    html.classList.toggle('lang-ar', rtl);
  }

  /* ترجمة العناصر الثابتة في HTML */
  function applyTranslations(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (has(k)) el.textContent = t(k);
    });
    scope.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const k = el.getAttribute('data-i18n-ph');
      if (has(k)) el.setAttribute('placeholder', t(k));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(el => {
      const k = el.getAttribute('data-i18n-title');
      if (has(k)) el.setAttribute('title', t(k));
    });
  }

  function applyI18n(root) {
    applyDirection();
    applyTranslations(root);
  }

  /* تغيير اللغة: بنحفظ ونعيد التحميل عشان كل الشاشات تتبني باللغة الجديدة */
  function setLang(lang) {
    if (!STRINGS[lang] || lang === currentLang) return;
    currentLang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    location.reload();
  }

  function toggleLang() { setLang(currentLang === 'ar' ? 'en' : 'ar'); }

  /* زر تبديل اللغة — بيتحقن في أي حاوية */
  function mountLangToggle(container) {
    if (!container || document.getElementById('langToggleBtn')) return;
    const b = document.createElement('button');
    b.id = 'langToggleBtn';
    b.type = 'button';
    b.className = 'lang-toggle';
    b.textContent = '🌐 ' + t('lang.switch');
    b.title = t('lang.switchTitle');
    b.onclick = toggleLang;
    container.appendChild(b);
  }

  global.I18N = {
    t: t, has: has, getLang: getLang, setLang: setLang, toggleLang: toggleLang,
    applyI18n: applyI18n, applyTranslations: applyTranslations,
    mountLangToggle: mountLangToggle, STRINGS: STRINGS
  };
  global.t = t;   /* اختصار عام */

  /* نضبط الاتجاه فوراً قبل الرسم عشان الصفحة ما ترقصش */
  applyDirection();
  document.addEventListener('DOMContentLoaded', function () { applyTranslations(document); });

})(window);
