// ============================================================================
// loadDevices() — نسخة معدّلة بـ keyset pagination بدل OFFSET
//
// المشكلة القديمة: .range(p*1000, ...) بتتحول لـ OFFSET 17000 LIMIT 1000،
// و Postgres بيضطر يقرا الـ 17000 صف ويرميهم قبل ما يرجّع اللي انت عايزه.
// آخر صفحتين بيعدّوا الـ statement_timeout (8 ثواني) وبيتقتلوا.
//
// الحل: بدل ما نقول "ابدأ من الصف رقم كذا"، نقول "هات اللي الـ id بتاعه
// أكبر من آخر id جبته". ده بيمشي على الـ index بتاع الـ Primary Key
// مباشرة، فكل صفحة نفس السرعة — أول واحدة زي آخر واحدة بالظبط.
//
// ملحوظة: التحميل بقى تسلسلي مش متوازي، بس كل صفحة بتاخد ~150ms
// بدل ثواني، فالإجمالي أسرع من النسخة المتوازية اللي بتفشل.
// ============================================================================

async function loadDevices(){
  try{
    const PAGE = 1000;
    const allRows = [];
    let lastId = '';      // المؤشر — آخر id اتجاب في الصفحة اللي فاتت
    let guard = 0;        // حماية من لوب لا نهائي لو حصل أي شذوذ

    while(guard++ < 1000){
      let q = sb.from('devices_data')
                .select('id,data')
                .order('id', { ascending: true })   // لازم ترتيب ثابت عشان الـ keyset يشتغل
                .limit(PAGE);

      // أول صفحة بس هي اللي من غير شرط — الباقي بيكمّل من عند المؤشر
      if(lastId) q = q.gt('id', lastId);

      const { data, error } = await q;
      if(error) throw error;

      // مفيش صفوف تانية → خلصنا
      // مهم: بنكسر على الفاضي بس، مش على (data.length < PAGE)، عشان لو
      // إعداد db-max-rows في المشروع أقل من 1000 مانخسرش صفوف بالغلط
      if(!data || !data.length) break;

      allRows.push(...data);
      lastId = data[data.length - 1].id;

      // تحديث شريط التقدّم لو موجود
      if(typeof showLoadProgress === 'function'){
        showLoadProgress(allRows.length);
      }
    }

    if(allRows.length){
      devices = allRows.map(r => r.data);
    } else {
      // الترحيل التلقائي من البنية القديمة (الكتلة الواحدة) — مرة واحدة بس
      let old = null;
      try{ old = await window.storage.get(STORAGE_KEY); }catch(e){}
      devices = old ? JSON.parse(old.value) : [];
      if(devices.length){
        await sb.from('devices_data').upsert(
          devices.map(d => ({ id: d.id, data: d, updated_at: new Date().toISOString() }))
        );
      }
    }

    devices.sort((a,b) => new Date(b.intakeDate||0) - new Date(a.intakeDate||0));
    exitOfflineMode();
  }catch(e){
    // مفيش نت أو السيرفر مش متاح → نشتغل من الكاش المحلي
    devices = readCache();
    enterOfflineMode();
  }
  snapshotSynced();
  writeCache();
  render();
}
