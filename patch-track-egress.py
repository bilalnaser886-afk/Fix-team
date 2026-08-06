#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch-track-egress.py — تقليل النقل في صفحة متابعة العميل (track.html)

المشكلة:
  الصفحة بتسحب من السيرفر كل ١٠ ثواني، **طلبين** في كل دورة:
      get_tracking  +  get_track_response
  والحلقة شغالة حتى والصفحة ورا الخلفية أو التليفون مقفول.

      ٨٬٦٤٠ دورة/يوم × ٢ طلب = ١٧٬٢٨٠ طلب في اليوم — من التاب الواحد.

  والصفحة دي **عامة**: كل عميل معاه لينك. أي تاب متسيّب مفتوح
  بيفضل يدفع من حصة النقل لحد ما يتقفل.

الإصلاح — تلات حاجات، كلها في الحلقة، مفيش لمس للعرض:
  ١) بتقف خالص والصفحة مش ظاهرة.
     (الرجوع للتاب بيحدّث فوراً أصلاً — مستني في visibilitychange،
      فمفيش أي بيانات بتتأخر على العميل.)
  ٢) دقيقة بدل ١٠ ثواني. الصيانة بتاخد ساعات — ١٠ ثواني مالهاش معنى.
  ٣) الطلب التاني (الردود) بيتبعت لما يكون فيه سؤال معلّق بس.
     مفيش سؤال = نص عدد الطلبات يختفي.

وبعد التسليم بتهدى لـ ١٠ دقايق — **مش بتقف** — عشان المرتجع:
الجهاز ممكن يرجع ويتطلب موافقة على سعر جديد (return_price)،
ولو وقفنا الحلقة العميل مش هيشوف الطلب ده وهو قاعد على الصفحة.

الأثر:
  التاب ورا الخلفية (الحالة الغالبة فعلياً) →  صفر طلبات
  التاب مفتوح وظاهر طول اليوم            →  ١٧٬٢٨٠ ← ١٬٤٤٠ تقريباً

الاستخدام:
  python3 patch-track-egress.py track.html
"""

import sys, shutil, os, datetime

OLD = """async function load(){
  if(!token){ $('loading').style.display='none'; $('notfound').style.display='block'; return; }
  try{
    const { data, error } = await sb.rpc('get_tracking', { p_token: token });
    if(error || !data){ $('loading').style.display='none'; $('notfound').style.display='block'; return; }
    responses = await loadResponses();
    renderTrack(JSON.parse(data));
  }catch(e){
    $('loading').style.display='none'; $('notfound').style.display='block';
  }
}

load();
setInterval(load, 10000); // \u062a\u062d\u062f\u064a\u062b \u062a\u0644\u0642\u0627\u0626\u064a \u0643\u0644 \u0661\u0660 \u062b\u0648\u0627\u0646\u064a
// \u0648\u0644\u0648 \u0627\u0644\u0639\u0645\u064a\u0644 \u0631\u062c\u0639 \u0644\u0644\u0635\u0641\u062d\u0629 \u0628\u0639\u062f \u0645\u0627 \u0633\u0627\u0628\u0647\u0627\u060c \u062a\u062a\u062d\u062f\u062b \u0641\u0648\u0631\u0627\u064b
document.addEventListener('visibilitychange', () => { if(!document.hidden) load(); });"""

NEW = """// \u0625\u064a\u0642\u0627\u0639 \u0627\u0644\u0633\u062d\u0628 \u2014 \u0627\u0644\u062c\u0647\u0627\u0632 \u0644\u0633\u0647 \u0641\u064a \u0627\u0644\u0645\u062d\u0644 / \u0627\u062a\u0633\u0644\u0651\u0645
const POLL_ACTIVE = 60000;    // \u062f\u0642\u064a\u0642\u0629
const POLL_IDLE   = 600000;   // \u0639\u0634\u0631 \u062f\u0642\u0627\u064a\u0642 \u0628\u0639\u062f \u0627\u0644\u062a\u0633\u0644\u064a\u0645
let pollMs = 0, pollTimer = null;

// \u0645\u0627 \u0628\u0646\u0633\u062d\u0628\u0634 \u0648\u0627\u0644\u0635\u0641\u062d\u0629 \u0645\u0634 \u0638\u0627\u0647\u0631\u0629. \u0627\u0644\u0631\u062c\u0648\u0639 \u0644\u0644\u062a\u0627\u0628 \u0628\u064a\u062d\u062f\u0651\u062b
// \u0641\u0648\u0631\u0627\u064b \u062a\u062d\u062a \u2014 \u0641\u0627\u0644\u0639\u0645\u064a\u0644 \u0645\u0634 \u0628\u064a\u0641\u0648\u062a\u0647 \u062d\u0627\u062c\u0629.
function tick(){ if(!document.hidden) load(); }

function schedule(ms){
  if(ms === pollMs) return;
  if(pollTimer) clearInterval(pollTimer);
  pollMs = ms;
  pollTimer = setInterval(tick, ms);
}

async function load(){
  if(!token){ $('loading').style.display='none'; $('notfound').style.display='block'; return; }
  try{
    const { data, error } = await sb.rpc('get_tracking', { p_token: token });
    if(error || !data){ $('loading').style.display='none'; $('notfound').style.display='block'; return; }
    const payload = JSON.parse(data);

    // \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u062a\u0627\u0646\u064a \u0644\u0645\u0627 \u064a\u0643\u0648\u0646 \u0641\u064a\u0647 \u0633\u0624\u0627\u0644 \u0645\u0639\u0644\u0651\u0642 \u0628\u0633. \u0644\u0648 \u0645\u0641\u064a\u0634\u060c
    // renderTrack \u0623\u0635\u0644\u0627\u064b \u0645\u0628\u062a\u0642\u0631\u0627\u0634 responses \u2014 \u0641\u0643\u0646\u0651\u0627 \u0628\u0646\u062c\u064a\u0628\u0647\u0627 \u0648\u0646\u0631\u0645\u064a\u0647\u0627.
    const asking = !!(payload.deepInspectionRequested || payload.priceConfirmRequested)
                   && payload.status !== 'delivered';
    responses = asking ? await loadResponses() : {};

    renderTrack(payload);

    // \u0627\u062a\u0633\u0644\u0651\u0645 \u061f \u0646\u0647\u062f\u0651\u064a \u0627\u0644\u0625\u064a\u0642\u0627\u0639 \u0648\u0645\u0627 \u0646\u0648\u0642\u0641\u0634 \u2014 \u0627\u0644\u062c\u0647\u0627\u0632 \u0645\u0645\u0643\u0646
    // \u064a\u0631\u062c\u0639 \u0645\u0631\u062a\u062c\u0639 \u0648\u064a\u062a\u0637\u0644\u0628 \u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0633\u0639\u0631 \u062c\u062f\u064a\u062f.
    schedule(payload.status === 'delivered' ? POLL_IDLE : POLL_ACTIVE);
  }catch(e){
    $('loading').style.display='none'; $('notfound').style.display='block';
  }
}

load();
schedule(POLL_ACTIVE);
// \u0648\u0644\u0648 \u0627\u0644\u0639\u0645\u064a\u0644 \u0631\u062c\u0639 \u0644\u0644\u0635\u0641\u062d\u0629 \u0628\u0639\u062f \u0645\u0627 \u0633\u0627\u0628\u0647\u0627\u060c \u062a\u062a\u062d\u062f\u062b \u0641\u0648\u0631\u0627\u064b
document.addEventListener('visibilitychange', () => { if(!document.hidden) load(); });"""


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'track.html'
    if not os.path.exists(path):
        sys.exit(f'\u274c \u0645\u0627\u0644\u0642\u064a\u062a\u0634 \u0627\u0644\u0645\u0644\u0641: {path}')

    src = open(path, encoding='utf-8').read()

    # \u0627\u062a\u0639\u0645\u0644 \u0642\u0628\u0644 \u0643\u062f\u0647\u061f
    if 'POLL_ACTIVE' in src:
        print('\u2139\ufe0f  \u0627\u0644\u0628\u0627\u062a\u0634 \u0645\u062a\u0639\u0645\u0644 \u0642\u0628\u0644 \u0643\u062f\u0647 \u2014 \u0645\u0641\u064a\u0634 \u062d\u0627\u062c\u0629 \u0627\u062a\u063a\u064a\u0651\u0631\u062a.')
        return

    n = src.count(OLD)
    if n != 1:
        sys.exit(f'\u274c \u0644\u0642\u064a\u062a {n} \u0646\u0633\u062e\u0629 \u0645\u0646 \u0627\u0644\u0643\u062a\u0644\u0629 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641\u0629 \u2014 \u0627\u0644\u0645\u0641\u0631\u0648\u0636 \u0648\u0627\u062d\u062f\u0629. '
                 f'\u064a\u0628\u0642\u0649 \u0627\u0644\u0645\u0644\u0641 \u0627\u062a\u063a\u064a\u0651\u0631. \u0645\u062a\u0643\u0645\u0644\u0634.')

    bak = path + '.bak-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    shutil.copy2(path, bak)

    out = src.replace(OLD, NEW)
    open(path, 'w', encoding='utf-8').write(out)

    print('\u2705 \u062a\u0645')
    print(f'   \u0646\u0633\u062e\u0629 \u0627\u062d\u062a\u064a\u0627\u0637\u064a\u0629: {bak}')
    print('   \u2022 \u0627\u0644\u0633\u062d\u0628 \u0628\u064a\u0642\u0641 \u0648\u0627\u0644\u0635\u0641\u062d\u0629 \u0648\u0631\u0627 \u0627\u0644\u062e\u0644\u0641\u064a\u0629')
    print('   \u2022 \u0661\u0660 \u062b\u0648\u0627\u0646\u064a \u2190 \u062f\u0642\u064a\u0642\u0629 (\u0648\u0661\u0660 \u062f\u0642\u0627\u064a\u0642 \u0628\u0639\u062f \u0627\u0644\u062a\u0633\u0644\u064a\u0645)')
    print('   \u2022 \u0637\u0644\u0628 \u0627\u0644\u0631\u062f\u0648\u062f \u0644\u0645\u0627 \u064a\u0643\u0648\u0646 \u0641\u064a\u0647 \u0633\u0624\u0627\u0644 \u0645\u0639\u0644\u0651\u0642 \u0628\u0633')
    print('\n   \u26a0\ufe0f  \u0632\u0648\u0651\u062f \u0631\u0642\u0645 \u0627\u0644\u0625\u0635\u062f\u0627\u0631 \u0641\u064a sw.js \u0642\u0628\u0644 \u0627\u0644\u0646\u0634\u0631.')


if __name__ == '__main__':
    main()
