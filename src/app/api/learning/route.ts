import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Self-learning telemetry (internal).
 *
 * Learning itself is fully automatic and needs no UI or triggers: every
 * completed analysis and every physician feedback is stored as a learning
 * sample, and the analyzer consumes them (plus the reference library) when
 * reading new cases — see src/lib/ecg-knowledge.ts. This endpoint only
 * reports what the engine has accumulated, for the case detail page.
 */
export async function GET() {
  const [samples, refCount, lastRuns] = await Promise.all([
    db.learningSample.count(),
    db.referenceEcg.count(),
    db.learningRun.findMany({ orderBy: { startedAt: 'desc' }, take: 3 }),
  ])

  return NextResponse.json({
    stats: {
      learningSamples: { total: samples, references: refCount },
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
