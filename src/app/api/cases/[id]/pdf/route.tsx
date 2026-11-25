import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { db } from '@/lib/db'
import { getSessionUserFromRequest } from '@/lib/auth'
import { EcgReportDocument } from '@/lib/pdf-report'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const c = await db.ecgCase.findFirst({
    where: { id, userId: user.id },
    include: { user: { select: { doctorName: true, hospitalName: true, specialty: true } } },
  })
  if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  if (c.status !== 'completed') {
    return NextResponse.json({ error: 'The report cannot be downloaded before the analysis completes' }, { status: 409 })
  }

  let findings: string[] = []
  let recommendations: string[] = []
  let leadFindings: Array<{
    lead: string
    scpCode?: string | null
    finding: string
    severity: string
  }> = []
  let regionalSummary: Array<{
    region: string
    leads: string[]
    verdict: string
    evidenceLeads: string[]
    note: string
  }> = []
  let crossCheck: {
    regionalConsistency: string
    discrepancies: string[]
    notes: string
  } | null = null
  try {
    const f = JSON.parse(c.findingsJson || '[]')
    if (Array.isArray(f)) findings = f.filter((x) => typeof x === 'string')
  } catch {
    /* ignore */
  }
  try {
    const r = JSON.parse(c.recommendationsJson || '[]')
    if (Array.isArray(r)) recommendations = r.filter((x) => typeof x === 'string')
  } catch {
    /* ignore */
  }
  try {
    const lf = JSON.parse(c.leadFindingsJson || '[]')
    if (Array.isArray(lf)) leadFindings = lf.filter((x) => x && typeof x === 'object' && typeof x.lead === 'string')
  } catch {
    /* ignore */
  }
  try {
    const rs = JSON.parse(c.regionalSummaryJson || '[]')
    if (Array.isArray(rs)) regionalSummary = rs.filter((x) => x && typeof x === 'object' && typeof x.region === 'string')
  } catch {
    /* ignore */
  }
  try {
    const cc = JSON.parse(c.crossCheckJson || 'null')
    if (cc && typeof cc === 'object' && 'regionalConsistency' in cc) crossCheck = cc
  } catch {
    /* ignore */
  }

  const buffer = await renderToBuffer(
    <EcgReportDocument
      data={{
        caseNumber: c.caseNumber,
        createdAt: c.createdAt.toISOString(),
        patient: {
          name: c.patientName,
          age: c.patientAge,
          gender: c.patientGender,
          patientId: c.patientId,
          bloodPressure: c.bloodPressure,
          clinicalNotes: c.clinicalNotes,
        },
        doctor: {
          name: c.user.doctorName,
          hospital: c.user.hospitalName,
          specialty: c.user.specialty,
        },
        analysis: {
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
          findings,
          conclusion: c.conclusion,
          recommendations,
          leadFindings,
          regionalSummary,
          crossCheck,
        },
        imageBase64: c.imageBase64,
        imageMimeType: c.imageMimeType,
      }}
    />
  )

  const fileName = `AIECG-Report-${c.caseNumber}.pdf`
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
    },
  })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
