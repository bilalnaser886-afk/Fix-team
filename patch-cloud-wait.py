#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
باتش dashboard.html — الصف اللي بيختفي.

الصفحة بتسأل على أمر الطباعة مستنية status='done'. لو الوكيل
مسح الصف بعد ما طبع (وده اللي بيحصل مع نسخ الوكيل اللي الحذف
شغال معاها)، الصفحة بتلاقيه اختفى وبتعتبرها "لسه ما خلصش"
وبتفضل تلف لحد ما المهلة تخلص.

الوكيل الجديد بيعلّم done قبل ما يمسح، فالمشكلة اتحلّت من ناحيته.
بس بنصلّحها هنا كمان عشان أي وكيل قديم لسه شغال على أي كمبيوتر
يفضل يشتغل صح — والاتنين مستقلين عن بعض.
"""
import sys, io

PATH = 'dashboard.html'
EDITS = [
    ('cloud wait: vanished row = printed',
     """  let result = false;
  while(Date.now() < deadline){
    await new Promise(r => setTimeout(r, 800));
    try{
      const { data } = await sb.from('app_data').select('value').eq('key', key).maybeSingle();
      if(!data) continue;
      const job = JSON.parse(data.value);
      if(job.status === 'done'){ result = true; break; }
      if(job.status === 'failed'){ result = false; break; }
    }catch(e){ /* هنكمّل المحاولة لحد ما الوقت يخلص */ }
  }""",
     """  let result = false;
  let seen = false;              // شفنا الأمر في القاعدة قبل كده؟
  while(Date.now() < deadline){
    await new Promise(r => setTimeout(r, 800));
    try{
      const { data } = await sb.from('app_data').select('value').eq('key', key).maybeSingle();
      if(!data){
        // ⚠️ الصف اختفى. الوكيل هو الوحيد اللي بيقدر يمسح أمر
        //    شغّال (سياسة الحذف مقصورة على print-job:%)، فاختفاؤه
        //    بعد ما شفناه معناه إنه طبع وخلص ومسحه.
        //    من غير الشرط ده كنا بنفضل مستنيين ٣٠ ثانية ونقول
        //    "مقدرناش نوصل للطابعة" والليبل خارج من الطابعة فعلاً.
        //    ⚠️ لازم نكون شفناه الأول: لو اختفى من أول لفة يبقى
        //    الكتابة نفسها ماوصلتش، وده فشل حقيقي مش نجاح.
        if(seen){ result = true; break; }
        continue;
      }
      seen = true;
      const job = JSON.parse(data.value);
      if(job.status === 'done'){ result = true; break; }
      if(job.status === 'failed'){ result = false; break; }
    }catch(e){ /* هنكمّل المحاولة لحد ما الوقت يخلص */ }
  }"""),
]


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
