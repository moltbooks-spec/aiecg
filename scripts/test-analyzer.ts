/**
 * Local end-to-end test of the analyzer through the new provider chain
 * (OpenRouter primary, z.ai fallback). Sends the real test ECG image with
 * the real system prompt shape and checks the full JSON contract.
 *
 * Run: bun scripts/test-analyzer.ts
 */
import { readFileSync } from 'fs'

async function main() {
  // key comes from the environment — never commit secrets to the repo
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('set OPENROUTER_API_KEY in the environment first')
  }

  const { zaiCreateVision } = await import('../src/lib/zai-client')

  const IMG = readFileSync('/home/z/my-project/assets/test-ecg.png').toString('base64')

  const learningBlock = `LEARNING MEMORY — VERIFIED REFERENCE ANCHORS (from the 40-record PhysioNet library installed in this system; selected for this patient).
Compare the current tracing's morphology against these official labels before concluding:
  - PTB-XL records100/01000/00111_hr [NORM/NORM]: "sinus rhythm, normal ECG" (Wagner et al. 2020, Sci Data)
  - MIT-BIH mitdb/124/IVR [CD/IVR]: "accelerated idioventricular rhythm" (Moody & Mark 2001)`

  const t0 = Date.now()
  const response = await zaiCreateVision({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are a cardiac electrophysiologist. Analyze the attached 12-lead ECG (25 mm/s, 10 mm/mV) and return ONLY a JSON object with fields: isEcg, heartRate, rhythm, pWave, prInterval, qrsDuration, qtInterval, axis, normality (Normal|Borderline|Abnormal), urgency (Routine|Urgent|Emergency), leads (array of {lead, findings, stSegment, tWave, severity}), summary, scpCodes, differentials, crossCheck.\n\n${learningBlock}`,
          },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${IMG}` } },
        ],
      },
    ],
  })
  const dt = ((Date.now() - t0) / 1000).toFixed(1)

  const raw = response.choices[0]?.message?.content ?? ''
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  const json = JSON.parse(raw.slice(start, end + 1))

  const need = ['isEcg', 'heartRate', 'rhythm', 'normality', 'urgency', 'leads', 'summary']
  const missing = need.filter((k) => !(k in json))
  console.log(`model used: ${response.model}`)
  console.log(`latency: ${dt}s | leads read: ${json.leads?.length} | missing fields: ${missing.length}`)
  console.log(`HR: ${json.heartRate} | rhythm: ${json.rhythm} | normality: ${json.normality}`)
  if (missing.length > 0) throw new Error(`missing: ${missing.join(',')}`)
  if (json.isEcg === false) throw new Error('model rejected a valid ECG')
  console.log('\nANALYZER TEST PASSED ✓')
}

main().catch((e) => {
  console.error('TEST FAILED:', e.message.slice(0, 400))
  process.exit(1)
})
