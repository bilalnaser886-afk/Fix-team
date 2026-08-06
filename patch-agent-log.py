#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
باتش print-agent.js — صفحة سجل مباشرة على http://localhost:9123/log

المشكلة:
  الوكيل بيقوم مخفي مع الويندوز (run-agent-hidden.vbs) — من غير نافذة.
  ولما تفتح start-print-agent.bat عشان تشوفه، النسخة الجديدة بتموت
  فوراً على "Port 9123 is already in use" لأن المخفية ماسكة المنفذ.
  فالنافذة اللي بتشوفها ميتة، والشغّالة مالهاش نافذة أصلاً.

الحل:
  الوكيل نفسه يعرض سجله على صفحة ويب. تفتح اللينك في كروم على
  كمبيوتر المحل وتشوف كل حاجة لحظة بلحظة — من غير ما تقفل ولا
  تشغّل أي حاجة.

كمان:
  • السجل بيتكتب في agent-log.txt من الوكيل نفسه (مش من الـ VBS)
    وبسقف حجم — الملف كان ٩٤ كيلو وبيكبر للأبد.
  • رسالة "المنفذ مشغول" بقت تقول لك تعمل إيه بدل ما تسيبك في النص.
"""
import sys, io

PATH = 'print-agent.js'
EDITS = []


def edit(name, old, new):
    EDITS.append((name, old, new))


# ============================================================
# ١) السجل: ذاكرة + ملف بسقف حجم
# ============================================================
edit(
    'log: ring buffer + capped file',
    """function log(...a) {
  const t = new Date().toLocaleTimeString('en-GB');
  console.log('[' + t + ']', ...a);
}""",
    """// آخر ٤٠٠ سطر في الذاكرة — دول اللي بتعرضهم صفحة /log.
// الوكيل بيشتغل مخفي من غير نافذة، فالسجل ده هو الطريقة الوحيدة
// لمعرفة إيه اللي بيحصل جواه.
const LOG_RING = [];
const LOG_MAX  = 400;
const LOG_FILE = path.join(__dirname, 'agent-log.txt');
const LOG_FILE_MAX = 512 * 1024;          // نص ميجا، وبعدين بنبدأ من أول وجديد

function logLine(line) {
  LOG_RING.push(line);
  if (LOG_RING.length > LOG_MAX) LOG_RING.shift();
  try {
    // الملف كان بيكبر للأبد. بنقصّه لما يعدّي الحد — بنسيب آخر
    // نص عشان ما نفقدش سياق المشكلة اللي لسه حاصلة.
    let st = null;
    try { st = fs.statSync(LOG_FILE); } catch (e) {}
    if (st && st.size > LOG_FILE_MAX) {
      const keep = fs.readFileSync(LOG_FILE, 'utf8').slice(-(LOG_FILE_MAX / 2));
      fs.writeFileSync(LOG_FILE, keep.slice(keep.indexOf('\\n') + 1));
    }
    fs.appendFileSync(LOG_FILE, line + '\\r\\n');
  } catch (e) { /* السجل مايوقفش الطباعة أبداً */ }
}

function log(...a) {
  const t = new Date().toLocaleTimeString('en-GB');
  const line = '[' + t + '] ' + a.map(v =>
    typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch (e) { return String(v); } })()
  ).join(' ');
  console.log(line);
  logLine(line);
}"""
)

# ============================================================
# ٢) صفحة السجل
# ============================================================
edit(
    'route: /log',
    """  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, agent: 'ifix-print-agent', version: 1, platform: process.platform }));
  }""",
    """  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, agent: 'ifix-print-agent', version: 1, platform: process.platform }));
  }

  // صفحة السجل المباشرة — افتحها في المتصفح على كمبيوتر المحل:
  //     http://localhost:9123/log
  // بتتحدّث كل ٣ ثواني لوحدها. دي بديل نافذة الكونسول اللي
  // مستحيل تشوفها والوكيل شغال مخفي.
  if (req.url === '/log' || req.url.startsWith('/log?')) {
    const body = LOG_RING.join('\\n') || '(لسه مفيش أي سطور)';
    const esc = String(body)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(
      '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>سجل وكيل الطباعة</title><meta http-equiv="refresh" content="3">' +
      '<style>body{margin:0;background:#0b1020;color:#d8e2f2;font:13px/1.6 Consolas,monospace}' +
      'header{position:sticky;top:0;background:#111a33;padding:10px 14px;font:700 14px/1.5 system-ui;' +
      'border-bottom:1px solid #24304f;direction:rtl}' +
      'b{color:#4ade80}pre{margin:0;padding:14px;white-space:pre-wrap;word-break:break-word;direction:ltr;text-align:left}' +
      '.hint{color:#8fa3c8;font-weight:400;font-size:12px}</style></head><body>' +
      '<header>وكيل الطباعة — <b>شغّال</b> · نسخة ' + AGENT_VERSION +
      ' · الطابعة: ' + (PRINTER_NAME || 'الافتراضية') +
      '<div class="hint">الصفحة بتتحدّث لوحدها كل ٣ ثواني · آخر ' + LOG_RING.length + ' سطر</div></header>' +
      '<pre>' + esc + '</pre>' +
      '<script>scrollTo(0,document.body.scrollHeight)<\\/script></body></html>'
    );
  }"""
)

# ============================================================
# ٣) رسالة المنفذ المشغول تقول لك تعمل إيه
# ============================================================
edit(
    'clearer EADDRINUSE message',
    """  if (e.code === 'EADDRINUSE') {
    console.error(`\\nERROR: Port ${PORT} is already in use - the agent is probably already running in another window.\\n`);
  } else {""",
    """  if (e.code === 'EADDRINUSE') {
    console.error(`\\nERROR: Port ${PORT} is already in use.`);
    console.error('The agent is ALREADY RUNNING - most likely hidden, started with Windows.');
    console.error('This window is not needed. To watch the running agent, open this in your browser:');
    console.error(`\\n    http://localhost:${PORT}/log\\n`);
    console.error('To stop the hidden one and run it here instead, first close it:');
    console.error('\\n    taskkill /F /IM node.exe\\n');
  } else {"""
)

# ============================================================
# ٣.٥) رقم النسخة — عشان تتأكد من صفحة /log إن الكود الجديد شغال
# ============================================================
edit(
    'bump AGENT_VERSION',
    """const AGENT_VERSION = '2026-08-04d \u00b7 size + crisp + low-egress';""",
    """const AGENT_VERSION = '2026-08-06a \u00b7 no-dialog + mm-size + live-log';"""
)

# ============================================================
# ٣.٧) سطر بداية في السجل
#      من غيره الملف ماينعملش غير مع أول طباعة، وصفحة /log
#      بتطلع فاضية وانت مش عارف هي شغالة ولا لأ.
# ============================================================
edit(
    'log the startup line',
    """  console.log('  Keep this window open while working. To stop: Ctrl + C');
  console.log('');""",
    """  console.log('  Keep this window open while working. To stop: Ctrl + C');
  console.log('');
  log('agent started - version ' + AGENT_VERSION +
      ' | printer: ' + (PRINTER_NAME || 'Windows default') +
      ' | cloud: ' + (acc ? acc.email : 'disabled'));"""
)

# ============================================================
# ٤) اللينك يبان في شاشة البداية كمان
# ============================================================
edit(
    'startup banner: log url',
    """  console.log('  Local address : http://localhost:' + PORT + '  (printing from this computer)');""",
    """  console.log('  Local address : http://localhost:' + PORT + '  (printing from this computer)');
  console.log('  Live log page : http://localhost:' + PORT + '/log');"""
)


def main():
    with io.open(PATH, encoding='utf-8') as f:
        src = f.read()
    original = src

    for name, old, new in EDITS:
        n = src.count(old)
        if n != 1:
            print('✗ [%s] لقيت %d نسخة — المفروض واحدة. وقفت من غير ما أكتب.' % (name, n))
            sys.exit(1)
        src = src.replace(old, new, 1)
        print('✓ %s' % name)

    if src == original:
        print('✗ مفيش أي تغيير حصل')
        sys.exit(1)

    with io.open(PATH, 'w', encoding='utf-8') as f:
        f.write(src)
    print('\nتم — %d تعديل على %s' % (len(EDITS), PATH))


if __name__ == '__main__':
    main()
