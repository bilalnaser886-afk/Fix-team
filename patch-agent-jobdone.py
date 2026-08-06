#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
باتش print-agent.js — الليبل بيتطبع والصفحة بتقول إنه فشل.

السبب:
  finishJob() بتمسح الصف من app_data بعد الطباعة على طول.
  والصفحة اللي طلبت الطباعة بتفضل تسأل على نفس الصف مستنية
  status = 'done'. لما تلاقيه اختفى بتعتبرها "لسه" وتفضل تلف
  لحد ما المهلة تخلص، وتقول "مقدرناش نوصل لطابعة المحل" —
  والليبل يكون خارج من الطابعة من زمان.

  الحذف ده كان مرفوض بـ RLS قبل 06-print-job-cleanup-policy.sql،
  فكان بينزل للخطة البديلة ويعلّم done — وده اللي كان بيخلي
  الدنيا شغالة بالصدفة. أول ما اتسمح بالحذف، الإشارة ضاعت.

الإصلاح:
  نعلّم "تم" الأول (صف مصغّر من غير الصورة ~١٢٠ بايت)، والحذف
  بعد ٤٥ ثانية. الصفحة بتشوف النتيجة، والصف مايتراكمش.
  والنقل مش هيتأثر: فلتر الوكيل على value=like.*pending* فالصف
  الخالص مابيتحمّلش تاني أصلاً.
"""
import sys, io

PATH = 'print-agent.js'
EDITS = []


def edit(name, old, new):
    EDITS.append((name, old, new))


edit(
    'finishJob: mark done, delete later',
    """async function finishJob(env, key, job) {
  const url = 'app_data?key=eq.' + encodeURIComponent(key);
  try {
    const res = await sbFetch(env, url, { method: 'DELETE' });
    if (res && (res.ok || res.status === 204)) return;
    log('   ⚠️ الحذف مرفوض (HTTP ' + (res && res.status) + ') — هنشيل الصورة بدلها');
  } catch (e) {
    log('   ⚠️ الحذف فشل:', e.message, '— هنشيل الصورة بدلها');
  }

  // الخطة البديلة: نفس الصف من غير الصورة
  const slim = { status: job.status, ref: job.ref || '', at: new Date().toISOString() };
  try {
    await sbFetch(env, url, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ value: JSON.stringify(slim), updated_at: new Date().toISOString() })
    });
  } catch (e) { log('   ⚠️ حتى تصغير الصف فشل:', e.message); }
}""",
    """// مهلة قبل حذف الأمر الخالص. الصفحة بتسأل كل ٨٠٠ مللي لمدة
// ٣٠ ثانية، فالمهلة دي بتضمن إنها شافت النتيجة قبل ما يختفي.
const FINISH_DELETE_MS = 45000;

async function finishJob(env, key, job) {
  const url = 'app_data?key=eq.' + encodeURIComponent(key);

  // ⚠️ بنعلّم "تم" الأول — ومنمسحش على طول.
  //    الصفحة اللي طلبت الطباعة بتفضل تسأل على الصف ده مستنية
  //    status='done'. لو مسحناه فوراً بتلاقيه اختفى، وبتفضل
  //    مستنية لحد ما المهلة تخلص وتقول "مقدرناش نوصل للطابعة" —
  //    والليبل يكون اتطبع فعلاً. ده كان بيشتغل بالصدفة أيام ما
  //    كان الحذف مرفوض بـ RLS وبينزل للخطة البديلة.
  //
  //    الصف بعد التصغير ~١٢٠ بايت من غير الصورة، وفلتر الوكيل
  //    على value=like.*pending* فمش هيتحمّل تاني خالص.
  const slim = { status: job.status, ref: job.ref || '', at: new Date().toISOString() };
  try {
    const res = await sbFetch(env, url, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ value: JSON.stringify(slim), updated_at: new Date().toISOString() })
    });
    if (!(res && (res.ok || res.status === 204))) {
      log('   ⚠️ mark-done rejected (HTTP ' + (res && res.status) + ')');
    }
  } catch (e) { log('   ⚠️ mark-done failed:', e.message); }

  // والحذف بعد شوية. الصفحة بتمسحه بنفسها أول ما تشوف النتيجة،
  // فده احتياطي لو المتصفح اتقفل — عشان الصفوف ماتتراكمش.
  setTimeout(() => {
    sbFetch(env, url, { method: 'DELETE' }).catch(() => {});
  }, FINISH_DELETE_MS);
}"""
)

# ============================================================
# صفحة السجل: العربي جوه كتلة إنجليزي كان بيطلع مبعثر
# ============================================================
edit(
    'log page: per-line text direction',
    """'b{color:#4ade80}pre{margin:0;padding:14px;white-space:pre-wrap;word-break:break-word;direction:ltr;text-align:left}' +""",
    """// unicode-bidi:plaintext بيخلي كل سطر ياخد اتجاهه من أول حرف
      // فيه. من غيرها السطر اللي فيه عربي جوه إنجليزي بيطلع مبعثر.
      'b{color:#4ade80}pre{margin:0;padding:14px;white-space:pre-wrap;word-break:break-word;' +
      'direction:ltr;text-align:left;unicode-bidi:plaintext}' +"""
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
