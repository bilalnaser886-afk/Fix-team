#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
باتش dashboard.html — الرسالتين اللي بتطلعوا على الموبايل.

التسلسل اللي كان بيحصل:
    الموبايل يدوس طباعة
      → محاولة الوكيل المحلي  (بتفشل دايماً — مفيش localhost على الموبايل)
      → محاولة سحابية، تستنى ١٢ ثانية بصمت تام
      → تنتهي المهلة  →  "برنامج الطباعة المباشرة مش شغال"   ← رسالة ١
      → browserPrintLabel() بيحاول يفتح نافذة
      → سفاري يمنعها       →  "المتصفح منع نافذة الطباعة"      ← رسالة ٢

أربع مشاكل في التسلسل ده:
  ١) ١٢ ثانية قصيرة. دورة سؤال الوكيل لوحدها ٤ ثواني (POLL_MS)،
     والطباعة نفسها بتاخد ثواني كمان — فالمهلة كانت بتنتهي
     والوكيل لسه بيطبع فعلاً.
  ٢) مفيش أي إشارة أثناء الانتظار — المستخدم بيفتكر إن الزرار
     مااشتغلش ويدوس تاني، فيطلع ليبلين.
  ٣) نافذة الطباعة العادية مالهاش أي لازمة على الموبايل — مفيش
     طابعة ليبل متوصلة بيه أصلاً.
  ٤) محاولة الوكيل المحلي من الموبايل ضياع وقت وخطأ في الكونسول.
"""
import sys, io

PATH = 'dashboard.html'
EDITS = []


def edit(name, old, new):
    EDITS.append((name, old, new))


edit(
    'IS_MOBILE flag',
    """const PRINT_AGENT_URL = 'http://localhost:9123';""",
    """const PRINT_AGENT_URL = 'http://localhost:9123';
// الوكيل بيشتغل على كمبيوتر المحل بس. من الموبايل الطباعة بتروح
// للسحابة، ونافذة الطباعة العادية مالهاش لازمة — الطابعة أصلاً
// مش متوصلة بالموبايل.
const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);"""
)

edit(
    'skip local probe on mobile',
    """async function trySilentPrintLocal(image, sz, ref, jobId){
  // ⚠️ الفحص الأول مهم: من غيره كنّا بنبعت أمر الطباعة""",
    """async function trySilentPrintLocal(image, sz, ref, jobId){
  // الموبايل مالوش وكيل محلي — بنوفّر ثانية ونص انتظار وخطأ
  // في الكونسول مع كل طباعة
  if(IS_MOBILE) return false;
  // ⚠️ الفحص الأول مهم: من غيره كنّا بنبعت أمر الطباعة"""
)

edit(
    'cloud deadline 12s -> 30s',
    """  const deadline = Date.now() + 12000;""",
    """  // ⚠️ ٣٠ ثانية مش ١٢. دورة سؤال الوكيل لوحدها ٤ ثواني
  //    (POLL_MS في print-agent.js)، والطباعة الحرارية بتاخد
  //    ثواني كمان. ١٢ كانت بتنتهي والوكيل لسه بيطبع — فالمستخدم
  //    يشوف رسالة فشل والليبل بيطلع من الطابعة بعدها بثانيتين.
  const deadline = Date.now() + 30000;"""
)

edit(
    'busy bar + printLabel feedback',
    """async function printLabel(){
  const dv = devices.find(x => x.id === labelDeviceId);
  if(dv && typeof isFeatureEnabled === 'function' && isFeatureEnabled('silent_label_print')){
    saveLabelSize();
    const ok = await trySilentPrint(dv, getLabelSize(), grabQrDataUrl());
    if(ok){""",
    """// شريط بيبان طول ما الطباعة السحابية شغالة. من غيره المستخدم
// بيستنى نص دقيقة من غير أي إشارة، بيفتكر إن الزرار مااشتغلش،
// وبيدوس تاني — فيطلع ليبلين.
function showPrintBusy(msg){
  let el = document.getElementById('printBusyBar');
  if(!msg){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div');
    el.id = 'printBusyBar';
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99998;background:#0F766E;color:#fff;'
      + 'text-align:center;font:800 14px/1.7 inherit;padding:12px 14px;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
}

async function printLabel(){
  const dv = devices.find(x => x.id === labelDeviceId);
  if(dv && typeof isFeatureEnabled === 'function' && isFeatureEnabled('silent_label_print')){
    saveLabelSize();
    showError('');
    showPrintBusy(t('print.sending'));
    let ok = false;
    try{ ok = await trySilentPrint(dv, getLabelSize(), grabQrDataUrl()); }
    finally{ showPrintBusy(''); }
    if(ok){"""
)

edit(
    'no popup fallback on mobile',
    """    showError(t('print.silentFailed'));
  }
  browserPrintLabel();
}""",
    """    // ⚠️ على الموبايل مابنفتحش نافذة الطباعة العادية: سفاري
    //    بيمنع النوافذ المنبثقة فبتطلع رسالة تانية فوق الأولى،
    //    وحتى لو فتحت مفيش طابعة ليبل متوصلة بالموبايل.
    //    رسالة واحدة واضحة أنفع من اتنين مالهمش لازمة.
    if(IS_MOBILE){ showError(t('print.cloudFailed')); return; }
    showError(t('print.silentFailed'));
  }
  browserPrintLabel();
}"""
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
