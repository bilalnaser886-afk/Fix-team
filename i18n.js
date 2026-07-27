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
      'status.diagnosing': 'قيد الفحص',
      'status.repairing': 'قيد الإصلاح',
      'status.done': 'تم الإصلاح بنجاح',
      'status.delivered': 'تم التسليم',
      'status.delivered_paid': 'تم التسليم والدفع',
      'status.delivered_unpaid': 'تم التسليم - بانتظار الدفع',
      'status.rejected': 'مرفوض',
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
      'status.done': 'Repaired Successfully',
      'status.delivered': 'Delivered',
      'status.delivered_paid': 'Delivered & Paid',
      'status.delivered_unpaid': 'Delivered - Pending Payment',
      'status.rejected': 'Rejected',
      'status.returned': 'In-Warranty Return',

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
