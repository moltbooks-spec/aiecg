import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUserFromRequest } from '@/lib/auth'
import { upsertLearningSample } from '@/lib/digitize'

// ---------------- POST: submit physician feedback on a reading ----------------
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const c = await db.ecgCase.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true, normality: true, urgency: true },
  })
  if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  if (c.status !== 'completed') {
    return NextResponse.json({ error: 'Feedback is only available for completed analyses' }, { status: 409 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const schema = z.object({
    verdict: z.enum(['agree', 'disagree', 'partial']),
    correctNormality: z.enum(['Normal', 'Borderline', 'Abnormal']).optional().nullable(),
    correctUrgency: z.enum(['Routine', 'Urgent', 'Emergency']).optional().nullable(),
    comment: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid feedback' }, { status: 400 })
  }
  const f = parsed.data

  const saved = await db.doctorFeedback.upsert({
    where: { caseId_userId: { caseId: id, userId: user.id } },
    create: {
      caseId: id,
      userId: user.id,
      verdict: f.verdict,
      correctNormality: f.correctNormality ?? null,
      correctUrgency: f.correctUrgency ?? null,
      comment: f.comment || null,
    },
    update: {
      verdict: f.verdict,
      correctNormality: f.correctNormality ?? null,
      correctUrgency: f.correctUrgency ?? null,
      comment: f.comment || null,
    },
  })

  // The physician's ground truth becomes a training label (self-learning):
  // - agree -> the reading's own normality is the label
  // - disagree/partial -> their corrected normality is the label
  const label =
    f.verdict === 'agree'
      ? (c.normality ?? 'Normal')
      : (f.correctNormality ?? c.normality ?? 'Normal')

  let learningSampleCreated = false
  try {
    await upsertLearningSample(id, label, {
      verdict: f.verdict,
      aiNormality: c.normality ?? null,
      aiUrgency: c.urgency ?? null,
      doctorComment: f.comment || null,
    })
    learningSampleCreated = true
  } catch {
    /* digitization may not exist for this case — sample skipped */
  }

  return NextResponse.json({ feedback: saved, learningSampleCreated })
}

// ---------------- GET: current user's feedback for this case ----------------
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const fb = await db.doctorFeedback.findUnique({
    where: { caseId_userId: { caseId: id, userId: user.id } },
  })
  return NextResponse.json({ feedback: fb })
}
