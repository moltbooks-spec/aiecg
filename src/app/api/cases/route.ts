import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUserFromRequest } from '@/lib/auth'
import { generateCaseNumber, parseImageDataUrl, serializeCase } from '@/lib/cases'
import { analyzeEcgImage, NotAnEcgError } from '@/lib/ecg-analysis'
import { digitizeCase } from '@/lib/digitize'

export const maxDuration = 300

const createSchema = z.object({
  patientName: z.string().trim().min(2, 'Patient name is required').max(100),
  patientAge: z.coerce.number().int().min(0).max(130),
  patientGender: z.enum(['Male', 'Female']),
  patientId: z.string().trim().max(40).optional().or(z.literal('')),
  bloodPressure: z.string().trim().max(30).optional().or(z.literal('')),
  clinicalNotes: z.string().trim().max(2000).optional().or(z.literal('')),
  imageDataUrl: z.string().min(50, 'ECG image is required'),
})

// ---------------- GET: list user's cases ----------------
export async function GET(req: NextRequest) {
  const user = await getSessionUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cases = await db.ecgCase.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { doctorName: true, hospitalName: true } }, feedbacks: { where: { userId: user.id } } },
  })

  return NextResponse.json({ cases: cases.map((c) => serializeCase(c, false)) })
}

// ---------------- POST: create a case and analyze it ----------------
export async function POST(req: NextRequest) {
  const user = await getSessionUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || 'Incomplete data'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  const p = parsed.data

  let image: { base64: string; mime: string }
  try {
    image = parseImageDataUrl(p.imageDataUrl)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  const caseNumber = await generateCaseNumber()

  const created = await db.ecgCase.create({
    data: {
      caseNumber,
      userId: user.id,
      patientName: p.patientName,
      patientAge: p.patientAge,
      patientGender: p.patientGender,
      patientId: p.patientId && p.patientId !== '' ? p.patientId : null,
      bloodPressure: p.bloodPressure && p.bloodPressure !== '' ? p.bloodPressure : null,
      clinicalNotes: p.clinicalNotes && p.clinicalNotes !== '' ? p.clinicalNotes : null,
      imageBase64: image.base64,
      imageMimeType: image.mime,
      status: 'analyzing',
    },
    include: { user: { select: { doctorName: true, hospitalName: true } }, feedbacks: { where: { userId: user.id } } },
  })

  // ---- Run analysis immediately ----
  try {
    // 1) digitize the image to per-lead signals (stored on the case; feeds the
    //    self-learning pipeline once the physician confirms the reading)
    const digitizePromise = digitizeCase(created.id, p.imageDataUrl).catch(() => null)

    // 2) vision-model per-lead reading (knowledge injected from the DB)
    const result = await analyzeEcgImage({
      imageDataUrl: `data:${image.mime};base64,${image.base64}`,
      patientAge: p.patientAge,
      patientGender: p.patientGender,
      clinicalNotes: created.clinicalNotes,
      bloodPressure: created.bloodPressure,
    })

    // wait for digitization (max ~90s; failure does not block the reading)
    await digitizePromise

    const updated = await db.ecgCase.update({
      where: { id: created.id },
      data: {
        status: 'completed',
        error: null,
        heartRate: result.heartRate ?? null,
        rhythm: result.rhythm ?? null,
        pWave: result.pWave ?? null,
        prInterval: result.prInterval ?? null,
        qrsDuration: result.qrsDuration ?? null,
        qtInterval: result.qtInterval ?? null,
        qtcInterval: result.qtcInterval ?? null,
        axis: result.axis ?? null,
        stSegment: result.stSegment ?? null,
        quality: result.quality ?? null,
        confidence: result.confidence ?? null,
        normality: result.normality ?? null,
        urgency: result.urgency ?? null,
        findingsJson: JSON.stringify(result.findings ?? []),
        conclusion: result.conclusion ?? null,
        recommendationsJson: JSON.stringify(result.recommendations ?? []),
        leadFindingsJson: JSON.stringify(result.leadFindings ?? []),
        regionalSummaryJson: JSON.stringify(result.regionalSummary ?? []),
        crossCheckJson: JSON.stringify(result.crossCheck ?? null),
      },
      include: { user: { select: { doctorName: true, hospitalName: true } }, feedbacks: { where: { userId: user.id } } },
    })

    return NextResponse.json({ case: serializeCase(updated, false) }, { status: 201 })
  } catch (e) {
    const message =
      e instanceof NotAnEcgError
        ? `Image rejected: ${e.reason}`
        : (e as Error)?.message || 'ECG analysis failed'
    console.error('analysis failed:', message)

    const failed = await db.ecgCase.update({
      where: { id: created.id },
      data: { status: 'failed', error: message },
      include: { user: { select: { doctorName: true, hospitalName: true } }, feedbacks: { where: { userId: user.id } } },
    })

    return NextResponse.json(
      { case: serializeCase(failed, false), error: message },
      { status: 201 }
    )
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
