#!/usr/bin/env node
/**
 * Compare the free OpenRouter vision models on a real ECG reading task.
 * Sends the same test ECG image + a compact version of the app's analysis
 * prompt to each model, scores: JSON validity, fields present, latency.
 * Picks the best model for the AIECG analyzer.
 */
import { readFileSync } from 'fs'

// key comes from the environment — never commit secrets
const KEY = process.env.OPENROUTER_API_KEY
if (!KEY) { console.error('set OPENROUTER_API_KEY first'); process.exit(1) }
const IMG = readFileSync('/home/z/my-project/assets/test-ecg.png').toString('base64')

const MODELS = [
  'nvidia/nemotron-3.5-super-vl:free',
  'inclusionai/ling-3.2-flash:free',
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
]

// compact version of the app's real analysis prompt (same JSON contract)
const PROMPT = `You are a consulting cardiac electrophysiologist reading a standard 12-lead ECG (25 mm/s, 10 mm/mV, layeout: rows of leads I,II,III,aVR,aVL,aVF,V1..V6).

Read EVERY lead. Output ONLY a JSON object (no markdown) with exactly these fields:
{"isEcg":boolean,"heartRate":number,"rhythm":string,"pWave":string,"prInterval":string,"qrsDuration":string,"qtInterval":string,"axis":string,"normality":"Normal"|"Borderline"|"Abnormal","urgency":"Routine"|"Urgent"|"Emergency","leads":[{"lead":"I","findings":"...","stSegment":"...","tWave":"..."}],"summary":"...","scpCodes":["ND"],"differentials":["..."]}`

async function testModel(model) {
  const t0 = Date.now()
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
        'HTTP-Referer': 'https://my-project-beta-jade-13.vercel.app',
        'X-Title': 'AIECG',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${IMG}` } },
            ],
          },
        ],
      }),
    })
    const dt = ((Date.now() - t0) / 1000).toFixed(1)
    if (!r.ok) {
      const t = await r.text()
      console.log(`✗ ${model} -> HTTP ${r.status} (${dt}s): ${t.slice(0, 150)}`)
      return
    }
    const j = await r.json()
    const content = j.choices?.[0]?.message?.content ?? ''
    // score the output
    const jsonStart = content.indexOf('{')
    const jsonEnd = content.lastIndexOf('}')
    let valid = false
    let fields = 0
    let hr = null
    let normality = null
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        const o = JSON.parse(content.slice(jsonStart, jsonEnd + 1))
        valid = true
        const need = ['isEcg', 'heartRate', 'rhythm', 'normality', 'urgency', 'leads', 'summary', 'scpCodes']
        fields = need.filter((k) => k in o).length
        hr = o.heartRate
        normality = o.normality
      } catch {}
    }
    console.log(
      `${valid ? '✓' : '✗'} ${model} -> ${dt}s | json:${valid} fields:${fields}/8 | HR:${hr} normality:${normality} | len:${content.length}`
    )
  } catch (e) {
    console.log(`✗ ${model} -> error: ${e.message.slice(0, 120)}`)
  }
}

for (const m of MODELS) {
  await testModel(m)
}
