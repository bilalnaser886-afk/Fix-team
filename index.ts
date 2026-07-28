// ============================================================
// I Fix Team — Edge Function: parse-invoice
// بتاخد صورة/PDF فاتورة مشتريات وترجّع JSON منظّم من Gemini.
//
// ليه سيرفر وسيط أصلاً؟ مفتاح Gemini لازم يفضل هنا. أي مفتاح بيتحط في
// dashboard.html بيبقى مكشوف لأي حد بيفتح الصفحة ويقدر يستهلك رصيدك.
//
// النشر:
//   supabase secrets set GEMINI_API_KEY=xxxxx
//   supabase functions deploy parse-invoice
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

// موديل الاستخراج الأساسي. Flash-Lite هو المرشّح لشغل استخراج المستندات
// عالي الحجم (أرخص وأسرع)، و 3.6 Flash احتياطي للفواتير الوحشة (خط يد/صورة بايظة).
const MODEL       = Deno.env.get("GEMINI_MODEL")       ?? "gemini-3.5-flash-lite";
const MODEL_RETRY = Deno.env.get("GEMINI_MODEL_RETRY") ?? "gemini-3.6-flash";

const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf",
];

// حد الحجم: الـ base64 بيكبر الملف ~33%. 8MB base64 ≈ 6MB ملف أصلي.
const MAX_B64_BYTES = 8 * 1024 * 1024;

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// ============================================================
// تعليمات النظام — قلب دقة الاستخراج
// ============================================================
const SYSTEM_INSTRUCTION = `
You extract purchase-invoice data for a mobile-phone repair shop in Egypt.
Invoices are usually Arabic or mixed Arabic/English, often photographed by hand:
skewed, creased, low light, sometimes handwritten.

EXTRACT ONLY WHAT IS PRINTED OR WRITTEN ON THE DOCUMENT.

Line items:
- A line item is a purchased product with a quantity and a price.
- IGNORE every piece of text that is not a purchased item. Specifically ignore:
  store policies and return/warranty terms, disclaimers, legal footers, slogans and
  marketing text, addresses, phone/mobile/fax numbers, tax and commercial-register
  numbers, website and social handles, bank and payment details, delivery and driver
  notes, signature and stamp lines, table headers ("الصنف", "الكمية", "السعر", "الإجمالي",
  "Item", "Qty", "Price", "Total"), page numbers, and any "thank you" text.
- Subtotal, VAT/tax, discount, and grand-total rows are NOT line items. Never put them
  in the items array.
- Keep the item name exactly as written, including model numbers and codes
  (e.g. "شاشة A12 اورج", "بطارية iPhone 11", "تاتش J7 اسود").

Numbers:
- Convert Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩ / ۰۱۲۳۴۵۶۷۸۹) to Western digits.
- Numbers only, no currency symbols, no thousands separators. Use a dot for decimals.
- quantity defaults to 1 when the invoice shows a price but no quantity.
- If total_price is missing, compute quantity × unit_cost_price.
- If unit_cost_price is missing but total_price and quantity exist, compute total_price ÷ quantity.

Dates:
- Return invoice_date strictly as YYYY-MM-DD.
- Egyptian invoices are day-first: 03/05/2026 means 3 May 2026.
- Two-digit years belong to the 2000s.
- If no date is printed anywhere, return null. Do NOT use today's date.

Never invent a value. A missing field is null, never a guess and never a placeholder
like "غير معروف" or "N/A".

Confidence (0.0 to 1.0) must reflect how clearly you could READ the value on the image:
- 0.9+  : printed sharply, zero doubt
- 0.6-0.9: readable but blurry, handwritten, or partially cut off
- below 0.6: guessed from context, or the digits/letters are genuinely ambiguous
A field you could not find at all is null with confidence 0.
Do not inflate confidence. A wrong value with high confidence costs the shop money,
because the accountant will skim past it instead of reviewing it.
`.trim();

const SCHEMA = {
  type: "object",
  properties: {
    supplier_name: {
      type: ["string", "null"],
      description: "Supplier / store name as printed on the invoice header.",
    },
    invoice_date: {
      type: ["string", "null"],
      description: "Invoice date in YYYY-MM-DD format, or null if not printed.",
    },
    invoice_number: {
      type: ["string", "null"],
      description: "Invoice / receipt number as printed, digits and letters kept as-is.",
    },
    currency: {
      type: ["string", "null"],
      description: "ISO code if identifiable, e.g. EGP. Null if not stated.",
    },
    items: {
      type: "array",
      description: "Purchased line items only. Never totals, taxes, or discounts.",
      items: {
        type: "object",
        properties: {
          item_name:       { type: "string", description: "Item description exactly as written." },
          quantity:        { type: "number", description: "Units purchased." },
          unit_cost_price: { type: "number", description: "Cost of one unit." },
          total_price:     { type: "number", description: "Line total for this item." },
          confidence:      { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["item_name", "quantity", "unit_cost_price", "total_price", "confidence"],
      },
    },
    grand_total: {
      type: ["number", "null"],
      description: "Final payable amount printed on the invoice.",
    },
    confidence: {
      type: "object",
      properties: {
        supplier_name:  { type: "number", minimum: 0, maximum: 1 },
        invoice_date:   { type: "number", minimum: 0, maximum: 1 },
        invoice_number: { type: "number", minimum: 0, maximum: 1 },
        grand_total:    { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["supplier_name", "invoice_date", "invoice_number", "grand_total"],
    },
    warnings: {
      type: "array",
      description:
        "Short Arabic notes about anything unreadable, cut off, or internally inconsistent.",
      items: { type: "string" },
    },
  },
  required: ["supplier_name", "invoice_date", "invoice_number", "items", "grand_total", "confidence"],
};

const USER_PROMPT =
  "استخرج بيانات فاتورة المشتريات دي حسب المخطط المطلوب. " +
  "البنود المشتراة بس — تجاهل أي كلام مش صنف متباع.";

// ============================================================
// نداء Gemini
// ============================================================
async function callGemini(model: string, mimeType: string, dataB64: string) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{
      role: "user",
      parts: [
        { inline_data: { mime_type: mimeType, data: dataB64 } },
        { text: USER_PROMPT },
      ],
    }],
    generationConfig: {
      // ملحوظة: temperature / top_p / top_k اتشالوا من Gemini 3.x
      // (بيتجاهلهم دلوقتي وهيرجّع 400 في الأجيال الجاية).
      responseFormat: {
        text: { mimeType: "application/json", schema: SCHEMA },
      },
      maxOutputTokens: 8192,
    },
  };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body?.error?.message || `Gemini HTTP ${res.status}`;
      throw new Error(msg);
    }

    const cand = body?.candidates?.[0];
    const finish = cand?.finishReason;
    if (finish && finish !== "STOP") {
      throw new Error(`Gemini stopped early: ${finish}`);
    }

    const text = (cand?.content?.parts ?? [])
      .map((p: { text?: string }) => p?.text ?? "")
      .join("")
      .trim();

    if (!text) throw new Error("Gemini returned an empty response");

    // مع responseFormat المفروض ييجي JSON نضيف — بننضّف أي ```json احتياطي
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    return {
      parsed: JSON.parse(cleaned),
      usage: body?.usageMetadata ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

// شكل الناتج مضمون من المخطط، لكن المعنى لأ — بننضّف قبل ما نرجّعه للواجهة
function sanitize(parsed: Record<string, unknown>) {
  const num = (v: unknown) => {
    const n = typeof v === "string" ? parseFloat(v.replace(/[^\d.\-]/g, "")) : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const str = (v: unknown) => {
    const s = (v ?? "").toString().trim();
    return (!s || /^(n\/?a|غير معروف|غير محدد|unknown|null)$/i.test(s)) ? "" : s;
  };

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items = rawItems
    .map((it: Record<string, unknown>) => {
      const name = str(it?.item_name);
      let qty   = num(it?.quantity);
      let unit  = num(it?.unit_cost_price);
      let total = num(it?.total_price);

      if (qty <= 0) qty = 1;
      if (!total && unit) total = +(qty * unit).toFixed(2);
      if (!unit && total) unit = +(total / qty).toFixed(2);

      return {
        item_name: name,
        quantity: qty,
        unit_cost_price: unit,
        total_price: total,
        confidence: Math.min(1, Math.max(0, num(it?.confidence))),
      };
    })
    // صف من غير اسم أو من غير أي فلوس مش بند حقيقي
    .filter((it) => it.item_name && (it.total_price > 0 || it.unit_cost_price > 0));

  const c = (parsed.confidence ?? {}) as Record<string, unknown>;
  const date = str(parsed.invoice_date);

  return {
    supplier_name: str(parsed.supplier_name),
    invoice_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    invoice_number: str(parsed.invoice_number),
    currency: str(parsed.currency) || "EGP",
    items,
    grand_total: num(parsed.grand_total),
    confidence: {
      supplier_name:  Math.min(1, Math.max(0, num(c.supplier_name))),
      invoice_date:   Math.min(1, Math.max(0, num(c.invoice_date))),
      invoice_number: Math.min(1, Math.max(0, num(c.invoice_number))),
      grand_total:    Math.min(1, Math.max(0, num(c.grand_total))),
    },
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(str).filter(Boolean) : [],
  };
}

// ============================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  if (!GEMINI_KEY) {
    return json({ error: "config", message: "GEMINI_API_KEY مش متظبط على السيرفر" }, 500);
  }

  // ===== الموظف لازم يكون داخل بحسابه =====
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error } = await sb.auth.getUser();
    if (error || !user) return json({ error: "unauthorized" }, 401);
  } catch {
    return json({ error: "unauthorized" }, 401);
  }

  // ===== الملف =====
  let mimeType = "", dataB64 = "";
  try {
    const body = await req.json();
    mimeType = String(body?.mimeType ?? "");
    dataB64  = String(body?.dataBase64 ?? "");
  } catch {
    return json({ error: "bad_request", message: "الطلب مش JSON صحيح" }, 400);
  }

  if (!ALLOWED_MIME.includes(mimeType)) {
    return json({ error: "bad_mime", message: "النوع ده مش مدعوم — صورة أو PDF بس" }, 400);
  }
  if (!dataB64) {
    return json({ error: "bad_request", message: "مفيش ملف مرفوع" }, 400);
  }
  if (dataB64.length > MAX_B64_BYTES) {
    return json({ error: "too_large", message: "الملف كبير — صوّر الفاتورة تاني بجودة أقل" }, 413);
  }

  // ===== الاستخراج =====
  let used = MODEL, out, lastErr = "";
  try {
    out = await callGemini(MODEL, mimeType, dataB64);
  } catch (e) {
    lastErr = e instanceof Error ? e.message : String(e);
  }

  // مفيش بنود أو الموديل وقع؟ نعيد بالموديل الأقوى مرة واحدة بس
  const empty = !out || !Array.isArray(out.parsed?.items) || out.parsed.items.length === 0;
  if (empty && MODEL_RETRY && MODEL_RETRY !== MODEL) {
    try {
      out = await callGemini(MODEL_RETRY, mimeType, dataB64);
      used = MODEL_RETRY;
      lastErr = "";
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  if (!out) {
    console.error("parse-invoice failed:", lastErr);
    return json({ error: "ocr_failed", message: lastErr || "قراءة الفاتورة فشلت" }, 502);
  }

  const clean = sanitize(out.parsed);
  return json({
    ok: true,
    model: used,
    usage: out.usage,
    data: clean,
    raw: out.parsed,
  });
});
