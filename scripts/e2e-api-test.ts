/**
 * E2E API test for AIECG: register -> login -> create case (analyze) -> chat -> PDF download.
 * Run: bun /home/z/my-project/scripts/e2e-api-test.ts
 */
const BASE = 'http://localhost:3000'
const rnd = Math.floor(Math.random() * 1e6)
const EMAIL = `e2e.doctor${rnd}@aiecg-test.com`
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

// ---- read the synthetic ECG image as data URL ----
async function getImageDataUrl(): Promise<string> {
  const fs = await import('fs')
  const path = '/home/z/my-project/assets/test-ecg.png'
  const b64 = fs.readFileSync(path).toString('base64')
  return `data:image/png;base64,${b64}`
}

let caseId = ''
let caseNumber = ''

async function main() {
  let allOk = true
  const imageDataUrl = await getImageDataUrl()

  allOk = (await step('1. Register hospital account', async () => {
    const res = await jfetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        doctorName: 'E2E Test Doctor',
        hospitalName: 'AIECG Test Hospital',
        specialty: 'Cardiology',
        email: EMAIL,
        password: PASSWORD,
      }),
    })
    const data = await res.json() as { user?: { email: string }; error?: string }
    return res.status === 201 && !!data.user?.email
  })) && allOk

  allOk = (await step('2. Session persists (GET /api/auth/me)', async () => {
    const res = await jfetch('/api/auth/me')
    const data = await res.json() as { user?: { email: string } }
    return res.status === 200 && data.user?.email === EMAIL
  })) && allOk

  allOk = (await step('3. Logout', async () => {
    const res = await jfetch('/api/auth/logout', { method: 'POST' })
    return res.status === 200
  })) && allOk

  allOk = (await step('4. Session gone after logout', async () => {
    const res = await jfetch('/api/auth/me')
    const data = await res.json() as { user?: unknown }
    return res.status === 200 && data.user === null
  })) && allOk

  allOk = (await step('5. Login again', async () => {
    const res = await jfetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    const data = await res.json() as { user?: { email: string } }
    return res.status === 200 && data.user?.email === EMAIL
  })) && allOk

  allOk = (await step('6. Case list empty initially', async () => {
    const res = await jfetch('/api/cases')
    const data = await res.json() as { cases?: unknown[] }
    return res.status === 200 && data.cases?.length === 0
  })) && allOk

  allOk = (await step('7. Create case + AI analysis (may take ~60s)', async () => {
    const res = await jfetch('/api/cases', {
      method: 'POST',
      body: JSON.stringify({
        patientName: 'John Adam Smith',
        patientAge: 58,
        patientGender: 'Male',
        patientId: 'MRN-88213',
        bloodPressure: '138/86',
        clinicalNotes: 'Chest discomfort on exertion for 2 days. Hypertension on amlodipine.',
        imageDataUrl,
      }),
    })
    const data = await res.json() as { case?: { id: string; caseNumber: string; status: string; rhythm?: string; conclusion?: string; normality?: string }; error?: string }
    if (res.status !== 201 || !data.case) {
      console.log('     error:', data.error)
      return false
    }
    caseId = data.case.id
    caseNumber = data.case.caseNumber
    console.log(`     case ${caseNumber} -> status=${data.case.status}, rhythm=${data.case.rhythm ?? '-'}, normality=${data.case.normality ?? '-'}`)
    if (data.case.status === 'failed') {
      console.log('     failure reason:', data.error)
      return false
    }
    return data.case.status === 'completed'
  })) && allOk

  allOk = (await step('8. Case detail includes image', async () => {
    const res = await jfetch(`/api/cases/${caseId}`)
    const data = await res.json() as { case?: { imageBase64?: string } }
    return res.status === 200 && !!data.case?.imageBase64
  })) && allOk

  allOk = (await step('9. Chat: first question gets AI reply', async () => {
    const res = await jfetch(`/api/cases/${caseId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message: 'Can you summarize the key findings of this ECG and what they may indicate clinically?' }),
    })
    const data = await res.json() as { assistantMessage?: { content: string }; error?: string }
    if (!res.ok || !data.assistantMessage) {
      console.log('     error:', data.error)
      return false
    }
    console.log(`     reply: ${data.assistantMessage.content.slice(0, 160).replace(/\n/g, ' ')}…`)
    return data.assistantMessage.content.length > 20
  })) && allOk

  allOk = (await step('10. Chat: follow-up shows context awareness', async () => {
    const res = await jfetch(`/api/cases/${caseId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message: 'Given those findings, what would you check in a follow-up ECG, and why?' }),
    })
    const data = await res.json() as { assistantMessage?: { content: string }; error?: string }
    if (!res.ok || !data.assistantMessage) {
      console.log('     error:', data.error)
      return false
    }
    return data.assistantMessage.content.length > 20
  })) && allOk

  allOk = (await step('11. Chat history persisted', async () => {
    const res = await jfetch(`/api/cases/${caseId}/chat`)
    const data = await res.json() as { messages?: Array<{ role: string }> }
    return res.status === 200 && (data.messages?.length ?? 0) === 4
  })) && allOk

  allOk = (await step('12. PDF report download', async () => {
    const res = await jfetch(`/api/cases/${caseId}/pdf`)
    if (res.status !== 200) return false
    const buf = Buffer.from(await res.arrayBuffer())
    const fs = await import('fs')
    fs.writeFileSync('/home/z/my-project/download/AIECG-Report-E2E.pdf', buf)
    console.log(`     saved ${buf.length} bytes, header: ${buf.slice(0, 5).toString('ascii')}`)
    return buf.slice(0, 5).toString('ascii') === '%PDF-' && buf.length > 10000
  })) && allOk

  allOk = (await step('13. Case list shows the case', async () => {
    const res = await jfetch('/api/cases')
    const data = await res.json() as { cases?: Array<{ caseNumber: string }> }
    return res.status === 200 && data.cases?.some((c) => c.caseNumber === caseNumber)
  })) && allOk

  console.log(allOk ? '\nALL E2E TESTS PASSED ✓' : '\nSOME TESTS FAILED ✗')
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
