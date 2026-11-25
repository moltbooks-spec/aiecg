/**
 * Server-side ECG image digitizer bridge — runs the Python digitization
 * pipeline (scripts/digitize-ecg.py) on an uploaded image and stores the
 * per-lead signal arrays on the case. Also captures a LearningSample row so
 * the self-learning trainer can use physician-confirmed cases.
 *
 * The Python script detects the ECG paper grid, segments the 12 lead lanes,
 * extracts each trace, calibrates mm->mV, and resamples to 100 Hz
 * (PTB-XL records100 convention).
 */
import { spawn } from 'child_process'
import path from 'path'
import { db } from '@/lib/db'

export interface DigitizeResult {
  ok: boolean
  method?: string
  samplingHz?: number
  durationS?: number
  gridConfidence?: number
  leads?: Record<string, number[]>
  notes?: string
  reason?: string
}

// Python is resolved at RUNTIME from PYTHON_BIN (or plain 'python3' from PATH)
// so the bundler never traces into the venv at build time.
const PYTHON = process.env.PYTHON_BIN || 'python3'
const SCRIPT = path.join(process.cwd(), 'scripts', 'digitize-ecg.py')

/** Run the digitizer on an image file; resolves with the parsed JSON result. */
export function runDigitizer(imagePath: string, timeoutMs = 90_000): Promise<DigitizeResult> {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON, [SCRIPT, imagePath, '--hz', '100'], {
      cwd: process.cwd(),
      env: { ...process.env },
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      resolve({ ok: false, reason: 'digitizer timeout' })
    }, timeoutMs)
    proc.stdout.on('data', (d) => (out += d.toString()))
    proc.stderr.on('data', (d) => (err += d.toString()))
    proc.on('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, reason: `digitizer failed to start: ${e.message}` })
    })
    proc.on('close', () => {
      clearTimeout(timer)
      try {
        resolve(JSON.parse(out) as DigitizeResult)
      } catch {
        resolve({ ok: false, reason: `digitizer output parse failed: ${err.slice(0, 200)}` })
      }
    })
  })
}

/** Write a data-URL image to a temp file and digitize it. */
export async function digitizeImageDataUrl(
  imageDataUrl: string,
  caseId: string
): Promise<{ result: DigitizeResult; tempPath: string | null }> {
  // The digitizer is a local Python pipeline (numpy/scipy/wfdb) that only
  // runs where PYTHON_BIN points to a real interpreter — e.g. this sandbox.
  // On serverless hosts (Vercel) it is unavailable; the case still gets the
  // full AI reading, just without locally-digitized signals.
  if (!process.env.PYTHON_BIN || !hasInterpreter(process.env.PYTHON_BIN)) {
    return { result: { ok: false, reason: 'digitizer unavailable on this host' }, tempPath: null }
  }
  const m = imageDataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/)
  if (!m) return { result: { ok: false, reason: 'unsupported image format' }, tempPath: null }
  const ext = m[1].includes('png') ? 'png' : m[1].includes('webp') ? 'webp' : 'jpg'
  const fs = await import('fs')
  const os = await import('os')
  const tempPath = path.join(os.tmpdir(), `aiecg-${caseId}.${ext}`)
  fs.writeFileSync(tempPath, Buffer.from(m[2], 'base64'))
  const result = await runDigitizer(tempPath)
  return { result, tempPath }
}

/** True when the configured Python interpreter actually exists on this host. */
function hasInterpreter(p: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('fs').existsSync(p)
  } catch {
    return false
  }
}

/**
 * Digitize the case image, persist signals + info on the case row, and
 * register a LearningSample (label pending physician feedback).
 */
export async function digitizeCase(
  caseId: string,
  imageDataUrl: string
): Promise<DigitizeResult> {
  const { result, tempPath } = await digitizeImageDataUrl(imageDataUrl, caseId)
  try {
    if (result.ok && result.leads) {
      const info = {
        method: result.method ?? 'grid-trace-v1',
        samplingHz: result.samplingHz ?? 100,
        durationS: result.durationS ?? 0,
        gridConfidence: result.gridConfidence ?? 0,
        notes: result.notes ?? '',
      }
      await db.ecgCase.update({
        where: { id: caseId },
        data: {
          digitizedAt: new Date(),
          digitizerInfo: JSON.stringify(info),
          signalsJson: JSON.stringify(result.leads),
        },
      })
    } else {
      await db.ecgCase.update({
        where: { id: caseId },
        data: {
          digitizerInfo: JSON.stringify({
            method: 'grid-trace-v1',
            ok: false,
            reason: result.reason ?? 'unknown',
          }),
        },
      })
    }
  } finally {
    // clean up temp file
    if (tempPath) {
      const fs = await import('fs')
      fs.unlink(tempPath, () => {})
    }
  }
  return result
}

/** Normality label -> benchmark superclass (same mapping as the trainer). */
export function normalityToSuperclass(normality: string | null): string {
  switch (normality) {
    case 'Normal':
      return 'NORM'
    case 'Borderline':
      return 'STTC'
    case 'Abnormal':
      return 'MI'
    default:
      return 'NORM'
  }
}

/**
 * Create or refresh the LearningSample for a case after the physician submits
 * feedback (their ground truth becomes the training label).
 */
export async function upsertLearningSample(
  caseId: string,
  labelNormality: string,
  meta?: Record<string, unknown>
): Promise<void> {
  const c = await db.ecgCase.findUnique({
    where: { id: caseId },
    select: { signalsJson: true, status: true },
  })
  if (!c || !c.signalsJson || c.status !== 'completed') return

  await db.learningSample.upsert({
    where: { id: `ls-${caseId}` },
    create: {
      id: `ls-${caseId}`,
      caseId,
      source: 'user_case',
      labelNormality,
      superclass: normalityToSuperclass(labelNormality),
      signalsJson: c.signalsJson,
      samplingHz: 100,
      metaJson: JSON.stringify(meta ?? {}),
      labelOrigin: 'doctor_feedback',
    },
    update: {
      labelNormality,
      superclass: normalityToSuperclass(labelNormality),
      metaJson: JSON.stringify(meta ?? {}),
    },
  })
}
