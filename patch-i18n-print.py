#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""باتش i18n.js — نصين جداد لمسار الطباعة السحابية."""
import sys, io

PATH = 'i18n.js'
EDITS = [
    ('ar: print keys',
     "      'print.silentFailed': 'برنامج الطباعة المباشرة مش شغال — هنفتح نافذة الطباعة العادية.',",
     "      'print.silentFailed': 'برنامج الطباعة المباشرة مش شغال — هنفتح نافذة الطباعة العادية.',\n"
     "      'print.sending': 'بيتبعت لطابعة المحل...',\n"
     "      'print.cloudFailed': 'مقدرناش نوصل لطابعة المحل — اتأكد إن الكمبيوتر شغال وجرّب تاني.',"),

    ('en: print keys',
     "      'print.silentFailed': 'Direct print service is not running — opening the normal print dialog.',",
     "      'print.silentFailed': 'Direct print service is not running — opening the normal print dialog.',\n"
     "      'print.sending': 'Sending to the shop printer...',\n"
     "      'print.cloudFailed': \"Couldn't reach the shop printer — make sure the computer is on, then try again.\","),
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
