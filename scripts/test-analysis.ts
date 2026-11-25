import { analyzeEcgImage } from '../src/lib/ecg-analysis'
import fs from 'fs'

const img64 = fs.readFileSync('/home/z/my-project/assets/test-ecg.png').toString('base64')

const result = await analyzeEcgImage({
  imageDataUrl: `data:image/png;base64,${img64}`,
  patientAge: 45,
  patientGender: 'ذكر',
  clinicalNotes: 'ألم صدري غير نمطي منذ يومين',
  bloodPressure: '125/82',
})

console.log(JSON.stringify(result, null, 2))
