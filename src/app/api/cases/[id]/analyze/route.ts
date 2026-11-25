import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUserFromRequest } from '@/lib/auth'
import { serializeCase } from '@/lib/cases'
import { analyzeEcgImage, NotAnEcgError } from '@/lib/ecg-analysis'

export const maxDuration = 300

/** Re-run analysis on an existing case */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const c = await db.ecgCase.findFirst({
    where: { id, userId: user.id },
    include: { user: { select: { doctorName: true, hospitalName: true } }, feedbacks: { where: { userId: user.id } } },
  })
  if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  await db.ecgCase.update({
    where: { id },
    data: { status: 'analyzing', error: null },
  })

  try {
    const result = await analyzeEcgImage({
      imageDataUrl: `data:${c.imageMimeType};base64,${c.imageBase64}`,
      patientAge: c.patientAge,
      patientGender: c.patientGender,
      clinicalNotes: c.clinicalNotes,
      bloodPressure: c.bloodPressure,
    })

    const updated = await db.ecgCase.update({
      where: { id },
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

    return NextResponse.json({ case: serializeCase(updated, false) })
  } catch (e) {
    const message =
      e instanceof NotAnEcgError
        ? `Image rejected: ${e.reason}`
        : (e as Error)?.message || 'ECG analysis failed'
    console.error('re-analysis failed:', message)

    const failed = await db.ecgCase.update({
      where: { id },
      data: { status: 'failed', error: message },
      include: { user: { select: { doctorName: true, hospitalName: true } }, feedbacks: { where: { userId: user.id } } },
    })

    return NextResponse.json({ case: serializeCase(failed, false), error: message })
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
