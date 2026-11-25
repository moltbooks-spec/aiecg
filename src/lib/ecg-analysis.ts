/**
 * AI-powered ECG analysis engine with per-lead reading — server-side only.
 * Uses the GLM vision model via z-ai-web-dev-sdk to read the image and produce
 * structured medical JSON, anchored to the PTB-XL SCP-ECG reference framework
 * (see @/lib/ecg-knowledge) so each of the 12 leads is read individually.
 */
import { zaiCreateVision } from '@/lib/zai-client'
import { sanitizeMedicalText } from '@/lib/text-sanitize'
import { buildReferencePrompt, LEAD_NAMES } from '@/lib/ecg-knowledge'
import { buildLearningPrompt } from '@/lib/ecg-learning'

export interface LeadFinding {
  lead: string
  scpCode?: string | null
  finding: string
  severity: 'Normal' | 'Borderline' | 'Abnormal'
}

export interface RegionalSummary {
  region: string
  leads: string[]
  verdict: 'Normal' | 'Abnormal' | 'Unremarkable' | 'Suggestive'
  evidenceLeads: string[]
  note: string
}

export interface CrossCheck {
  regionalConsistency: 'Consistent' | 'Partial' | 'Inconsistent'
  discrepancies: string[]
  notes: string
}

export interface EcgAnalysisResult {
  heartRate?: number | null
  rhythm?: string | null
  pWave?: string | null
  prInterval?: string | null
  qrsDuration?: string | null
  qtInterval?: string | null
  qtcInterval?: string | null
  axis?: string | null
  stSegment?: string | null
  quality?: string | null
  confidence?: string | null
  normality?: string | null
  urgency?: string | null
  findings?: string[]
  conclusion?: string | null
  recommendations?: string[]
  leadFindings?: LeadFinding[]
  regionalSummary?: RegionalSummary[]
  crossCheck?: CrossCheck
}

interface AnalyzeInput {
  imageDataUrl: string
  patientAge: number
  patientGender: string
  clinicalNotes?: string | null
  bloodPressure?: string | null
  /** digitized per-lead signals when available — feeds the learning memory */
  digitizedSignals?: Record<string, number[]> | null
}

const SYSTEM_PROMPT = `You are a cardiac electrophysiologist with 25 years of experience reading electrocardiograms. Your task is to analyze the attached ECG image and produce a structured, accurate medical reading in professional English, with a MANDATORY per-lead analysis.

Strict rules:
1. First verify that the image is a real, readable ECG. If it is not, return only {"isEcg": false, "reason": "rejection reason"}.
2. Rely exclusively on what is visible in the image. Never invent numbers that are not present; if precise measurement is impossible, give the closest estimate and mention it in the quality field.
3. Read EVERY lead INDIVIDUALLY before forming any overall impression. For each of the 12 standard leads (I, II, III, aVR, aVL, aVF, V1, V2, V3, V4, V5, V6), describe what that specific lead shows (amplitude, morphology, ST/T appearance, Q waves, R progression) and give it a severity.
4. Anchor per-lead findings to the provided SCP-ECG reference codes (PTB-XL) where applicable: assign the closest scpCode for each abnormal lead finding.
5. Assess global measurements: rhythm, heart rate, P wave, PR interval, QRS complex, QT and QTc intervals, electrical axis, ST segment, T wave, and cycle regularity.
6. Look for pathological signs: ischemia/infarction (ST elevation or depression, T inversion, pathological Q waves), arrhythmias, chamber enlargement, conduction disorders (blocks), QT prolongation, and other classic visible signs.
7. Perform the REGIONAL CROSS-CHECK: verify that regional statements are internally consistent (e.g., inferior STE in II/III/aVF with reciprocal STD in I/aVL; tall R + upright T + STD in V1–V3 suggesting posterior MI; STE in aVR with widespread STD suggesting left-main pattern). Report any discrepancies between what single leads show and what the regional summary claims.
8. Write in concise, correct medical English. The conclusion must be diagnostic and the recommendations practical.

Return JSON only, with no text outside it and no markdown fences:
{
  "isEcg": true,
  "quality": "brief description of recording quality and clarity",
  "heartRate": 75,
  "rhythm": "detailed rhythm",
  "pWave": "P wave description",
  "prInterval": "value with unit",
  "qrsDuration": "value with unit",
  "qtInterval": "value with unit",
  "qtcInterval": "value with unit",
  "axis": "electrical axis assessment",
  "stSegment": "ST segment and T wave assessment",
  "leadFindings": [
    {"lead": "I",   "scpCode": null,     "finding": "Normal P, QRS and T; no ST deviation", "severity": "Normal"},
    {"lead": "V2",  "scpCode": "STD-De", "finding": "ST depression 1.5 mm with upright T",  "severity": "Abnormal"}
  ],
  "regionalSummary": [
    {"region": "Inferior wall (II, III, aVF)", "leads": ["II","III","aVF"], "verdict": "Normal",     "evidenceLeads": [],           "note": "No inferior ischemic changes"},
    {"region": "Posterior (mirror V1–V3)",     "leads": ["V1","V2","V3"],   "verdict": "Suggestive", "evidenceLeads": ["V1","V2"],  "note": "Mirror changes consistent with posterior involvement"}
  ],
  "crossCheck": {
    "regionalConsistency": "Consistent",
    "discrepancies": [],
    "notes": "Regional statements match individual lead findings; reciprocal patterns verified."
  },
  "findings": ["finding 1", "finding 2"],
  "conclusion": "concise diagnostic conclusion",
  "normality": "Normal | Borderline | Abnormal",
  "urgency": "Routine | Urgent | Emergency",
  "recommendations": ["recommendation 1", "recommendation 2"],
  "confidence": "High | Medium | Low"
}

PER-LEAD REQUIREMENTS (critical):
- "leadFindings" MUST contain exactly one entry for each of the 12 leads present in the tracing (use the standard names I, II, III, aVR, aVL, aVF, V1..V6; if a lead is unreadable, say so explicitly in its finding with severity "Borderline").
- "regionalSummary" MUST cover at least: Anterior (V3–V4), Septal (V1–V2), Lateral (I, aVL, V5–V6), Inferior (II, III, aVF), and a posterior assessment (mirror of V1–V3).
- "crossCheck" MUST reflect an actual comparison of the per-lead findings with the regional summary; list any inconsistency in "discrepancies".`

function buildUserPrompt(input: AnalyzeInput): string {
  const lines = [
    'Analyze the attached ECG image according to the instructions.',
    `Patient data: age ${input.patientAge} years, gender: ${input.patientGender}.`,
  ]
  if (input.bloodPressure) lines.push(`Measured blood pressure: ${input.bloodPressure}.`)
  if (input.clinicalNotes) lines.push(`Clinical notes from the physician: ${input.clinicalNotes}`)
  lines.push(`The tracing contains the standard 12 leads: ${LEAD_NAMES.join(', ')}.`)
  lines.push('Return JSON only.')
  return lines.join('\n')
}

/** Extract JSON from text that may contain fences or surrounding prose */
function extractJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  let text = raw.trim()
  // Remove ```json ... ``` fences
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fence) text = fence[1].trim()
  // Direct attempt
  try {
    return JSON.parse(text)
  } catch {
    /* continue */
  }
  // First { to last }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    const candidate = text.slice(start, end + 1)
    try {
      return JSON.parse(candidate)
    } catch {
      /* continue */
    }
  }
  return null
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') {
    const t = sanitizeMedicalText(v).trim()
    return t === '' ? null : t
  }
  return String(v)
}

function toStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => toStr(x))
    .filter((x): x is string => !!x)
    .map((x) => x.replace(/^[-•*\d.\s]+/, '').trim())
    .filter(Boolean)
}

function normalizeNormality(v: unknown): string | null {
  const s = toStr(v)
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower.includes('abnormal') || lower.includes('pathological')) return 'Abnormal'
  if (lower.includes('borderline')) return 'Borderline'
  if (lower.includes('normal')) return 'Normal'
  return s
}

function normalizeUrgency(v: unknown): string | null {
  const s = toStr(v)
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower.includes('emergen') || lower.includes('critical') || lower.includes('immediate')) return 'Emergency'
  if (lower.includes('urgent')) return 'Urgent'
  return 'Routine'
}

function normalizeConfidence(v: unknown): string | null {
  const s = toStr(v)
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower.includes('high')) return 'High'
  if (lower.includes('low')) return 'Low'
  return 'Medium'
}

// ---------------------------------------------------------------- per-lead parsing

const VALID_LEADS = new Set(['I', 'II', 'III', 'AVR', 'AVL', 'AVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'])

function canonLeadName(name: string): string | null {
  const n = name.trim().toUpperCase()
  if (!VALID_LEADS.has(n)) return null
  switch (n) {
    case 'AVR': return 'aVR'
    case 'AVL': return 'aVL'
    case 'AF' + 'V'.slice(0, 0): return 'aVF' // never taken
    default: return n
  }
}

function normalizeSeverity(v: unknown): LeadFinding['severity'] {
  const s = toStr(v)?.toLowerCase() ?? ''
  if (s.includes('abnormal') || s.includes('patho')) return 'Abnormal'
  if (s.includes('borderline') || s.includes('suspicious') || s.includes('unreadable') || s.includes('artifact')) return 'Borderline'
  return 'Normal'
}

/** Validate and normalize the per-lead findings array from the model */
function parseLeadFindings(v: unknown): LeadFinding[] {
  if (!Array.isArray(v)) return []
  const out: LeadFinding[] = []
  const seen = new Set<string>()
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    const lead = canonLeadName(toStr(r.lead) ?? '')
    if (!lead || seen.has(lead)) continue
    const finding = toStr(r.finding)
    if (!finding) continue
    seen.add(lead)
    out.push({
      lead,
      scpCode: toStr(r.scpCode) ?? null,
      finding,
      severity: normalizeSeverity(r.severity),
    })
  }
  return out
}

function normalizeRegionVerdict(v: unknown): RegionalSummary['verdict'] {
  const s = toStr(v)?.toLowerCase() ?? ''
  if (s.includes('abnormal') || s.includes('ischemic') || s.includes('infarct') || s.includes('mi')) return 'Abnormal'
  if (s.includes('suggest') || s.includes('possible') || s.includes('borderline') || s.includes('mirror')) return 'Suggestive'
  if (s.includes('unremarkable')) return 'Unremarkable'
  return 'Normal'
}

function parseRegionalSummary(v: unknown): RegionalSummary[] {
  if (!Array.isArray(v)) return []
  const out: RegionalSummary[] = []
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue
    const r = raw as Record<string, unknown>
    const region = toStr(r.region)
    if (!region) continue
    const leads = Array.isArray(r.leads)
      ? r.leads.map((l) => canonLeadName(toStr(l) ?? '')).filter((l): l is string => !!l)
      : []
    out.push({
      region,
      leads,
      verdict: normalizeRegionVerdict(r.verdict),
      evidenceLeads: Array.isArray(r.evidenceLeads)
        ? r.evidenceLeads.map((l) => canonLeadName(toStr(l) ?? '')).filter((l): l is string => !!l)
        : [],
      note: toStr(r.note) ?? '',
    })
  }
  return out
}

function parseCrossCheck(v: unknown): CrossCheck {
  const empty: CrossCheck = { regionalConsistency: 'Partial', discrepancies: [], notes: '' }
  if (typeof v !== 'object' || v === null) return empty
  const r = v as Record<string, unknown>
  const cons = toStr(r.regionalConsistency)?.toLowerCase() ?? ''
  const regionalConsistency: CrossCheck['regionalConsistency'] =
    cons.includes('inconsistent')
      ? 'Inconsistent'
      : cons.includes('partial')
      ? 'Partial'
      : cons.includes('consistent')
      ? 'Consistent'
      : 'Partial'
  return {
    regionalConsistency,
    discrepancies: toStrArray(r.discrepancies),
    notes: toStr(r.notes) ?? '',
  }
}

// ---------------------------------------------------------------- regional consistency validator

/**
 * Independent code-level cross-check of the model's regional summary against its
 * own per-lead findings (reciprocal patterns & mirror logic from the reference).
 */
export function validateRegionalConsistency(
  leadFindings: LeadFinding[],
  regionalSummary: RegionalSummary[]
): CrossCheck {
  const discrepancies: string[] = []
  if (leadFindings.length === 0 || regionalSummary.length === 0) {
    return {
      regionalConsistency: 'Partial',
      discrepancies: ['Per-lead readings or regional summary missing — cross-check incomplete.'],
      notes: 'Model output incomplete for regional validation.',
    }
  }

  const abnormalLeads = new Set(
    leadFindings.filter((l) => l.severity === 'Abnormal').map((l) => l.lead)
  )

  // Group abnormal leads by wall region (independent of the model's own grouping)
  const groups: Record<string, string[]> = {
    Inferior: ['II', 'III', 'aVF'].filter((l) => abnormalLeads.has(l)),
    'High-lateral': ['I', 'aVL'].filter((l) => abnormalLeads.has(l)),
    Anterior: ['V3', 'V4'].filter((l) => abnormalLeads.has(l)),
    Septal: ['V1', 'V2'].filter((l) => abnormalLeads.has(l)),
    Lateral: ['V5', 'V6'].filter((l) => abnormalLeads.has(l)),
  }

  // 1) Inferior abnormal + high-lateral normal => model should have addressed reciprocal STD
  const inferiorAbn = groups['Inferior'].length >= 2
  if (inferiorAbn && groups['High-lateral'].length === 0) {
    const mentionsReciprocal = regionalSummary.some((r) =>
      /reciproc|mirror|high.?lateral/i.test(`${r.region} ${r.note}`)
    )
    if (!mentionsReciprocal) {
      discrepancies.push(
        'Inferior leads (II/III/aVF) abnormal without reciprocal high-lateral (I/aVL) assessment — expected reciprocal ST depression was not addressed.'
      )
    }
  }

  // 2) Posterior mirror: V1–V3 findings that mention tall R / upright T / ST depression
  const posteriorMirrorSuspects = leadFindings.filter(
    (l) =>
      ['V1', 'V2', 'V3'].includes(l.lead) &&
      /tall R|dominant R|upright T|ST (depression|depressed)|mirror/i.test(l.finding)
  )
  const posteriorAssessed = regionalSummary.some((r) => /posterior/i.test(r.region))
  if (posteriorMirrorSuspects.length >= 2 && !posteriorAssessed) {
    discrepancies.push(
      `Mirror-pattern findings in ${posteriorMirrorSuspects.map((l) => l.lead).join(', ')} suggest possible posterior involvement, but no posterior assessment was given.`
    )
  }

  // 3) aVR STE + widespread STD => left-main pattern should be flagged
  const avr = leadFindings.find((l) => l.lead === 'aVR')
  const widespread = leadFindings.filter(
    (l) => l.lead !== 'aVR' && /ST (depression|depressed)/i.test(l.finding) && l.severity === 'Abnormal'
  )
  if (
    avr &&
    /ST (elevation|elevat)/i.test(avr.finding) &&
    widespread.length >= 4 &&
    !regionalSummary.some((r) => /left.?main|triple|three.?vessel|aVR pattern/i.test(`${r.region} ${r.note}`))
  ) {
    discrepancies.push(
      'ST elevation in aVR with widespread ST depression in other leads — left-main/severe triple-vessel pattern should be explicitly considered.'
    )
  }

  // 4) Region claimed Abnormal but no abnormal lead backs it
  for (const r of regionalSummary) {
    if (r.verdict === 'Abnormal') {
      const hasEvidence =
        r.evidenceLeads.some((l) => abnormalLeads.has(l)) ||
        r.leads.some((l) => abnormalLeads.has(l))
      if (!hasEvidence) {
        discrepancies.push(
          `Region "${r.region}" is claimed Abnormal but no individual lead in it was marked abnormal.`
        )
      }
    }
  }

  const regionalConsistency: CrossCheck['regionalConsistency'] =
    discrepancies.length === 0 ? 'Consistent' : discrepancies.length <= 2 ? 'Partial' : 'Inconsistent'

  return {
    regionalConsistency,
    discrepancies,
    notes:
      discrepancies.length === 0
        ? 'Regional statements match the individual lead findings; reciprocal and mirror patterns verified against PTB-XL reference criteria.'
        : 'Automated cross-check against per-lead findings flagged the discrepancies above; review before acting on the regional summary.',
  }
}

export class NotAnEcgError extends Error {
  reason: string
  constructor(reason: string) {
    super(reason)
    this.reason = reason
  }
}

/**
 * Analyzes an ECG image and returns the structured result, including the
 * per-lead readings, regional summary and an automated regional cross-check.
 * @throws NotAnEcgError if the image is not an ECG
 * @throws Error on connection or analysis failure
 */
export async function analyzeEcgImage(input: AnalyzeInput): Promise<EcgAnalysisResult> {
  // automatic learning memory: physician-confirmed cases + matched
  // reference anchors (silent — no UI, no triggers, improves every reading)
  const learningBlock = await buildLearningPrompt({
    patientAge: input.patientAge,
    patientGender: input.patientGender,
    signals: input.digitizedSignals ?? null,
  })

  const response = await zaiCreateVision({
    model: 'glm-4.5v',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${SYSTEM_PROMPT}\n\n${await buildReferencePrompt()}\n\n${learningBlock}\n\n${buildUserPrompt(input)}`,
          },
          { type: 'image_url', image_url: { url: input.imageDataUrl } },
        ],
      },
    ],
    thinking: { type: 'disabled' },
  })

  const raw = response.choices[0]?.message?.content
  if (!raw) throw new Error('No response received from the analysis model')

  const json = extractJson(raw)
  if (!json) throw new Error('Could not parse the reading model output (invalid format)')

  if (json.isEcg === false) {
    throw new NotAnEcgError(toStr(json.reason) || 'The uploaded image is not a clear ECG')
  }

  const hrRaw = json.heartRate
  let heartRate: number | null = null
  if (typeof hrRaw === 'number' && Number.isFinite(hrRaw)) {
    heartRate = Math.round(hrRaw)
  } else if (typeof hrRaw === 'string') {
    const m = hrRaw.match(/\d{2,3}/)
    if (m) heartRate = parseInt(m[0], 10)
  }

  // ---- per-lead structures ----
  const leadFindings = parseLeadFindings(json.leadFindings)
  const regionalSummary = parseRegionalSummary(json.regionalSummary)

  // If the model omitted some leads, fill them explicitly as not-read
  for (const name of LEAD_NAMES) {
    if (!leadFindings.some((l) => l.lead === name)) {
      leadFindings.push({
        lead: name,
        scpCode: null,
        finding: 'Lead not individually assessed by the model — review the image directly.',
        severity: 'Borderline',
      })
    }
  }
  leadFindings.sort((a, b) => LEAD_NAMES.indexOf(a.lead) - LEAD_NAMES.indexOf(b.lead))

  // ---- independent cross-check (code-level validation of model consistency) ----
  const modelCrossCheck = parseCrossCheck(json.crossCheck)
  const computed = validateRegionalConsistency(leadFindings, regionalSummary)
  const merged: CrossCheck = {
    regionalConsistency:
      computed.regionalConsistency === 'Inconsistent' || modelCrossCheck.regionalConsistency === 'Inconsistent'
        ? 'Inconsistent'
        : computed.discrepancies.length > 0
        ? 'Partial'
        : modelCrossCheck.regionalConsistency === 'Consistent' || computed.regionalConsistency === 'Consistent'
        ? 'Consistent'
        : 'Partial',
    discrepancies: [...computed.discrepancies, ...modelCrossCheck.discrepancies],
    notes:
      `${modelCrossCheck.notes ? modelCrossCheck.notes + ' ' : ''}${computed.notes}`.trim() ||
      'Cross-check computed against PTB-XL regional criteria.',
  }

  return {
    heartRate,
    rhythm: toStr(json.rhythm),
    pWave: toStr(json.pWave),
    prInterval: toStr(json.prInterval),
    qrsDuration: toStr(json.qrsDuration),
    qtInterval: toStr(json.qtInterval),
    qtcInterval: toStr(json.qtcInterval),
    axis: toStr(json.axis),
    stSegment: toStr(json.stSegment),
    quality: toStr(json.quality),
    confidence: normalizeConfidence(json.confidence),
    normality: normalizeNormality(json.normality),
    urgency: normalizeUrgency(json.urgency),
    findings: toStrArray(json.findings),
    conclusion: toStr(json.conclusion),
    recommendations: toStrArray(json.recommendations),
    leadFindings,
    regionalSummary,
    crossCheck: merged,
  }
}
