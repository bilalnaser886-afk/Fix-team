#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
باتش print-agent.js — الليبل بيطلع مقصوص من اليمين والحروف مش نضيفة.

السبب:
  المقاس المطلوب كان بيتحسب من $e.PageBounds — يعني من مقاس الورقة
  اللي **تعريف الطابعة** شايفه. وإحنا بنبني PaperSize مخصّصة في
  الكود، وكتير من تعريفات الطابعات الحرارية بتتجاهلها وبترجع لمقاس
  الاستيكر المظبوط جوه التعريف.

  لو التعريف مظبوط على 40مم والليبل الحقيقي 37:
     PageBounds = 157 → 319 نقطة ، والصورة 296 نقطة
     ⇒ الصورة بتتمطّ 8٪ ، والاستيكر الحقيقي بيقص الزيادة من اليمين.

  ودي بتفسّر الحاجتين مع بعض:
     • "I FIX TEAM" بتتقص من اليمين             ← الزيادة برّه الورق
     • الحروف مش نضيفة                          ← NearestNeighbor
       وهو بيمطّ 296→319 بيكرّر عمود من كل ١٣، فحروف العربي
       بتطلع بأعمدة سميكة ورفيعة بالتبادل.

الإصلاح:
  ١) المقاس بيتحسب من المليمتر × دقة الطابعة — الصفحة هي المصدر
     الموثوق للمقاس، مش التعريف.
  ٢) لو التعريف عنده استيكر بنفس المقاس بنستخدمه هو (التعريفات
     بتحترم استيكراتها أكتر من أي مقاس بنبنيه إحنا).
  ٣) الرسم بيبدأ من حرف الورقة الحقيقي مش من أول المساحة القابلة
     للطباعة.
  ٤) بيطبع نسبة التكبير في الكونسول — لو مش 1.000 يبقى فيه إعادة
     تشكيل وهي دايماً بتاكل من جودة الحروف.

ملاحظة ترميز:
  التعليقات جوه سكربت PowerShell بالعربي زي باقي الملف، لكن أي نص
  بيتطبع بـ Write-Host بيفضل إنجليزي ASCII. السكربت بيتبعت على سطر
  الأوامر، وترميز الكونسول في ويندوز ممكن يبوّظ الحروف — والتعليق
  المبوّظ مالوش أثر، لكن رسالة التشخيص المبوّظة بتضيع فايدتها.
"""
import sys, io

PATH = 'print-agent.js'
EDITS = []


def edit(name, old, new):
    EDITS.append((name, old, new))


# ============================================================
# ١) اختيار الاستيكر: استيكر التعريف أولاً، والمخصّص احتياطي
# ============================================================
edit(
    'paper size: prefer a driver form',
    """        $ps = New-Object System.Drawing.Printing.PaperSize('IFixLabel', ${wHun}, ${hHun});
        $pd.DefaultPageSettings.PaperSize = $ps;
        $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0);""",
    """        # لو التعريف عنده استيكر بنفس المقاس (± 0.5مم) بنستخدمه هو.
        # التعريفات بتحترم استيكراتها أكتر بكتير من أي PaperSize
        # بنبنيها إحنا — ودي أهم خطوة عشان الورق يطلع مظبوط.
        $wantW = ${wHun}; $wantH = ${hHun};
        $ps = $null;
        foreach($cand in $pd.PrinterSettings.PaperSizes){
          if([Math]::Abs($cand.Width - $wantW) -le 2 -and [Math]::Abs($cand.Height - $wantH) -le 2){ $ps = $cand; break }
        }
        if($ps -eq $null){
          $ps = New-Object System.Drawing.Printing.PaperSize('IFixLabel', $wantW, $wantH);
          Write-Host "paper: no matching driver form - using a custom size";
        } else {
          Write-Host ("paper: driver form '" + $ps.PaperName + "' " + $ps.Width + "x" + $ps.Height);
        }
        $pd.DefaultPageSettings.PaperSize = $ps;
        $pd.PrinterSettings.DefaultPageSettings.PaperSize = $ps;
        $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0);
        # صريحة عشان مانعتمدش على الافتراضي: (0,0) عند حرف المساحة
        # القابلة للطباعة، وإحنا بنصحّحها تحت للورقة الحقيقية.
        $pd.OriginAtMargins = $false;"""
)

# ============================================================
# ٢) المقاس من المليمتر مش من الورقة + تشخيص
# ============================================================
edit(
    'draw: size from mm, origin at paper edge',
    """          $wPx = [int][Math]::Round($b.Width  / 100.0 * $dx);
          $hPx = [int][Math]::Round($b.Height / 100.0 * $dy);
          $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Pixel;
          Write-Host ("label: " + $b.Width + "x" + $b.Height + " (1/100in) -> " + $wPx + "x" + $hPx + " px @ " + $dx + "dpi | source: " + $img.Width + "x" + $img.Height);""",
    """          # ⚠️ المقاس بيتحسب من المليمتر × الدقة — مش من PageBounds.
          #    PageBounds بترجّع مقاس الورقة اللي **التعريف** شايفه،
          #    ولو مختلف عن الاستيكر الحقيقي الصورة بتتمطّ عليه
          #    والاستيكر بيقص الزيادة. ده كان بيقطع "I FIX TEAM"
          #    من اليمين ويبوّظ حروف العربي في نفس الوقت.
          #    المليمتر جاي من الصفحة وهو المصدر الوحيد الموثوق.
          $wPx = [int][Math]::Round(${wMm} / 25.4 * $dx);
          $hPx = [int][Math]::Round(${hMm} / 25.4 * $dy);
          $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Pixel;

          # GDI+ بيحط (0,0) عند أول المساحة القابلة للطباعة مش عند
          # حرف الورقة. لو التعريف مبلّغ عن هامش صلب بنزحزح بالسالب
          # عشان نرجع لحرف الورقة الحقيقي. أغلب الطابعات الحرارية
          # بتبلّغ صفر، وساعتها مفيش أي فرق.
          $hmx = 0.0; $hmy = 0.0;
          try { $hmx = [double]$e.PageSettings.HardMarginX; $hmy = [double]$e.PageSettings.HardMarginY } catch {}
          $ox = [int][Math]::Round(-$hmx / 100.0 * $dx);
          $oy = [int][Math]::Round(-$hmy / 100.0 * $dy);

          $sc = 0.0; if($img.Width -gt 0){ $sc = [Math]::Round($wPx / [double]$img.Width, 4) }
          Write-Host ("label: page=" + $b.Width + "x" + $b.Height + " (1/100in) | target=" + $wPx + "x" + $hPx + "px @ " + $dx + "dpi | source=" + $img.Width + "x" + $img.Height + " | scale=" + $sc + " | hardMargin=" + $hmx + "," + $hmy + " origin=" + $ox + "," + $oy);
          if($sc -ne 1.0){
            Write-Host ("  !! scale is not 1.000 - resampling will soften the glyphs.");
            Write-Host ("     the page should render at " + [Math]::Round($dx / 25.4, 3) + " px/mm (PX_PER_MM).");
          }""")

edit(
    'draw call: use paper origin',
    """          $e.Graphics.DrawImage($img, 0, 0, $wPx, $hPx);""",
    """          $e.Graphics.DrawImage($img, $ox, $oy, $wPx, $hPx);"""
)

# ============================================================
# ٣) المليمتر لازم يوصل لنص PowerShell
# ============================================================
edit(
    'inject mm into the script',
    """      const wHun = Math.round(widthMm / 25.4 * 100);    // مئات البوصة
      const hHun = Math.round(heightMm / 25.4 * 100);""",
    """      const wHun = Math.round(widthMm / 25.4 * 100);    // مئات البوصة
      const hHun = Math.round(heightMm / 25.4 * 100);
      // المليمتر بيتحقن كنص عشري ثابت — PowerShell بيقرا الأرقام
      // بالإنجليزي دايماً، فمفيش مشكلة فاصلة عشرية مع أي لغة ويندوز
      const wMm = Number(widthMm).toFixed(3);
      const hMm = Number(heightMm).toFixed(3);"""
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
