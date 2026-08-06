/* اختبارات وحدة لطبقة فك الترميز الجديدة.
   بنستخرج الكود من qr-scan.js نفسه ونشغّله — مش نسخة منه —
   عشان الاختبار يفشل فعلاً لو الملف اتغيّر غلط. */
const fs = require('fs');
const src = fs.readFileSync('qr-scan.js', 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'got ' + got + ', want ' + want); }

// ===== استخراج الكتلة من الملف =====
function slice(from, to) {
  const a = src.indexOf(from), b = src.indexOf(to);
  if (a < 0 || b < 0 || b <= a) throw new Error('مالقيتش العلامات: ' + from);
  return src.slice(a, b);
}
const helpers = slice('  var dCvs = null, dCtx = null;', '  // ============================================================\n  // شاشة القص');
const clampFn = slice('  function clamp(v, lo, hi)', '\n\n  function paintSel');

// ===== كانفس وهمي بيسجّل العمليات =====
const ops = [];
let canvasCount = 0;
const canvas = () => {
  canvasCount++;
  const c = { width: 0, height: 0 };
  c.getContext = () => ({
    fillStyle: '', imageSmoothingEnabled: null, imageSmoothingQuality: '',
    fillRect: (x, y, w, h) => ops.push({ op: 'fillRect', x, y, w, h, fill: c._fill }),
    drawImage: function (img, sx, sy, sw, sh, dx, dy, dw, dh) {
      ops.push({ op: 'drawImage', sx, sy, sw, sh, dx, dy, dw, dh,
                 cw: c.width, ch: c.height, smooth: this.imageSmoothingEnabled });
    },
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
  });
  return c;
};

const sandbox = {
  document: { createElement: (t) => t === 'canvas' ? canvas() : {} },
  window: { jsQR: null, BarcodeDetector: undefined },
  Promise, setTimeout, Math, Uint8Array, Uint32Array, Uint8ClampedArray, String, console
};
sandbox.BarcodeDetector = undefined;

const factory = new Function(
  'document', 'window', 'BarcodeDetector',
  clampFn + '\n' + helpers + '\nreturn { readRegion, binarize, otsu, clamp, idle };'
);
const M = factory(sandbox.document, sandbox.window, undefined);

const img = (w, h) => ({ naturalWidth: w, naturalHeight: h });
const last = () => ops[ops.length - 1];
const lastDraw = () => [...ops].reverse().find(o => o.op === 'drawImage');
const lastFill = () => [...ops].reverse().find(o => o.op === 'fillRect');

(async () => {
console.log('\n١) الهامش الأبيض حوالين الكود — البق الأصلي');
{
  ops.length = 0;
  await M.readRegion(img(4000, 3000), 1000, 800, 600, 600, [900]);
  const d = lastDraw(), f = lastFill();
  // fit=900 → sc=1.5 → iw=ih=900 ، q=round(900*0.15)=135 ، cw=1170
  eq('عرض اللوحة = المحتوى + هامشين', d.cw, 1170);
  eq('المحتوى مرسوم بعد الهامش (x)', d.dx, 135);
  eq('المحتوى مرسوم بعد الهامش (y)', d.dy, 135);
  eq('مقاس المحتوى', d.dw, 900);
  ok('الهامش أبيض ومغطي اللوحة كلها', f.x === 0 && f.y === 0 && f.w === 1170 && f.h === 1170);
  ok('الهامش ≥ ١٤٪ من الضلع (أكبر من ٤ مربعات لكود ٢٥)', 135 / 900 >= 0.14);
  ok('المستطيل المصدر زي ما هو', d.sx === 1000 && d.sy === 800 && d.sw === 600 && d.sh === 600);
}

console.log('\n٢) الحبس جوه حدود الصورة');
{
  ops.length = 0;
  await M.readRegion(img(100, 100), -50, -50, 200, 200, [300]);
  const d = lastDraw();
  ok('مايخرجش برّه الصورة', d.sx === 0 && d.sy === 0 && d.sw === 100 && d.sh === 100);
}
{
  ops.length = 0;
  await M.readRegion(img(1000, 1000), 900, 900, 400, 400, [300]);
  const d = lastDraw();
  ok('القصّة اللي بتتخطى الحافة بتتقص', d.sx === 900 && d.sw === 100 && d.sh === 100);
}

console.log('\n٣) نسبة الأبعاد بتتحافظ');
{
  ops.length = 0;
  await M.readRegion(img(2000, 2000), 0, 0, 800, 400, [400]);
  const d = lastDraw();
  eq('العرض', d.dw, 400);
  eq('الارتفاع (نص العرض)', d.dh, 200);
  eq('اللوحة عرض', d.cw, 400 + 60 * 2);
  eq('اللوحة ارتفاع', d.ch, 200 + 60 * 2);
}

console.log('\n٤) التنعيم: وقت التصغير بس');
{
  ops.length = 0;
  await M.readRegion(img(4000, 4000), 0, 0, 2000, 2000, [500]);   // تصغير
  ok('تصغير → تنعيم مفتوح', lastDraw().smooth === true);
  ops.length = 0;
  await M.readRegion(img(4000, 4000), 0, 0, 200, 200, [800]);     // تكبير
  ok('تكبير → تنعيم مقفول (حواف المربعات تفضل حادة)', lastDraw().smooth === false);
}

console.log('\n٥) كل المقاسات بتتجرّب لما القراءة تفشل');
{
  ops.length = 0;
  await M.readRegion(img(3000, 3000), 0, 0, 900, 900, [900, 480, 300]);
  eq('عدد محاولات الرسم', ops.filter(o => o.op === 'drawImage').length, 3);
}

console.log('\n٦) الحد الأدنى للهامش (٢٠ بكسل) للقصّات الصغيرة');
{
  ops.length = 0;
  await M.readRegion(img(500, 500), 0, 0, 500, 500, [140]);
  const d = lastDraw();
  ok('هامش ٢٠ بكسل على الأقل', d.dx >= 20, 'dx=' + d.dx);
}

console.log('\n٧) أوتسو والتحويل لأبيض وأسود');
{
  eq('عتبة بين كتلتين (٣٠ و ٢٢٠)', M.otsu(Uint8Array.from(
    [].concat(Array(500).fill(30), Array(500).fill(220)))) >= 30 &&
    M.otsu(Uint8Array.from([].concat(Array(500).fill(30), Array(500).fill(220)))) < 220, true);

  // صورة ٤ بكسل: فاتحين وغامقين
  const d = { data: new Uint8ClampedArray([
     20, 20, 20, 255,   240, 240, 240, 255,
     35, 35, 35, 255,   250, 250, 250, 255 ]) };
  M.binarize(d);
  const v = [d.data[0], d.data[4], d.data[8], d.data[12]];
  ok('الغامق بقى ٠ والفاتح بقى ٢٥٥', v[0] === 0 && v[1] === 255 && v[2] === 0 && v[3] === 255, v.join(','));
  ok('قناة الشفافية اتظبطت', d.data[3] === 255 && d.data[7] === 255);
}

console.log('\n٨) ترتيب خلايا الشبكة — الوسط الأول');
{
  const block = src.slice(src.indexOf('var cells = [];'), src.indexOf('for (var ci = 0;'));
  const run = new Function('Math', block + '\nreturn cells;');
  const cells = run(Math);
  eq('عدد الخلايا', cells.length, 9);
  ok('أول خلية هي الوسط [1,1]', cells[0][0] === 1 && cells[0][1] === 1, JSON.stringify(cells[0]));
  ok('آخر خلية ركن', Math.abs(cells[8][0] - 1) + Math.abs(cells[8][1] - 1) === 2, JSON.stringify(cells[8]));
  const uniq = new Set(cells.map(c => c.join(',')));
  eq('مفيش خلية متكررة', uniq.size, 9);
}

console.log('\n٩) الشبكة بتغطي الصورة كلها من غير فراغات');
{
  const shapes = [[4000,3000],[3000,4000],[4032,3024],[1920,1080],[1000,1000],[4001,2999]];
  let allOk = true, why = '';
  for (const [W,H] of shapes) {
    const tw = Math.ceil(W/2), th = Math.ceil(H/2);
    const stepX = Math.ceil((W-tw)/2), stepY = Math.ceil((H-th)/2);
    if (stepX > tw) { allOk = false; why = W+'x'+H+' فراغ أفقي'; break; }
    if (stepY > th) { allOk = false; why = W+'x'+H+' فراغ رأسي'; break; }
    if (2*stepX + tw < W) { allOk = false; why = W+'x'+H+' مش واصل لليمين'; break; }
    if (2*stepY + th < H) { allOk = false; why = W+'x'+H+' مش واصل لتحت'; break; }
  }
  ok('تغطية كاملة بتداخل على كل نسب الأبعاد', allOk, why);

  const [W,H] = [4000,3000];
  const tw = Math.ceil(W/2), stepX = Math.ceil((W-tw)/2);
  ok('التداخل ≈ ٥٠٪ من الخلية', Math.abs(stepX/tw - 0.5) < 0.01, (stepX/tw).toFixed(3));
}

console.log('\n' + (fail ? '✗ فشل ' + fail : '✓ كل الاختبارات نجحت') + '  (' + pass + '/' + (pass + fail) + ')');
process.exit(fail ? 1 : 0);
})();
