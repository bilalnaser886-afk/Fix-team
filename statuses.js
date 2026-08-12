// ============================================================
// I Fix Team — إعدادات الحالات (statuses.js)
// ------------------------------------------------------------
// تعريف حالات الأجهزة (قيد الانتظار / جاري الصيانة / تم التسليم ...)
// بيانات بحتة، اتفصلت من dashboard.html.
//
// ⚠️ يتحمّل قبل كود الداشبورد:
//   <script src="points.js"></script>
//   <script src="statuses.js"></script>   ← هنا
//   <script> ...كود الصفحة... </script>
//
// ⚠️ STATUSES و ACTION_STATUSES اتشالوا من dashboard.html — متعرّفهمش في مكانين.
// ============================================================

const STATUSES = [
  { key: "waiting", label: "قيد الانتظار", labelKey:"status.waiting", varname:"waiting" },
  { key: "diagnosing", label: "جاري الكشف", labelKey:"status.diagnosing", varname:"diagnosing" },
  { key: "repairing", label: "جاري الصيانة", labelKey:"status.repairing", varname:"repairing" },
  { key: "done", label: "تم الصيانة", labelKey:"status.done", varname:"done" },
  { key: "delivered_paid", label: "تم التسليم والدفع", labelKey:"status.delivered_paid", varname:"delivered_paid" },
  { key: "delivered_unpaid", label: "تم التسليم بانتظار الدفع", labelKey:"status.delivered_unpaid", varname:"delivered_unpaid" },
  { key: "rejected_shop", label: "درج الرفض", labelKey:"status.rejected_shop", varname:"rejected_shop" },
  { key: "rejected", label: "تم الرفض", labelKey:"status.rejected", varname:"rejected" },
  { key: "returned", label: "المرتجعات", labelKey:"status.returned", varname:"returned" },
];

// حالات الأزرار (الإجراءات)
const ACTION_STATUSES = [
  { key: "waiting", label: "قيد الانتظار", labelKey:"status.waiting", varname:"waiting" },
  { key: "diagnosing", label: "جاري الكشف", labelKey:"status.diagnosing", varname:"diagnosing" },
  { key: "repairing", label: "جاري الصيانة", labelKey:"status.repairing", varname:"repairing" },
  { key: "done", label: "تم الصيانة", labelKey:"status.done", varname:"done" },
  { key: "delivered", label: "تم التسليم", labelKey:"status.delivered", varname:"delivered" },
  { key: "rejected", label: "تم الرفض", labelKey:"status.rejected", varname:"rejected" },
  { key: "returned", label: "المرتجعات", labelKey:"status.returned", varname:"returned" },
];
