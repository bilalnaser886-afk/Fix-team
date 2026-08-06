/* اختبارات مصافحة "تم" بين الوكيل والصفحة.
   الكود بيتقص من الملفين نفسهم — مش نسخة منه. */
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('  ✓ ' + n))
                            : (fail++, console.log('  ✗ ' + n + (e ? '  → ' + e : ''))); };

// ===== ١) حلقة انتظار الصفحة =====
const dash = fs.readFileSync('dashboard.html', 'utf8');
const a = dash.indexOf('  let result = false;\n  let seen = false;');
const b = dash.indexOf('  try{ await sb.from', a);
if (a < 0 || b < 0) { console.log('✗ مالقيتش حلقة الانتظار'); process.exit(1); }
const loopSrc = dash.slice(a, b);

// بنشغّل الحلقة على قاعدة بيانات وهمية
function runWait(rows, opts) {
  opts = opts || {};
  const key = 'print-job:test';
  let tick = 0;
  const sb = { from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => {
      const r = rows[Math.min(tick++, rows.length - 1)];
      return r === null ? { data: null } : { data: { value: JSON.stringify(r) } };
    } }) }) }) };
  const fn = new Function('sb', 'key', 'deadline', 'Date', 'Promise', 'setTimeout', 'JSON',
    '(async()=>{})();return (async function(){' + loopSrc + '\nreturn result;})();');
  return fn(sb, key, Date.now() + (opts.ms || 4000), Date, Promise,
            (f) => setTimeout(f, 1), JSON);
}

(async () => {
console.log('\n١) الصفحة بتفهم نتيجة الطباعة صح');
{
  ok('الوكيل علّم done → نجاح',
     await runWait([{ status: 'pending' }, { status: 'printing' }, { status: 'done' }]) === true);

  ok('الوكيل مسح الصف بعد ما شفناه → نجاح (البق الأصلي)',
     await runWait([{ status: 'pending' }, { status: 'printing' }, null]) === true);

  ok('مسحه من غير ما نشوف حالة وسيطة → نجاح',
     await runWait([{ status: 'pending' }, null]) === true);

  ok('علّم failed → فشل',
     await runWait([{ status: 'pending' }, { status: 'failed' }]) === false);

  ok('الكتابة ماوصلتش أصلاً (مفيش صف من أول لفة) → فشل',
     await runWait([null], { ms: 3000 }) === false);

  ok('فضل pending لحد ما الوقت خلص → فشل',
     await runWait([{ status: 'pending' }], { ms: 2500 }) === false);
}

// ===== ٢) الوكيل: يعلّم قبل ما يمسح =====
console.log('\n٢) الوكيل بيعلّم "تم" قبل الحذف');
{
  const agent = fs.readFileSync('print-agent.js', 'utf8');
  const s = agent.indexOf('const FINISH_DELETE_MS');   // الثابت فوق الدالة
  const e = agent.indexOf('\nasync function pollCloudJobsForEnv');
  const src = agent.slice(s, e);

  const calls = [];
  const sbFetch = async (env, url, o) => { calls.push((o && o.method) || 'GET'); return { ok: true, status: 204 }; };
  const timers = [];
  const fn = new Function('sbFetch', 'log', 'encodeURIComponent', 'JSON', 'Date', 'setTimeout',
    src + '\nreturn finishJob;');
  const finishJob = fn(sbFetch, () => {}, encodeURIComponent, JSON, Date,
    (f, ms) => { timers.push(ms); });

  await finishJob({ name: 'staging' }, 'print-job:x', { status: 'done', ref: '#1' });

  ok('أول نداء PATCH مش DELETE', calls[0] === 'PATCH', calls.join(','));
  ok('مفيش حذف فوري', !calls.includes('DELETE'), calls.join(','));
  ok('الحذف اتأجّل', timers.length === 1, JSON.stringify(timers));
  ok('التأجيل ٤٥ ثانية (أطول من مهلة الصفحة ٣٠)', timers[0] === 45000, timers[0]);
  ok('التأجيل أطول من مهلة الصفحة', timers[0] > 30000);
}

console.log('\n' + (fail ? '✗ فشل ' + fail : '✓ كل الاختبارات نجحت') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
})();
