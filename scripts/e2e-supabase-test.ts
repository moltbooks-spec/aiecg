/**
 * E2E test for the full Supabase-backed loop:
 * register -> create case (digitization + per-lead analysis) -> verify signals
 * stored -> submit feedback -> verify learning sample -> learning stats -> PDF.
 * Run: bun /home/z/my-project/scripts/e2e-supabase-test.ts
 */
const BASE = 'http://localhost:3000'
const rnd = Math.floor(Math.random() * 1e6)
const EMAIL = `db.doctor${rnd}@aiecg-test.com`
const PASSWORD = 'TestPass123!'

let cookie = ''

async function jfetch(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
  if (cookie) headers['Cookie'] = cookie
  if (init.body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  return res
}

async function step(name: string, fn: () => Promise<boolean>): Promise<boolean> {
  try {
    const ok = await fn()
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
    return ok
  } catch (e) {
    console.log(`ERROR ${name}: ${(e as Error).message}`)
    return false
  }
}

async function main() {
  let allOk = true
  let caseId = ''
  const fs = await import('fs')
  const imageDataUrl = `data:image/png;base64,${fs.readFileSync('/home/z/my-project/assets/test-ecg.png').toString('base64')}`

  allOk = (await step('1. Register on Supabase', async () => {
    const res = await jfetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        doctorName: 'Supabase Test Doctor',
        hospitalName: 'Cloud Hospital',
        specialty: 'Cardiology',
        email: EMAIL,
        password: PASSWORD,
      }),
    })
    return res.status === 201
  })) && allOk

  allOk = (await step('2. Create case: digitize + per-lead analysis (~2-3 min)', async () => {
    const res = await jfetch('/api/cases', {
      method: 'POST',
      body: JSON.stringify({
        patientName: 'Amelia Grace Turner',
        patientAge: 58,
        patientGender: 'Female',
        patientId: 'MRN-88451',
        bloodPressure: '138/86',
        clinicalNotes: 'Palpitations and intermittent chest discomfort for 2 days.',
        imageDataUrl,
      }),
    })
    const data = await res.json() as {
      case?: { id: string; caseNumber: string; status: string }
      error?: string
    }
    if (res.status !== 201 || !data.case) {
      console.log('     error:', data.error)
      return false
    }
    caseId = data.case.id
    console.log(`     case ${data.case.caseNumber} status=${data.case.status}`)
    return data.case.status === 'completed'
  })) && allOk

  allOk = (await step('3. Digitized signals persisted on the case', async () => {
    const res = await jfetch(`/api/cases/${caseId}`)
    const data = await res.json() as {
      case?: { hasSignals: boolean; digitizerInfo: { samplingHz?: number; durationS?: number; gridConfidence?: number } | null }
    }
    const c = data.case
    console.log(`     hasSignals=${c?.hasSignals} info=`, JSON.stringify(c?.digitizerInfo)?.slice(0, 120))
    return !!c?.hasSignals && (c.digitizerInfo?.samplingHz ?? 0) === 100
  })) && allOk

  allOk = (await step('4. Per-lead reading present (12 leads)', async () => {
    const res = await jfetch(`/api/cases/${caseId}`)
    const data = await res.json() as { case?: { leadFindings?: Array<{ lead: string }> } }
    const lf = data.case?.leadFindings ?? []
    const expected = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
    const present = new Set(lf.map((l) => l.lead))
    const missing = expected.filter((l) => !present.has(l))
    console.log(`     ${lf.length} lead findings; missing: ${missing.length ? missing.join(',') : 'none'}`)
    return missing.length === 0
  })) && allOk

  allOk = (await step('5. Submit physician feedback (creates learning sample)', async () => {
    const res = await jfetch(`/api/cases/${caseId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ verdict: 'agree', comment: 'Reading matches my assessment.' }),
    })
    const data = await res.json() as { learningSampleCreated?: boolean; error?: string }
    console.log(`     learningSampleCreated=${data.learningSampleCreated}`)
    if (!res.ok) console.log('     error:', data.error)
    return res.ok && data.learningSampleCreated === true
  })) && allOk

  allOk = (await step('6. Feedback reflected in case (myFeedback)', async () => {
    const res = await jfetch(`/api/cases/${caseId}`)
    const data = await res.json() as { case?: { myFeedback: { verdict: string } | null } }
    console.log(`     myFeedback.verdict=${data.case?.myFeedback?.verdict}`)
    return data.case?.myFeedback?.verdict === 'agree'
  })) && allOk

  allOk = (await step('7. Learning stats show the sample + active model', async () => {
    const res = await jfetch('/api/learning')
    const data = await res.json() as {
      stats?: {
        learningSamples: { userCases: number; total: number; references: number }
        activeModel: { version: number } | null
        feedback: { total: number }
      }
    }
    const s = data.stats
    console.log(`     samples: user=${s?.learningSamples.userCases} total=${s?.learningSamples.total} refs=${s?.learningSamples.references}`)
    console.log(`     activeModel: v${s?.activeModel?.version} | feedback total=${s?.feedback.total}`)
    return (s?.learningSamples.userCases ?? 0) >= 1 && (s?.activeModel?.version ?? 0) >= 2
  })) && allOk

  allOk = (await step('8. Trigger self-learning run (background)', async () => {
    const res = await jfetch('/api/learning', { method: 'POST' })
    const data = await res.json() as { runId?: string; error?: string }
    console.log(`     runId=${data.runId}`)
    return res.ok && !!data.runId
  })) && allOk

  console.log('     (waiting 100s for the training run to finish...)')
  await new Promise((r) => setTimeout(r, 100_000))

  allOk = (await step('9. Learning run completed with new model version', async () => {
    const res = await jfetch('/api/learning')
    const data = await res.json() as {
      stats?: {
        recentRuns: Array<{ status: string; samplesUsed: number; referencesUsed: number }>
        activeModel: { version: number } | null
      }
    }
    const last = data.stats?.recentRuns[0]
    console.log(`     last run: ${last?.status} (${last?.samplesUsed} user + ${last?.referencesUsed} refs)`)
    console.log(`     active model now: v${data.stats?.activeModel?.version}`)
    return last?.status === 'succeeded' && (data.stats?.activeModel?.version ?? 0) >= 3
  })) && allOk

  allOk = (await step('10. PDF report generated', async () => {
    const res = await jfetch(`/api/cases/${caseId}/pdf`)
    if (res.status !== 200) return false
    const buf = Buffer.from(await res.arrayBuffer())
    console.log(`     PDF: ${buf.length} bytes`)
    return buf.slice(0, 5).toString('ascii') === '%PDF-' && buf.length > 15000
  })) && allOk

  console.log(allOk ? '\nALL SUPABASE E2E TESTS PASSED ✓' : '\nSOME TESTS FAILED ✗')
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
