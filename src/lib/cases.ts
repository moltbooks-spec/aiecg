import type { EcgCase, DoctorFeedback, User } from '@prisma/client'
import { db } from '@/lib/db'
import type { CrossCheckDTO, EcgCaseDTO, LeadFindingDTO, RegionalSummaryDTO } from '@/types/ecg'

export type { EcgCaseDTO }

function parseJsonArray(s: string | null): string[] | null {
  if (!s) return null
  try {
    const arr = JSON.parse(s)
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : null
  } catch {
    return null
  }
}

function parseDigitizerInfo(s: string | null): EcgCaseDTO['digitizerInfo'] {
  if (!s) return null
  try {
    const obj = JSON.parse(s)
    if (!obj || typeof obj !== 'object') return null
    return obj as EcgCaseDTO['digitizerInfo']
  } catch {
    return null
  }
}

function parseLeadFindings(s: string | null): LeadFindingDTO[] | null {
  if (!s) return null
  try {
    const arr = JSON.parse(s)
    if (!Array.isArray(arr)) return null
    return arr
      .filter(
        (x): x is LeadFindingDTO =>
          !!x && typeof x === 'object' && typeof (x as LeadFindingDTO).lead === 'string'
      )
      .map((x) => ({
        lead: x.lead,
        scpCode: x.scpCode ?? null,
        finding: x.finding ?? '',
        severity: x.severity ?? 'Normal',
      }))
  } catch {
    return null
  }
}

function parseRegionalSummary(s: string | null): RegionalSummaryDTO[] | null {
  if (!s) return null
  try {
    const arr = JSON.parse(s)
    if (!Array.isArray(arr)) return null
    return arr
      .filter((x) => !!x && typeof x === 'object' && typeof (x as RegionalSummaryDTO).region === 'string')
      .map((x) => ({
        region: x.region,
        leads: Array.isArray(x.leads) ? x.leads.filter((l: unknown) => typeof l === 'string') : [],
        verdict: x.verdict ?? 'Normal',
        evidenceLeads: Array.isArray(x.evidenceLeads)
          ? x.evidenceLeads.filter((l: unknown) => typeof l === 'string')
          : [],
        note: x.note ?? '',
      }))
  } catch {
    return null
  }
}

function parseCrossCheck(s: string | null): CrossCheckDTO | null {
  if (!s) return null
  try {
    const obj = JSON.parse(s)
    if (!obj || typeof obj !== 'object' || !('regionalConsistency' in obj)) return null
    return {
      regionalConsistency: obj.regionalConsistency ?? 'Partial',
      discrepancies: Array.isArray(obj.discrepancies)
        ? obj.discrepancies.filter((d: unknown) => typeof d === 'string')
        : [],
      notes: typeof obj.notes === 'string' ? obj.notes : '',
    }
  } catch {
    return null
  }
}

export function serializeCase(
  c: EcgCase & {
    user?: Pick<User, 'doctorName' | 'hospitalName'>
    feedbacks?: DoctorFeedback[]
  },
  includeImage = false
): EcgCaseDTO & { imageBase64?: string; imageMimeType?: string } {
  const dto: EcgCaseDTO & { imageBase64?: string; imageMimeType?: string } = {
    id: c.id,
    caseNumber: c.caseNumber,
    patientName: c.patientName,
    patientAge: c.patientAge,
    patientGender: c.patientGender,
    patientId: c.patientId,
    bloodPressure: c.bloodPressure,
    clinicalNotes: c.clinicalNotes,
    status: c.status as EcgCaseDTO['status'],
    heartRate: c.heartRate,
    rhythm: c.rhythm,
    pWave: c.pWave,
    prInterval: c.prInterval,
    qrsDuration: c.qrsDuration,
    qtInterval: c.qtInterval,
    qtcInterval: c.qtcInterval,
    axis: c.axis,
    stSegment: c.stSegment,
    quality: c.quality,
    confidence: c.confidence,
    normality: c.normality,
    urgency: c.urgency,
    findings: parseJsonArray(c.findingsJson),
    conclusion: c.conclusion,
    recommendations: parseJsonArray(c.recommendationsJson),
    leadFindings: parseLeadFindings(c.leadFindingsJson),
    regionalSummary: parseRegionalSummary(c.regionalSummaryJson),
    crossCheck: parseCrossCheck(c.crossCheckJson),
    digitizedAt: c.digitizedAt ? c.digitizedAt.toISOString() : null,
    digitizerInfo: parseDigitizerInfo(c.digitizerInfo),
    hasSignals: !!c.signalsJson && c.signalsJson.length > 10,
    myFeedback: c.feedbacks && c.feedbacks.length > 0
      ? {
          verdict: c.feedbacks[0].verdict,
          correctNormality: c.feedbacks[0].correctNormality,
          correctUrgency: c.feedbacks[0].correctUrgency,
          comment: c.feedbacks[0].comment,
        }
      : null,
    error: c.error,
    doctorName: c.user?.doctorName ?? '',
    hospitalName: c.user?.hospitalName ?? '',
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
  if (includeImage) {
    dto.imageBase64 = c.imageBase64
    dto.imageMimeType = c.imageMimeType
  }
  return dto
}

/** Generate a unique sequential case number: ECG-2026-0001 */
export async function generateCaseNumber(): Promise<string> {
  const year = new Date().getFullYear()
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await db.ecgCase.count()
    const caseNumber = `ECG-${year}-${String(count + 1 + attempt).padStart(4, '0')}`
    const exists = await db.ecgCase.findUnique({ where: { caseNumber } })
    if (!exists) return caseNumber
  }
  // Final fallback with a timestamp
  return `ECG-${year}-${Date.now().toString().slice(-6)}`
}

/** Parse a data URL into base64 + mime with size limits */
export function parseImageDataUrl(dataUrl: string): { base64: string; mime: string } {
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/)
  if (!m) throw new Error('Unsupported image format (allowed: PNG, JPEG or WebP)')
  const mime = m[1] === 'image/jpg' ? 'image/jpeg' : m[1]
  const base64 = m[2]
  const sizeBytes = Math.floor((base64.length * 3) / 4)
  if (sizeBytes > 10 * 1024 * 1024) {
    throw new Error('Image is too large (maximum 10 MB)')
  }
  return { base64, mime }
}
