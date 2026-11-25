/**
 * Reproduce the production 402 "maximum cost exceeds your available credits"
 * with the REAL app prompt (system + reference framework + learning memory +
 * image), then verify the fix (explicit max_tokens) on the new token.
 *
 * Run: OPENROUTER_API_KEY=... bun scripts/test-402-repro.ts
 */
import { readFileSync } from 'fs'

const KEY = process.env.OPENROUTER_API_KEY
if (!KEY) throw new Error('set OPENROUTER_API_KEY first')
const IMG = readFileSync('/home/z/my-project/assets/test-ecg.png').toString('base64')

// exact production system prompt, extracted from the analyzer source
const src = readFileSync('/home/z/my-project/src/lib/ecg-analysis.ts', 'utf-8')
const m = src.match(/const SYSTEM_PROMPT = `([\s\S]*?)`/)
if (!m) throw new Error('SYSTEM_PROMPT not found')
const SYSTEM_PROMPT = m[1]

const { buildReferencePrompt } = await import('../src/lib/ecg-knowledge')
const { buildLearningPrompt } = await import('../src/lib/ecg-learning')

const refBlock = await buildReferencePrompt()
const learnBlock = await buildLearningPrompt({ patientAge: 58, patientGender: 'Male' })
const text = `${SYSTEM_PROMPT}\n\n${refBlock}\n\n${learnBlock}\n\nAnalyze the attached ECG image according to the instructions. Patient data: age 58 years, gender: Male. Return JSON only.`
console.log(`prompt size: ${(text.length / 1024).toFixed(1)} KB`)

async function attempt(label: string, extra: Record<string, unknown>) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
      'HTTP-Referer': 'https://my-project-beta-jade-13.vercel.app',
      'X-Title': 'AIECG',
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3.5-super-vl:free',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${IMG}` } },
          ],
        },
      ],
      ...extra,
    }),
  })
  const body = await r.text()
  if (r.ok) {
    const j = JSON.parse(body)
    const c = j.choices?.[0]?.message?.content ?? ''
    const start = c.indexOf('{')
    const end = c.lastIndexOf('}')
    let valid = false
    let leads = 0
    if (start !== -1 && end > start) {
      try {
        const raw = c.slice(start, end + 1)
        try { require('fs').writeFileSync('/tmp/js-slice.txt', raw) } catch {}
        const o = JSON.parse(raw)
        valid = 'normality' in o && ('leadFindings' in o || 'leads' in o)
        const arr = Array.isArray(o.leadFindings) ? o.leadFindings : (Array.isArray(o.leads) ? o.leads : [])
        leads = arr.length
      } catch { /* truncated JSON */ }
    }
    console.log(`✓ ${label}: HTTP ${r.status} | content ${c.length} chars | json valid:${valid} leads:${leads} | usage: prompt=${j.usage?.prompt_tokens} completion=${j.usage?.completion_tokens} | finish:${j.choices?.[0]?.finish_reason} | tail: ...${c.slice(-80).replace(/\n/g, ' ')}`)
    if (!valid) {
      require('fs').writeFileSync('/tmp/completion.txt', c)
    }
    return valid
  }
  console.log(`✗ ${label}: HTTP ${r.status} ${body.slice(0, 160)}`)
  return false
}

// 1) reproduce production failure (no max_tokens — what the app sends today)
await attempt('no max_tokens (current app)', {})
// 2) fix candidate: explicit max_tokens cap (8192 — full reading needs ~7.2k)
await attempt('max_tokens=8192', { max_tokens: 8192 })
