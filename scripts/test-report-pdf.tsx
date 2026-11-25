import { renderToBuffer } from '@react-pdf/renderer'
import fs from 'fs'
import { EcgReportDocument } from '../src/lib/pdf-report'

const imageBase64 = fs.readFileSync('/home/z/my-project/assets/test-ecg.png').toString('base64')

const data = {
  caseNumber: 'YRB-2026-0007',
  createdAt: new Date().toISOString(),
  patient: {
    name: 'محمد أحمد العلي',
    age: 45,
    gender: 'ذكر',
    patientId: '1029384756',
    bloodPressure: '125/82 mmHg',
    clinicalNotes: 'ألم صدري غير نمطي منذ يومين، يزداد مع المجهود. مدخن، تاريخ عائلي لإمراض شرايين إكليلية. لا أدوية حالية.',
  },
  doctor: {
    name: 'سارة الخالدي',
    hospital: 'مدينة الملك فهد الطبية',
    specialty: 'أمراض القلب',
  },
  analysis: {
    heartRate: 76,
    rhythm: 'نظم جيبي منتظم',
    pWave: 'موجات P طبيعية الشكل والمدة في الأطراف الأمامية والصدرية',
    prInterval: '160 مل ث (طبيعي)',
    qrsDuration: '92 مل ث (طبيعي، دون تجاوز 120)',
    qtInterval: '380 مل ث',
    qtcInterval: '415 مل ث (طبيعي)',
    axis: 'طبيعي تقريباً +60 درجة',
    stSegment: 'مقطع ST في المستوى الأساسي دون ارتفاع أو انخفاض، وموجات T طبيعية القطبية والاتساع',
    quality: 'جودة تسجيل ممتازة — جميع الوصلات الـ 12 مقروءة مع شريط نظم كامل',
    confidence: 'مرتفعة',
    normality: 'طبيعي',
    urgency: 'عادي',
    findings: [
      'نظم جيبي منتظم بمعدل 76 نبضة في الدقيقة.',
      'فترة PR ثابتة ومقدارها 160 مل ث ضمن المدى الطبيعي.',
      'مركب QRS بعرض 92 مل ث دون علامات حصار فرع أو اتساع.',
      'محور كهربائي طبيعي قيمته التقريبية +60 درجة.',
      'لا توجد تغيرات ممرضة في مقطع ST أو الموجة T، ولا موجات Q مرضية.',
    ],
    conclusion:
      'تخطيط كهربائية قلب طبيعي بمعايير العمر. لا يوجد دليل كهربائي على نقص تروية حاد أو اضطراب نظم أو توصيل. يُنصح بمتابعة الأعراض السريرية وتقييم عوامل الخطورة القلبية الوعائية.',
    recommendations: [
      'إكمال تقييم عوامل الخطورة (سكر صائم، بروتين دهني، كوليسترول).',
      'إجراء اختبار جهد أو إيكو حسب سريرية الحالة عند تكرار الأعراض.',
      'الإقلاع عن التدخين وضبط نمط الحياة، وإعادة التقييم في العيادة بعد شهر.',
    ],
  },
  imageBase64,
  imageMimeType: 'image/png',
}

const buf = await renderToBuffer(<EcgReportDocument data={data} />)
fs.writeFileSync('/tmp/test-report.pdf', buf)
console.log('Report PDF generated:', buf.length, 'bytes')
