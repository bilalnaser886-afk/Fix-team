#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
باتش i18n.js — نصوص شاشة القص.

الرسالة القديمة كانت بتقول "حرّكه أو كبّره وجرّب تاني" — وده بيوجّه
المستخدم للعكس: كل ما يلزّق المربع على الكود أكتر، القراءة تفشل أكتر،
لأن الهامش الأبيض هو شرط في مواصفة QR مش تفصيلة.
"""
import sys, io

PATH = 'i18n.js'
EDITS = [
    ('ar: cropTip',
     "      'scan.cropTip': 'حرّك المربع على الباركود، واسحب الركن لتكبيره',",
     "      'scan.cropTip': 'حط المربع على الباركود وسيب أبيض حواليه — اسحب الركن لتكبيره',"),

    ('ar: selFail',
     "      'scan.selFail': 'مفيش باركود في المربع — حرّكه أو كبّره وجرّب تاني',",
     "      'scan.selFail': 'مفيش باركود في المربع — سيب هامش أبيض حوالين الكود وجرّب تاني',"),

    ('en: cropTip',
     "      'scan.cropTip': 'Move the square onto the barcode, drag the corner to resize',",
     "      'scan.cropTip': 'Put the square over the barcode with some white around it — drag the corner to resize',"),

    ('en: selFail',
     "      'scan.selFail': 'No barcode in the square — move or enlarge it and try again',",
     "      'scan.selFail': 'No barcode in the square — leave some white space around the code and try again',"),
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
