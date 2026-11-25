'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { AppView, AuthUser, EcgCaseDTO } from '@/types/ecg'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  FolderOpen,
  Loader2,
  Stethoscope,
} from 'lucide-react'
import { NormalityBadge, formatDateShort } from './ecg-visuals'
import { LearningCard } from './learning-card'
import { cn } from '@/lib/utils'

export function Dashboard({
  user,
  onNavigate,
  onOpenCase,
}: {
  user: AuthUser
  onNavigate: (v: AppView) => void
  onOpenCase: (id: string) => void
}) {
  const [cases, setCases] = useState<EcgCaseDTO[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/cases')
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!cancelled) setCases(data.cases as EcgCaseDTO[])
      } catch {
        if (!cancelled) setCases([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const list = cases ?? []
    return {
      total: list.length,
      completed: list.filter((c) => c.status === 'completed').length,
      abnormal: list.filter((c) => c.normality === 'Abnormal').length,
      analyzing: list.filter((c) => c.status === 'analyzing').length,
      normal: list.filter((c) => c.normality === 'Normal').length,
      borderline: list.filter((c) => c.normality === 'Borderline').length,
      urgent: list.filter((c) => c.urgency === 'Urgent' || c.urgency === 'Emergency').length,
    }
  }, [cases])

  const recent = useMemo(() => (cases ?? []).slice(0, 6), [cases])

  const statCards = [
    {
      label: 'Total Cases',
      value: stats.total,
      icon: Stethoscope,
      tone: 'bg-teal-50 text-teal-700 border-teal-100',
    },
    {
      label: 'Completed Reports',
      value: stats.completed,
      icon: CheckCircle2,
      tone: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
    {
      label: 'Abnormal Results',
      value: stats.abnormal,
      icon: AlertTriangle,
      tone: 'bg-red-50 text-red-600 border-red-100',
    },
    {
      label: 'Analyzing',
      value: stats.analyzing,
      icon: Loader2,
      tone: 'bg-amber-50 text-amber-600 border-amber-100',
    },
  ]

  const normalityBars = [
    { label: 'Normal', count: stats.normal, color: 'bg-emerald-500' },
    { label: 'Borderline', count: stats.borderline, color: 'bg-amber-500' },
    { label: 'Abnormal', count: stats.abnormal, color: 'bg-red-500' },
  ]

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Welcome */}
      <Card className="overflow-hidden border-teal-100 bg-gradient-to-r from-teal-800 to-teal-700 text-white">
        <CardContent className="p-6 md:p-7 relative">
          <div className="absolute inset-0 ecg-paper-dark opacity-40" aria-hidden="true" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl md:text-2xl font-extrabold">
                Welcome, Dr. {user.doctorName}
              </h2>
              <p className="mt-1 text-teal-100/90 text-sm">
                {user.hospitalName}
                {user.specialty ? ` — ${user.specialty}` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => onNavigate('new')}
                className="font-bold bg-white text-teal-800 hover:bg-teal-50"
              >
                <FilePlus2 className="mr-1.5 h-4 w-4" />
                Upload New Case
              </Button>
              <Button
                variant="outline"
                onClick={() => onNavigate('cases')}
                className="font-bold bg-white/15 border-white/60 text-white hover:bg-white/25 hover:text-white"
              >
                <FolderOpen className="mr-1.5 h-4 w-4" />
                Archive
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Self-learning engine */}
      <LearningCard />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="border-slate-200 hover:shadow-md transition-shadow">
            <CardContent className="p-4 md:p-5">
              <div className={cn('inline-flex h-10 w-10 items-center justify-center rounded-xl border mb-3', s.tone)}>
                <s.icon className="h-5 w-5" />
              </div>
              <div className="text-2xl md:text-3xl font-extrabold text-slate-900 tabular-nums">
                {loading ? <Skeleton className="h-8 w-12" /> : s.value}
              </div>
              <div className="text-xs md:text-sm text-slate-500 mt-0.5">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Recent cases */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-extrabold flex items-center gap-2">
              <Activity className="h-4.5 w-4.5 text-teal-700" />
              Latest Cases
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="px-6 pb-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : recent.length === 0 ? (
              <div className="px-6 pb-8 pt-2 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 border border-teal-100">
                  <FilePlus2 className="h-7 w-7 text-teal-700" />
                </div>
                <p className="font-bold text-slate-700">No cases yet</p>
                <p className="text-sm text-slate-500 mt-1 mb-4">
                  Start by uploading your first patient ECG — the report will be ready within a minute
                </p>
                <Button onClick={() => onNavigate('new')} className="font-bold bg-teal-700 hover:bg-teal-800">
                  Upload the first case
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto nice-scroll">
                {recent.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => onOpenCase(c.id)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-teal-50/50 transition-colors text-start"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-extrabold text-slate-600">
                        {c.patientAge}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-800 truncate">{c.patientName}</div>
                        <div className="text-xs text-slate-400 truncate tabular-nums">
                          {c.caseNumber} · {formatDateShort(c.createdAt)}
                        </div>
                      </div>
                      {c.status === 'analyzing' ? (
                        <Loader2 className="h-4 w-4 text-teal-600 animate-spin" />
                      ) : c.status === 'failed' ? (
                        <span className="text-xs font-bold text-red-600">Failed</span>
                      ) : (
                        <NormalityBadge normality={c.normality} />
                      )}
                      <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Result distribution */}
        <div className="space-y-6">
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-extrabold">Result Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {normalityBars.map((b) => {
                const pct = stats.total > 0 ? Math.round((b.count / stats.total) * 100) : 0
                return (
                  <div key={b.label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-bold text-slate-700">{b.label}</span>
                      <span className="text-slate-500 tabular-nums">
                        {b.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-700', b.color)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              {stats.urgent > 0 && (
                <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700 font-bold flex items-center gap-2">
                  <AlertTriangle className="h-4.5 w-4.5" />
                  {stats.urgent} case(s) requiring urgent follow-up
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-teal-50/50">
            <CardContent className="p-5 text-sm text-teal-900 leading-relaxed">
              <p className="font-extrabold mb-1.5">Professional reminder</p>
              <p className="text-teal-800/90">
                AIECG reports are decision-support tools that speed up initial triage; the
                diagnostic and treatment decision remains with the treating physician after
                reviewing the original image.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
