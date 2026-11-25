import React from 'react'
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import fs from 'fs'

Font.register({
  family: 'Naskh',
  fonts: [
    { src: '/home/z/my-project/assets/fonts/NotoNaskhArabic-Regular.ttf' },
    { src: '/home/z/my-project/assets/fonts/NotoNaskhArabic-Bold.ttf', fontWeight: 700 },
    { src: '/home/z/my-project/assets/fonts/NotoNaskhArabic-SemiBold.ttf', fontWeight: 600 },
  ],
})

const styles = StyleSheet.create({
  page: { fontFamily: 'Naskh', fontSize: 12, padding: 40 },
  title: { fontSize: 22, fontWeight: 700, textAlign: 'center', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { color: '#555' },
  value: { fontWeight: 600 },
  finding: { marginBottom: 4, textAlign: 'right' },
})

const TestDoc = () => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={{ direction: 'rtl' }}>
        <Text style={styles.title}>تقرير تخطيط القلب — منصة يعرب</Text>
        <Text style={{ textAlign: 'center', color: '#0f766e', marginBottom: 16 }}>
          تحليل بالذكاء الاصطناعي بإشراف طبي
        </Text>
        <View style={styles.row}>
          <Text style={styles.label}>اسم المريض: محمد أحمد العلي</Text>
          <Text style={styles.label}>العمر: 45 سنة — الجنس: ذكر</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>رقم الحالة: YRB-2026-0001</Text>
          <Text style={styles.label}>التاريخ: 2026-11-14</Text>
        </View>
        <View style={{ marginTop: 16, marginBottom: 8, borderBottomWidth: 1, borderColor: '#ccc' }} />
        <Text style={{ fontWeight: 700, marginBottom: 6 }}>المعطيات المقاسة:</Text>
        <View style={styles.row}>
          <Text>معدل النبض: <Text style={styles.value}>75 نبضة/دقيقة</Text></Text>
          <Text>نظم القلب: <Text style={styles.value}>نظم جيبي منتظم</Text></Text>
        </View>
        <View style={styles.row}>
          <Text>فترة PR: <Text style={styles.value}>160 مل ث</Text></Text>
          <Text>مركب QRS: <Text style={styles.value}>90 مل ث</Text></Text>
        </View>
        <Text style={{ marginTop: 16, fontWeight: 700, marginBottom: 6 }}>النتائج:</Text>
        <Text style={styles.finding}>1. يظهر التخطيط نظم جيبي منتظم بمعدل 75 نبضة في الدقيقة.</Text>
        <Text style={styles.finding}>2. المحور الكهربائي طبيعي +60 درجة.</Text>
        <Text style={styles.finding}>3. مقطع ST وموجة T دون تغيرات ممرضة.</Text>
        <Text style={{ marginTop: 16, fontWeight: 700, marginBottom: 6 }}>الخلاصة:</Text>
        <Text>تخطيط قلب طبيعي دون دليل على اضطراب هيكلي أو كهربائي واضح.</Text>
        <Text style={{ marginTop: 24, fontSize: 10, color: '#888' }}>
          تنبيه: هذا التقرير مساعد للأطباء ولا يغني عن التقييم السريري المباشر.
        </Text>
      </View>
    </Page>
  </Document>
)

const buf = await renderToBuffer(<TestDoc />)
fs.writeFileSync('/tmp/test-arabic.pdf', buf)
console.log('PDF generated:', buf.length, 'bytes')
