'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import {
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Database,
  Loader2,
  PlayCircle,
  RefreshCw,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface LearningStats {
  totalCases: number
  feedback: { agree: number; disagree: number; partial: number; total: number }
  learningSamples: { userCases: number; total: number; references: number }
  activeModel: {
    version: number
    architecture: string
    trainRecords: number
    sourceNote: string | null
    metrics: { valAccuracy?: number; macroF1?: number } | null
    createdAt: string
  } | null
  recentRuns: Array<{
    id: string
    status: string
    trigger: string
    samplesUsed: number
    referencesUsed: number
    metrics: { valAccuracy?: number; macroF1?: number } | null
    startedAt: string
    finishedAt: string | null
  }>
}

/** Dashboard card: self-learning status + trigger button. */
export function LearningCard() {
  const { toast } = useToast()
  const [stats, setStats] = useState<LearningStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [training, setTraining] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/learning')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setStats(json.stats as LearningStats)
    } catch {
      /* card stays silent on failure */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function triggerTraining() {
    setTraining(true)
    try {
      const res = await fetch('/api/learning', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to start learning run')
      toast({
        title: 'Self-learning started',
        description: 'The reader is retraining on all confirmed cases + reference data.',
      })
      // poll for completion after a delay (training takes a few minutes)
      setTimeout(load, 90_000)
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'destructive' })
    } finally {
      setTraining(false)
    }
  }

  if (loading) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-5">
          <Loader2 className="h-5 w-5 text-teal-600 animate-spin" />
        </CardContent>
      </Card>
    )
  }
  if (!stats) return null

  const m = stats.activeModel?.metrics
  const lastRun = stats.recentRuns[0]

  return (
    <Card className="border-teal-200 bg-gradient-to-br from-teal-50/50 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-extrabold flex items-center gap-2">
          <BrainCircuit className="h-4.5 w-4.5 text-teal-700" />
          Self-Learning Engine
          {stats.activeModel && (
            <span className="ms-auto text-[11px] font-bold text-teal-700 bg-teal-100 rounded-full px-2.5 py-0.5">
              Model v{stats.activeModel.version} active
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {/* stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Confirmed readings', value: stats.feedback.total, icon: CheckCircle2 },
            { label: 'Learning samples', value: stats.learningSamples.total, icon: Database },
            { label: 'Reference ECGs', value: stats.learningSamples.references, icon: Database },
            { label: 'Trained on', value: stats.activeModel?.trainRecords ?? 0, icon: TrendingUp },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl bg-white border border-teal-100 px-3 py-2">
              <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
                <Icon className="h-3 w-3 text-teal-500" />
                {label}
              </div>
              <div className="text-lg font-extrabold text-teal-800 tabular-nums">{value}</div>
            </div>
          ))}
        </div>

        {/* model metrics */}
        {m && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
            <span>
              Validation accuracy:{' '}
              <b className="text-slate-800">
                {m.valAccuracy != null ? `${Math.round(m.valAccuracy * 100)}%` : '—'}
              </b>
            </span>
            <span>
              Macro F1:{' '}
              <b className="text-slate-800">{m.macroF1 != null ? m.macroF1.toFixed(3) : '—'}</b>
            </span>
            <span className="text-slate-400">{stats.activeModel?.architecture}</span>
          </div>
        )}

        {/* last run status */}
        {lastRun && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            {lastRun.status === 'succeeded' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : lastRun.status === 'running' ? (
              <Loader2 className="h-3.5 w-3.5 text-teal-500 animate-spin" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-red-500" />
            )}
            Last run: {lastRun.status} · {lastRun.samplesUsed} user + {lastRun.referencesUsed}{' '}
            reference samples
          </div>
        )}

        {/* actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={triggerTraining}
            disabled={training}
            className="font-bold bg-teal-700 hover:bg-teal-800"
          >
            {training ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
            )}
            Train Now
          </Button>
          <Button size="sm" variant="outline" onClick={load} className="font-bold">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed">
          Every physician-confirmed reading becomes a training label. Training combines your
          confirmed cases with the PTB-XL reference knowledge base and registers a new model
          version automatically.
        </p>

        {/* ---------------- verified data sources ---------------- */}
        <details className="group rounded-xl border border-teal-100 bg-white">
          <summary className="cursor-pointer select-none list-none px-3.5 py-2.5 flex items-center gap-2 text-[11px] font-bold text-teal-800">
            <BookOpen className="h-3.5 w-3.5 text-teal-600" />
            Verified Data Sources &amp; Citations
            <span className="ms-auto text-[10px] font-medium text-slate-400 group-open:hidden">
              show
            </span>
            <span className="ms-auto hidden text-[10px] font-medium text-slate-400 group-open:inline">
              hide
            </span>
          </summary>
          <div className="px-3.5 pb-3 pt-0.5 space-y-2 border-t border-teal-50">
            {[
              {
                name: 'PTB-XL v1.0.3',
                url: 'https://physionet.org/content/ptb-xl/',
                citation:
                  'Wagner P, Strodthoff N, Bousseljot R-D, Samek W, Schaeffter T. PTB-XL, a large publicly available electrocardiography dataset (version 1.0.3). PhysioNet 2022. doi:10.13026/kfzx-aw45',
                usage:
                  '21,799 clinical 12-lead ECGs · SCP-ECG statements · superclass benchmark (NORM/MI/STTC/CD/HYP)',
                badge: '30 reference signals',
              },
              {
                name: 'MIT-BIH Arrhythmia Database v1.0.0',
                url: 'https://physionet.org/content/mitdb/',
                citation:
                  'Moody GB, Mark RG. MIT-BIH Arrhythmia Database (version 1.0.0). PhysioNet 2005. doi:10.13026/C2F305',
                usage:
                  '48 half-hour two-channel ECGs · ~110,000 beat annotations · rhythm references (AFIB, AFL, VT, IVR, SVTA, 2AVB)',
                badge: '6 reference signals',
              },
              {
                name: 'China Physiological Signal Challenge 2021',
                url: 'https://physionet.org/content/cpsc2021/',
                citation:
                  'Wang X, Ma C, Zhang X, Gao H, Clifford GD, Liu C. Paroxysmal Atrial Fibrillation Events Detection from Dynamic ECG Recordings: The 4th China Physiological Signal Challenge 2021 (version 1.0.0). PhysioNet 2021. doi:10.13026/ksya-qw89',
                usage: 'Dynamic 2-lead wearable ECG for paroxysmal AF (PAF) detection',
                badge: '4 reference signals',
              },
              {
                name: 'CPSC 2018 · via PhysioNet/CinC Challenge 2020',
                url: 'https://physionet.org/content/challenge-2020/',
                citation:
                  'Perez Alday EA, Gu A, Shah A, Liu C, Sharma A, Seyedi S, Bahrami Rad A, Reyna M, Clifford G. Classification of 12-lead ECGs: The PhysioNet/Computing in Cardiology Challenge 2020 (version 1.0.2). PhysioNet 2022. doi:10.13026/dvyd-kd57',
                usage:
                  'CPSC2018 12-lead 500 Hz training set (Normal/AF/Other/Noisy) — credentialed access required, cited as benchmark',
                badge: 'cited',
              },
              {
                name: 'MIMIC-IV-ECG v1.0',
                url: 'https://physionet.org/content/mimic-iv-ecg/',
                citation:
                  'Gow B, Pollard T, Nathanson LA, et al. MIMIC-IV-ECG: Diagnostic Electrocardiogram Matched Subset (version 1.0). PhysioNet 2023. doi:10.13026/4nqg-sb35',
                usage:
                  '~800,000 diagnostic 12-lead ECGs from ~160,000 patients, matched to MIMIIC-IV clinical records',
                badge: 'cited',
              },
              {
                name: 'PhysioNet/CinC Challenge 2021 — Will Two Do?',
                url: 'https://physionet.org/content/challenge-2021/',
                citation:
                  'Reyna M, Sadr N, Gu A, Perez Alday EA, Liu C, Seyedi S, Shah A, Clifford G. Will Two Do? Varying Dimensions in Electrocardiography: The PhysioNet/Computing in Cardiology Challenge 2021 (version 1.0.3). PhysioNet 2022. doi:10.13026/34va-7q14',
                usage:
                  '88,000+ ECGs from 4 countries · multi-lead (2/3/6/12) 30-class scoring — the architectural benchmark',
                badge: 'benchmark',
              },
            ].map((s) => (
              <div key={s.name} className="rounded-lg bg-slate-50/70 border border-slate-100 p-2.5">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-extrabold text-teal-700 hover:underline leading-tight"
                  >
                    {s.name}
                  </a>
                  <span className="shrink-0 text-[9px] font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                    {s.badge}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed mb-1">{s.usage}</p>
                <p className="text-[9.5px] text-slate-400 leading-relaxed italic">{s.citation}</p>
              </div>
            ))}
            <p className="text-[9.5px] text-slate-400 leading-relaxed pt-0.5">
              Platform citation — Pollard T, Moody BE, Lehman L, et al. PhysioNet as a global
              platform for biomedical research. Nat Health 2026;1(8):792-5. doi:10.1038/s44360-026-00096-z
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
