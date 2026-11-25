import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUserFromRequest } from '@/lib/auth'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

// ---------------- GET: self-learning statistics ----------------
export async function GET(req: NextRequest) {
  const user = await getSessionUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [totalCases, feedbackStats, samples, activeModel, lastRuns, refCount] = await Promise.all([
    db.ecgCase.count({ where: { status: 'completed' } }),
    db.doctorFeedback.groupBy({ by: ['verdict'], _count: { _all: true } }),
    db.learningSample.count(),
    db.modelVersion.findFirst({ where: { isActive: true }, orderBy: { version: 'desc' } }),
    db.learningRun.findMany({ orderBy: { startedAt: 'desc' }, take: 5 }),
    db.referenceEcg.count(),
  ])

  const userSamples = await db.learningSample.count({ where: { source: 'user_case' } })
  const agree = feedbackStats.find((f) => f.verdict === 'agree')?._count._all ?? 0
  const disagree = feedbackStats.find((f) => f.verdict === 'disagree')?._count._all ?? 0
  const partial = feedbackStats.find((f) => f.verdict === 'partial')?._count._all ?? 0

  return NextResponse.json({
    stats: {
      totalCases,
      feedback: { agree, disagree, partial, total: agree + disagree + partial },
      learningSamples: { userCases: userSamples, total: samples, references: refCount },
      activeModel: activeModel
        ? {
            version: activeModel.version,
            architecture: activeModel.architecture,
            trainRecords: activeModel.trainRecords,
            sourceNote: activeModel.sourceNote,
            metrics: activeModel.metricsJson ? JSON.parse(activeModel.metricsJson) : null,
            createdAt: activeModel.createdAt.toISOString(),
          }
        : null,
      recentRuns: lastRuns.map((r) => ({
        id: r.id,
        status: r.status,
        trigger: r.trigger,
        samplesUsed: r.samplesUsed,
        referencesUsed: r.referencesUsed,
        metrics: r.metricsJson ? JSON.parse(r.metricsJson) : null,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      })),
    },
  })
}

// ---------------- POST: trigger a self-learning training run ----------------
export async function POST(req: NextRequest) {
  const user = await getSessionUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // refuse if a run is already active
  const running = await db.learningRun.findFirst({ where: { status: 'running' } })
  if (running) {
    return NextResponse.json(
      { error: 'A learning run is already in progress', runId: running.id },
      { status: 409 }
    )
  }

  // count available samples first
  const [userSamples, refs] = await Promise.all([
    db.learningSample.count({ where: { source: 'user_case' } }),
    db.referenceEcg.count(),
  ])
  if (userSamples + refs < 4) {
    return NextResponse.json(
      { error: 'Not enough learning data yet (need at least 4 samples)' },
      { status: 400 }
    )
  }

  const run = await db.learningRun.create({
    data: { status: 'running', trigger: 'manual' },
  })

  // fire the Python trainer in the background; it updates LearningRun itself.
  // Only possible where a real interpreter is configured (this sandbox);
  // on serverless hosts (Vercel) training must run from the sandbox/CLI.
  const PYTHON = process.env.PYTHON_BIN
  if (!PYTHON || !existsSync(PYTHON)) {
    await db.learningRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        error: 'Self-training requires a Python runtime; trigger it from the sandbox/CLI host.',
      },
    })
    return NextResponse.json(
      { error: 'Self-training is not available on this hosting environment (no Python runtime).' },
      { status: 503 }
    )
  }
  const SCRIPT = path.join(process.cwd(), 'scripts', 'self-learn.py')
  const proc = spawn(PYTHON, ['-W', 'ignore', SCRIPT, '--epochs', '3', '--run-id', run.id], {
    cwd: process.cwd(),
    env: { ...process.env },
    detached: true,
    stdio: 'ignore',
  })
  proc.unref()

  return NextResponse.json({
    runId: run.id,
    started: true,
    message: 'Self-learning run started; poll GET /api/learning/stats for progress.',
  })
}
