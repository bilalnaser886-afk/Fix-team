/* ============================================================
   أدوات الرف — نسخة مؤقتة للتجربة
   ------------------------------------------------------------
   التلاتة دول مجرد أماكن محجوزة عشان تشوف الشكل والسلوك.
   لما نقرر إيه اللي هيفضل، الملف ده هو اللي يتعدّل — dock.js
   نفسه مش بيعرف أي أداة.
   ============================================================ */
(function () {
  'use strict';
  if (!window.IFixDock) return;

  var note = function (host, lines) {
    host.innerHTML =
      '<div style="font-size:12.5px;line-height:2;color:var(--muted);">' +
      lines.map(function (l) { return '<div>' + l + '</div>'; }).join('') +
      '</div>';
  };

  IFixDock.register({
    id: 'assist', icon: '💬', title: 'محادثات العملاء',
    render: function (h) {
      note(h, [
        'المكان ده هيتعرض فيه محادثات <b>assist</b>.',
        'اللي محتاج رد هيطلع فوق، والرقم الأحمر على الأيقونة',
        'هيقول كام محادثة مستنية.'
      ]);
    }
  });

  IFixDock.register({
    id: 'notes', icon: '📝', title: 'ملاحظات سريعة',
    render: function (h) {
      note(h, ['مساحة كتابة سريعة من غير ما تسيب الشاشة.', 'لسه محتاجة قرار: تتحفظ فين؟']);
    }
  });

  IFixDock.register({
    id: 'calc', icon: '🧮', title: 'حاسبة',
    render: function (h) {
      note(h, ['حاسبة صغيرة للحسابات السريعة أثناء الاستلام.']);
    }
  });
})();
