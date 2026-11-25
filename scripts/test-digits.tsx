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
  page: { fontFamily: 'Naskh', fontSize: 13, padding: 40 },
  title: { fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 14 },
  section: { fontWeight: 700, marginTop: 14, marginBottom: 6 },
  finding: { marginBottom: 4 },
  ltr: { direction: 'ltr', unicodeBidi: 'bidi-override' },
})

const TestDoc = () => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={{ direction: 'rtl' }}>
        <Text style={styles.title}>اختبار عرض الأرقام — يعرب</Text>

        <Text style={styles.section}>١) أرقام عربية هندية داخل النص العربي:</Text>
        <Text style={styles.finding}>معدل النبض: ٧٥ نبضة/دقيقة — فترة PR: ١٦٠ مل ث — QRS: ٩٠ مل ث</Text>
        <Text style={styles.finding}>التاريخ: ٢٠٢٦/١١/١٤ — العمر: ٤٥ سنة</Text>
        <Text style={styles.finding}>رقم الحالة: يعرب-٢٠٢٦-٠٠٠١</Text>

        <Text style={styles.section}>٢) نص متداخل باتجاه LTR للأرقام اللاتينية:</Text>
        <Text style={styles.finding}>
          معدل النبض: <Text style={{ direction: 'ltr' }}>75</Text> نبضة/دقيقة — فترة PR:{' '}
          <Text style={{ direction: 'ltr' }}>160</Text> مل ث
        </Text>
        <Text style={styles.finding}>
          رقم الحالة: <Text style={{ direction: 'ltr' }}>YRB-2026-0001</Text>
        </Text>

        <Text style={styles.section}>٣) أرقام لاتينية بدون تداخل (مرجع للمقارنة):</Text>
        <Text style={styles.finding}>معدل النبض: 75 نبضة/دقيقة و PR يساوي 160 مل ث</Text>

        <Text style={styles.section}>٤) محاور ودرجات وعلامات:</Text>
        <Text style={styles.finding}>المحور +٦٠ درجة (طبيعي)، QTc = ٤٢٠ مل ث</Text>
        <Text style={styles.finding}>ملاحظة: ٢٥ مريضاً في ١٤ عيادة، نسبة ٩٥٪</Text>
      </View>
    </Page>
  </Document>
)

const buf = await renderToBuffer(<TestDoc />)
fs.writeFileSync('/tmp/test-digits.pdf', buf)
console.log('PDF generated:', buf.length, 'bytes')
