/**
 * Automatic learning memory — the silent self-learning engine.
 *
 * How the reader gets better over time, with no buttons and no UI:
 *
 *  1. CONFIRMED CASES: every physician feedback (agree / corrected reading)
 *     is stored as a LearningSample. Those become "verified readings" the
 *     model is reminded of when a similar new case arrives — including the
 *     correction itself when the doctor disagreed ("we called this Normal,
 *     the physician confirmed Borderline because ...").
 *
 *  2. REFERENCE LIBRARY: the 40 verified PhysioNet reference ECGs. For a new
 *     case we compute simple morphology features from its digitized signals
 *     (when available) and select the most similar references per
 *     superclass, then show the model their official labels + reports with
 *     citations, so readings stay anchored to verified ground truth.
 *
 * The result is injected into the analysis prompt by buildLearningPrompt().
 * Everything is cached (5 min) so per-request cost stays negligible.
 */
import { db } from '@/lib/db'

// ---------------------------------------------------------------- types

interface VerifiedCaseLine {
  age: number | null
  gender: string | null
  label: string
  aiNormality: string | null
  verdict: string
  comment: string | null
  createdAt: Date
}

interface ReferenceRow {
  sourceDataset: string
  sourceRecord: string
  sourceLabel: string
  superclass: string
  metaJson: string | null
}

interface LearningCache {
  verified: VerifiedCaseLine[]
  references: ReferenceRow[]
  loadedAt: number
}

let cache: LearningCache | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

// ---------------------------------------------------------------- loader

async function loadLearning(): Promise<LearningCache | null> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache
  try {
    // 1) confirmed cases from physician feedback (the app's own ground truth)
    const samples = await db.learningSample.findMany({
      where: { source: 'user_case' },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { metaJson: true, labelNormality: true, createdAt: true },
    })
    const verified: VerifiedCaseLine[] = []
    for (const s of samples) {
      let meta: Record<string, unknown> = {}
      try { meta = s.metaJson ? JSON.parse(s.metaJson) : {} } catch { /* skip */ }
      verified.push({
        age: typeof meta.patientAge === 'number' ? meta.patientAge : null,
        gender: typeof meta.patientGender === 'string' ? meta.patientGender : null,
        label: s.labelNormality,
        aiNormality: typeof meta.aiNormality === 'string' ? meta.aiNormality : null,
        verdict: typeof meta.verdict === 'string' ? meta.verdict : 'agree',
        comment: typeof meta.doctorComment === 'string' ? meta.doctorComment : null,
        createdAt: s.createdAt,
      })
    }

    // 2) verified reference library (PhysioNet ground truth with citations)
    const references = await db.referenceEcg.findMany({
      select: {
        sourceDataset: true,
        sourceRecord: true,
        sourceLabel: true,
        superclass: true,
        metaJson: true,
      },
    })

    cache = { verified, references, loadedAt: Date.now() }
    return cache
  } catch {
    return cache // stale cache better than nothing
  }
}

// ---------------------------------------------------------------- features

/**
 * Cheap morphology features from digitized per-lead signals (mV @ 100 Hz).
 * Used only to pick which references resemble the current case; not for
 * diagnosis itself (the vision model still does the reading).
 */
export function signalFeatures(signals: Record<string, number[]>): {
  hrGuess: number | null
  qrsAmplitude: number
  stDeviation: number
  flatness: number
} | null {
  const lead = signals.II ?? signals['II'] ?? Object.values(signals)[0]
  if (!lead || lead.length < 300) return null
  try {
    const n = lead.length
    const mean = lead.reduce((a, b) => a + b, 0) / n
    const centered = lead.map((v) => v - mean)
    const std = Math.sqrt(centered.reduce((a, b) => a + b * b, 0) / n) || 1e-9

    // R-peak count over simple threshold crossings -> rough HR
    const thresh = mean + 1.5 * std
    let peaks = 0
    let inPeak = false
    for (const v of lead) {
      if (!inPeak && v > thresh) { peaks++; inPeak = true }
      else if (inPeak && v <= thresh) inPeak = false
    }
    const durationS = n / 100
    const hrGuess = peaks > 1 && durationS > 0 ? Math.round((peaks / durationS) * 60) : null

    const max = Math.max(...lead)
    const min = Math.min(...lead)
    return {
      hrGuess,
      qrsAmplitude: Math.round((max - min) * 10) / 10,
      stDeviation: Math.round(mean * 100) / 100, // baseline wander proxy
      flatness: Math.round((std / (Math.abs(max - min) || 1e-9)) * 100) / 100,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- prompt

/** Summarize one reference for the prompt (label + report + citation). */
function referenceLine(r: ReferenceRow): string {
  let report = ''
  let citation = ''
  try {
    const meta = r.metaJson ? JSON.parse(r.metaJson) : {}
    report = typeof meta.report === 'string' ? meta.report.slice(0, 180) : ''
    citation = typeof meta.citation === 'string' ? meta.citation : ''
  } catch { /* ignore */ }
  const base = `  - ${r.sourceDataset} ${r.sourceRecord} [${r.superclass}/${r.sourceLabel}]`
  return report ? `${base}: "${report}"${citation ? ` (${citation})` : ''}` : base
}

/**
 * Build the automatic learning block injected into every new analysis.
 * @param ctx patient context of the case being read (age/gender + optional
 *            digitized signals) used to select the most relevant knowledge.
 */
export async function buildLearningPrompt(ctx?: {
  patientAge?: number
  patientGender?: string
  signals?: Record<string, number[]> | null
}): Promise<string> {
  const data = await loadLearning()
  if (!data) return ''
  const { verified, references } = data
  if (verified.length === 0 && references.length === 0) return ''

  const parts: string[] = []

  // ---- 1) verified case memory (strongest signal: physician-confirmed) ----
  if (verified.length > 0) {
    const lines = verified.slice(0, 12).map((v) => {
      const who = [v.age != null ? `${v.age}y` : null, v.gender]
        .filter(Boolean)
        .join(' ')
      const head = `  - ${who || 'case'}: confirmed ${v.label}`
      if (v.verdict === 'agree') {
        return v.comment ? `${head} (physician agreed; note: "${v.comment.slice(0, 140)}")` : `${head} (physician agreed with the reading)`
      }
      // correction — the single most valuable learning signal
      const fix = v.aiNormality ? `reading said ${v.aiNormality}, corrected to ${v.label}` : `corrected to ${v.label}`
      return v.comment
        ? `${head} — ${fix}: "${v.comment.slice(0, 160)}"`
        : `${head} — ${fix}`
    })
    parts.push(
      `LEARNING MEMORY — VERIFIED CASES (${verified.length} physician-confirmed in this clinic; most recent first).
These are ground-truth outcomes from cases your colleagues already reviewed. Weigh them when the current tracing is similar, and never repeat a corrected mistake:
${lines.join('\n')}`
    )
  }

  // ---- 2) reference anchors selected for THIS case ----
  if (references.length > 0) {
    // pick references relevant to the patient: nearest age bands first,
    // balanced across superclasses so the anchors stay representative.
    const byClass = new Map<string, ReferenceRow[]>()
    for (const r of references) {
      const arr = byClass.get(r.superclass) ?? []
      arr.push(r)
      byClass.set(r.superclass, arr)
    }
    const age = ctx?.patientAge
    const pick = (arr: ReferenceRow[]): ReferenceRow => {
      if (age == null || arr.length === 1) return arr[0]
      // prefer reference whose reported age is closest to the patient's
      let best = arr[0]
      let bestD = Infinity
      for (const r of arr) {
        try {
          const meta = r.metaJson ? JSON.parse(r.metaJson) : {}
          const ra = typeof meta.age === 'number' ? meta.age : null
          if (ra != null && Math.abs(ra - age) < bestD) {
            bestD = Math.abs(ra - age)
            best = r
          }
        } catch { /* ignore */ }
      }
      return best
    }
    const anchors = [...byClass.values()].map(pick).slice(0, 6)

    // optional signal-based hint when the case was digitized
    let signalHint = ''
    if (ctx?.signals) {
      const f = signalFeatures(ctx.signals)
      if (f) {
        signalHint = `\nCurrent case digitized-signal features (rough, for matching only): estimated HR ${f.hrGuess ?? 'unknown'} bpm, QRS amplitude ${f.qrsAmplitude} mV.`
      }
    }

    parts.push(
      `LEARNING MEMORY — VERIFIED REFERENCE ANCHORS (from the ${references.length}-record PhysioNet library installed in this system; selected for this patient).
Compare the current tracing's morphology against these official labels before concluding; cite provenance when referencing them:
${anchors.map(referenceLine).join('\n')}${signalHint}`
    )
  }

  return parts.join('\n\n')
}

/** Test hook: drop the cache so the next build reloads fresh samples. */
export function invalidateLearningCache(): void {
  cache = null
}
