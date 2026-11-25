/**
 * E2E API test for AIECG per-lead reading: register -> create case (per-lead analysis)
 * -> verify 12 leads + regional summary + cross-check -> chat -> PDF.
 * Run: bun /home/z/my-project/scripts/e2e-leads-test.ts
 */
const BASE = 'http://localhost:3000'
const rnd = Math.floor(Math.random() * 1e6)
const EMAIL = `leads.doctor${rnd}@aiecg-test.com`
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

interface LeadFinding { lead: string; scpCode?: string | null; finding: string; severity: string }
interface RegionalSummary { region: string; leads: string[]; verdict: string; evidenceLeads: string[]; note: string }
interface CrossCheck { regionalConsistency: string; discrepancies: string[]; notes: string }

async function getImageDataUrl(): Promise<string> {
  const fs = await import('fs')
  const b64 = fs.readFileSync('/home/z/my-project/assets/test-ecg.png').toString('base64')
  return `data:image/png;base64,${b64}`
}

async function main() {
  let allOk = true
  const imageDataUrl = await getImageDataUrl()
  let caseId = ''

  allOk = (await step('1. Register account', async () => {
    const res = await jfetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        doctorName: 'Leads Test Doctor',
        hospitalName: 'Per-Lead Test Hospital',
        specialty: 'Cardiology',
        email: EMAIL,
        password: PASSWORD,
      }),
    })
    return res.status === 201
  })) && allOk

  allOk = (await step('2. Create case + per-lead analysis (may take ~90s)', async () => {
    const res = await jfetch('/api/cases', {
      method: 'POST',
      body: JSON.stringify({
        patientName: 'Marcus Benjamin Lee',
        patientAge: 64,
        patientGender: 'Male',
        patientId: 'MRN-77120',
        bloodPressure: '150/92',
        clinicalNotes: 'Acute central chest pain radiating to jaw for 40 minutes, diaphoresis. Smoker, hypertensive.',
        imageDataUrl,
      }),
    })
    const data = await res.json() as {
      case?: { id: string; caseNumber: string; status: string; leadFindings?: LeadFinding[] }
      error?: string
    }
    if (res.status !== 201 || !data.case) {
      console.log('     error:', data.error)
      return false
    }
    caseId = data.case.id
    const lf = data.case.leadFindings ?? []
    console.log(`     case ${data.case.caseNumber} status=${data.case.status} leadFindings=${lf.length}`)
    if (data.case.status === 'failed') {
      console.log('     failure:', data.error)
      return false
    }
    return data.case.status === 'completed' && lf.length >= 12
  })) && allOk

  allOk = (await step('3. All 12 standard leads covered individually', async () => {
    const res = await jfetch(`/api/cases/${caseId}`)
    const data = await res.json() as { case?: { leadFindings?: LeadFinding[] } }
    const lf = data.case?.leadFindings ?? []
    const expected = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
    const present = new Set(lf.map((l) => l.lead))
    const missing = expected.filter((l) => !present.has(l))
    if (missing.length) {
      console.log('     missing leads:', missing.join(', '))
      return false
    }
    const withFindings = lf.filter((l) => l.finding && l.finding.length > 10)
    console.log(`     12/12 leads present; ${withFindings.length} have substantive findings`)
    return withFindings.length >= 12
  })) && allOk

  allOk = (await step('4. Regional wall summary present', async () => {
    const res = await jfetch(`/api/cases/${caseId}`)
    const data = await res.json() as { case?: { regionalSummary?: RegionalSummary[] } }
    const rs = data.case?.regionalSummary ?? []
    const regions = rs.map((r) => r.region.toLowerCase())
    const hasInferior = regions.some((r) => r.includes('inferior'))
    const hasAnterior = regions.some((r) => r.includes('anterior') || r.includes('septal'))
    console.log(`     ${rs.length} regions:`, rs.map((r) => `${r.region}(${r.verdict})`).join(' | ').slice(0, 200))
    return rs.length >= 4 && hasInferior && hasAnterior
  })) && allOk

  allOk = (await step('5. Cross-check computed (consistency + notes)', async () => {
    const res = await jfetch(`/api/cases/${caseId}`)
    const data = await res.json() as { case?: { crossCheck?: CrossCheck } }
    const cc = data.case?.crossCheck
    if (!cc) return false
    console.log(`     regionalConsistency=${cc.regionalConsistency}, discrepancies=${cc.discrepancies.length}`)
    console.log(`     notes: ${(cc.notes || '').slice(0, 140)}`)
    return ['Consistent', 'Partial', 'Inconsistent'].includes(cc.regionalConsistency)
  })) && allOk

  allOk = (await step('6. Chat sees per-lead context', async () => {
    const res = await jfetch(`/api/cases/${caseId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message: 'Which individual leads show the main abnormality, and which wall region do they represent?' }),
    })
    const data = await res.json() as { assistantMessage?: { content: string }; error?: string }
    if (!res.ok || !data.assistantMessage) {
      console.log('     error:', data.error)
      return false
    }
    const reply = data.assistantMessage.content
    const mentionsLead = /lead|V\d|aV[RLF]|inferior|anterior|lateral|septal/i.test(reply)
    console.log(`     reply (${reply.length} chars) mentions leads/regions: ${mentionsLead}`)
    console.log(`     ${reply.slice(0, 180).replace(/\n/g, ' ')}…`)
    return mentionsLead && reply.length > 60
  })) && allOk

  allOk = (await step('7. PDF contains per-lead table + regional summary', async () => {
    const res = await jfetch(`/api/cases/${caseId}/pdf`)
    if (res.status !== 200) return false
    const buf = Buffer.from(await res.arrayBuffer())
    const fs = await import('fs')
    fs.writeFileSync('/home/z/my-project/download/AIECG-PerLead-Report.pdf', buf)
    console.log(`     saved ${buf.length} bytes PDF`)
    return buf.slice(0, 5).toString('ascii') === '%PDF-' && buf.length > 15000
  })) && allOk

  console.log(allOk ? '\nALL PER-LEAD E2E TESTS PASSED ✓' : '\nSOME TESTS FAILED ✗')
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
