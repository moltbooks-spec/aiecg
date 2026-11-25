'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import type { EcgCaseDTO } from '@/types/ecg'
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  FileDown,
  Gauge,
  HeartPulse,
  LayoutGrid,
  Loader2,
  RotateCcw,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Waves,
  ZoomIn,
} from 'lucide-react'
import { NormalityBadge, UrgencyBadge, formatDate } from './ecg-visuals'
import { CaseChat } from './case-chat'
import { FeedbackCard, DigitizedSignalsCard } from './feedback-card'
import { cn } from '@/lib/utils'

export function CaseDetail({ caseId }: { caseId: string }) {
  const { toast } = useToast()
  const [data, setData] = useState<EcgCaseDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}`)
      if (res.status === 404) {
        setNotFound(true)
        return
      }
      if (!res.ok) throw new Error()
      const json = await res.json()
      setData(json.case as EcgCaseDTO)
    } catch {
      toast({ title: 'Could not load the case', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [caseId, toast])

  useEffect(() => {
    load()
  }, [load])

  // Light polling while the analysis is running
  useEffect(() => {
    if (!data || data.status !== 'analyzing') return
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/cases/${caseId}`)
        if (res.ok) {
          const json = await res.json()
          if (json.case?.status !== 'analyzing') {
            setData(json.case as EcgCaseDTO)
          }
        }
      } catch {
        /* ignore */
      }
    }, 5000)
    return () => clearInterval(iv)
  }, [data, caseId])

  async function reanalyze() {
    setReanalyzing(true)
    try {
      const res = await fetch(`/api/cases/${caseId}/analyze`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setData((prev) => ({ ...(prev ?? json.case), ...json.case } as EcgCaseDTO))
      if (json.case?.status === 'failed') {
        toast({ title: 'Analysis failed again', description: json.error, variant: 'destructive' })
      } else {
        toast({ title: 'New analysis completed', description: 'The report was refreshed with the latest reading' })
      }
    } catch (e) {
      toast({ title: 'Could not re-run the analysis', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setReanalyzing(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-14 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500 mb-3" />
          <p className="font-extrabold text-slate-800">Case not found</p>
          <p className="text-sm text-slate-500 mt-1">It may have been deleted or does not belong to your account</p>
        </CardContent>
      </Card>
    )
  }

  const imageUrl = data.imageBase64
    ? `data:${data.imageMimeType};base64,${data.imageBase64}`
    : null

  const isAnalyzing = data.status === 'analyzing'
  const isFailed = data.status === 'failed'
  const completed = data.status === 'completed'

  const params: Array<{ label: string; value: string | null; icon: typeof Activity }> = [
    { label: 'Heart Rate', value: data.heartRate != null ? `${data.heartRate} bpm` : null, icon: HeartPulse },
    { label: 'Cardiac Rhythm', value: data.rhythm, icon: Activity },
    { label: 'P Wave', value: data.pWave, icon: Waves },
    { label: 'PR Interval', value: data.prInterval, icon: Ruler },
    { label: 'QRS Duration', value: data.qrsDuration, icon: Ruler },
    { label: 'QT Interval', value: data.qtInterval, icon: Ruler },
    { label: 'QTc Interval', value: data.qtcInterval, icon: Ruler },
    { label: 'Electrical Axis', value: data.axis, icon: Gauge },
  ]

  const normalityTone =
    data.normality === 'Normal'
      ? 'border-emerald-200 bg-emerald-50/60'
      : data.normality === 'Borderline'
      ? 'border-amber-200 bg-amber-50/60'
      : data.normality === 'Abnormal'
      ? 'border-red-200 bg-red-50/60'
      : 'border-slate-200 bg-slate-50/60'

  return (
    <div className="space-y-5 animate-fade-up">
      {/* ---------- Header ---------- */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl md:text-2xl font-extrabold text-slate-900">
              {data.patientName}
            </h2>
            {completed && <NormalityBadge normality={data.normality} className="text-sm px-3 py-1" />}
            {completed && data.urgency !== 'Routine' && <UrgencyBadge urgency={data.urgency} />}
          </div>
          <p className="text-sm text-slate-500 mt-1 tabular-nums">
            {data.caseNumber} · {formatDate(data.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {completed && (
            <Button asChild className="font-bold bg-teal-700 hover:bg-teal-800">
              <a href={`/api/cases/${data.id}/pdf`} download>
                <FileDown className="mr-1.5 h-4 w-4" />
                Download PDF Report
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            onClick={reanalyze}
            disabled={reanalyzing || isAnalyzing}
            className="font-bold"
          >
            {reanalyzing || isAnalyzing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-4 w-4" />
            )}
            Re-analyze
          </Button>
        </div>
      </div>

      {/* ---------- Analyzing state ---------- */}
      {isAnalyzing && (
        <Card className="border-teal-200">
          <CardContent className="p-8 text-center">
            <Loader2 className="mx-auto h-9 w-9 text-teal-600 animate-spin mb-3" />
            <p className="font-extrabold text-slate-800">AI is reading the ECG…</p>
            <p className="text-sm text-slate-500 mt-1">
              The report will update automatically once the analysis completes
            </p>
          </CardContent>
        </Card>
      )}

      {/* ---------- Failed state ---------- */}
      {isFailed && (
        <Card className="border-red-200 bg-red-50/60">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-red-800">The report could not be issued</p>
                <p className="text-sm text-red-700 mt-1 leading-relaxed">{data.error}</p>
                <p className="text-xs text-red-600/80 mt-2">
                  You can try again — if it keeps failing, replace the image with a clearer one.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {completed && (
        <>
          {/* ---------- Patient card ---------- */}
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 border border-teal-100 text-teal-700">
                  <UserRound className="h-4.5 w-4.5" />
                </div>
                <h3 className="font-extrabold text-slate-900">Case Data</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                {[
                  ['Age', `${data.patientAge} years`],
                  ['Gender', data.patientGender],
                  ['Patient ID', data.patientId || '—'],
                  ['Blood Pressure', data.bloodPressure || '—'],
                  ['Attending Physician', `Dr. ${data.doctorName}`],
                  ['Hospital', data.hospitalName],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
                    <div className="text-[11px] text-slate-400">{l}</div>
                    <div className="font-bold text-slate-800 mt-0.5 truncate" title={v}>{v}</div>
                  </div>
                ))}
              </div>
              {data.clinicalNotes && (
                <div className="mt-4 rounded-xl bg-teal-50/60 border border-teal-100 px-4 py-3">
                  <div className="text-[11px] font-bold text-teal-700 mb-1">Clinical Notes</div>
                  <p className="text-sm text-slate-700 leading-relaxed">{data.clinicalNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---------- ECG image ---------- */}
          {imageUrl && (
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-extrabold flex items-center gap-2">
                  <Waves className="h-4.5 w-4.5 text-teal-700" />
                  Uploaded ECG Image
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="relative group w-full rounded-xl overflow-hidden border border-slate-200 bg-white ecg-paper/30">
                      <img
                        src={imageUrl}
                        alt={`ECG for patient ${data.patientName}`}
                        className="w-full max-h-[420px] object-contain"
                      />
                      <span className="absolute top-2 end-2 rounded-lg bg-slate-900/70 text-white p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ZoomIn className="h-4 w-4" />
                      </span>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl p-3">
                    <img src={imageUrl} alt="Zoomed ECG image" className="w-full object-contain" />
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          )}

          {/* ---------- Measured parameters ---------- */}
          <div>
            <h3 className="font-extrabold text-slate-900 mb-3 flex items-center gap-2">
              <span className="h-5 w-1.5 rounded-full bg-teal-700 inline-block" />
              Measured Parameters
            </h3>

            {/* ---------- Per-lead readings grid ---------- */}
            {data.leadFindings && data.leadFindings.length > 0 && (
              <Card className="border-slate-200 mb-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-extrabold flex items-center gap-2">
                    <LayoutGrid className="h-4.5 w-4.5 text-teal-700" />
                    Per-Lead Readings
                    <span className="ms-auto text-[11px] font-medium text-slate-400">
                      SCP-ECG codes per PTB-XL (PhysioNet)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {data.leadFindings.map((lf) => (
                      <div
                        key={lf.lead}
                        className={cn(
                          'rounded-xl border px-3.5 py-2.5',
                          lf.severity === 'Abnormal'
                            ? 'border-red-200 bg-red-50/50'
                            : lf.severity === 'Borderline'
                            ? 'border-amber-200 bg-amber-50/50'
                            : 'border-slate-200 bg-slate-50/60'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-extrabold text-teal-800 text-sm">{lf.lead}</span>
                          <span
                            className={cn(
                              'text-[10px] font-extrabold rounded-full px-2 py-0.5',
                              lf.severity === 'Abnormal'
                                ? 'bg-red-600 text-white'
                                : lf.severity === 'Borderline'
                                ? 'bg-amber-500 text-white'
                                : 'bg-emerald-100 text-emerald-700'
                            )}
                          >
                            {lf.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{lf.finding}</p>
                        {lf.scpCode && (
                          <p className="text-[10px] text-slate-400 mt-1 tabular-nums">
                            SCP: {lf.scpCode}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ---------- Regional wall summary ---------- */}
            {data.regionalSummary && data.regionalSummary.length > 0 && (
              <Card className="border-slate-200 mb-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-extrabold flex items-center gap-2">
                    <Gauge className="h-4.5 w-4.5 text-teal-700" />
                    Regional Wall Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {data.regionalSummary.map((r) => (
                    <div
                      key={r.region}
                      className={cn(
                        'rounded-xl border px-3.5 py-2.5',
                        r.verdict === 'Abnormal'
                          ? 'border-red-200 bg-red-50/50'
                          : r.verdict === 'Suggestive'
                          ? 'border-amber-200 bg-amber-50/50'
                          : 'border-slate-200 bg-slate-50/60'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-slate-800 text-xs">{r.region}</span>
                        <span
                          className={cn(
                            'text-[10px] font-extrabold rounded-full px-2 py-0.5',
                            r.verdict === 'Abnormal'
                              ? 'bg-red-600 text-white'
                              : r.verdict === 'Suggestive'
                              ? 'bg-amber-500 text-white'
                              : 'bg-slate-200 text-slate-600'
                          )}
                        >
                          {r.verdict}
                        </span>
                      </div>
                      {r.leads.length > 0 && (
                        <p className="text-[10px] text-slate-400 mb-1">{r.leads.join(' · ')}</p>
                      )}
                      <p className="text-xs text-slate-600 leading-relaxed">{r.note}</p>
                      {r.evidenceLeads.length > 0 && (
                        <p className="text-[10px] text-teal-700 font-bold mt-1">
                          Evidence: {r.evidenceLeads.join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ---------- Cross-check card ---------- */}
            {data.crossCheck && (
              <Card
                className={cn(
                  'mb-3',
                  data.crossCheck.regionalConsistency === 'Consistent'
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : data.crossCheck.regionalConsistency === 'Partial'
                    ? 'border-amber-200 bg-amber-50/40'
                    : 'border-red-200 bg-red-50/40'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {data.crossCheck.regionalConsistency === 'Consistent' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <ShieldCheck className="h-5 w-5 text-amber-600" />
                    )}
                    <p className="font-extrabold text-slate-800 text-sm">
                      Regional Consistency Cross-Check:{' '}
                      <span
                        className={cn(
                          data.crossCheck.regionalConsistency === 'Consistent'
                            ? 'text-emerald-700'
                            : data.crossCheck.regionalConsistency === 'Partial'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        )}
                      >
                        {data.crossCheck.regionalConsistency}
                      </span>
                    </p>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mb-2">
                    {data.crossCheck.notes}
                  </p>
                  {data.crossCheck.discrepancies.length > 0 && (
                    <ul className="space-y-1.5">
                      {data.crossCheck.discrepancies.map((d, i) => (
                        <li key={i} className="flex gap-2 text-xs text-slate-700 leading-relaxed">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[10px] text-slate-400 mt-2">
                    Automated verification against PTB-XL regional criteria (reciprocal patterns,
                    posterior mirror, aVR left-main pattern)
                  </p>
                </CardContent>
              </Card>
            )}

            {/* ---------- Digitized signals (from database) ---------- */}
            <DigitizedSignalsCard data={data} />

            {/* ---------- Physician feedback (self-learning label) ---------- */}
            <FeedbackCard
              data={data}
              onSaved={(fb) => setData((d) => (d ? { ...d, myFeedback: fb } : d))}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {params.map((p) => (
                <Card key={p.label} className="border-slate-200">
                  <CardContent className="p-3.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1.5">
                      <p.icon className="h-3.5 w-3.5 text-teal-600" />
                      {p.label}
                    </div>
                    <div
                      className={cn(
                        'font-extrabold leading-snug',
                        p.value ? 'text-slate-800 text-sm' : 'text-slate-300 text-base'
                      )}
                    >
                      {p.value || '—'}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* ---------- Conclusion ---------- */}
          <div className={cn('rounded-2xl border-2 p-5 md:p-6', normalityTone)}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h3 className="font-extrabold text-lg text-slate-900 flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-teal-700" />
                Reading Conclusion
              </h3>
              <div className="flex gap-2">
                <NormalityBadge normality={data.normality} />
                <UrgencyBadge urgency={data.urgency} />
              </div>
            </div>
            <p className="text-slate-800 leading-relaxed">{data.conclusion || '—'}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/80 border border-slate-200 px-3 py-1 font-bold text-slate-600">
                Reading confidence: {data.confidence || '—'}
              </span>
              <span className="rounded-full bg-white/80 border border-slate-200 px-3 py-1 font-bold text-slate-600">
                Recording quality: {data.quality || '—'}
              </span>
            </div>
          </div>

          {/* ---------- Findings & recommendations ---------- */}
          <div className="grid gap-5 lg:grid-cols-2">
            {data.findings && data.findings.length > 0 && (
              <Card className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-extrabold flex items-center gap-2">
                    <Activity className="h-4.5 w-4.5 text-teal-700" />
                    Detailed Findings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.findings.map((f, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white text-xs font-extrabold tabular-nums">
                        {i + 1}
                      </span>
                      <p className="text-sm text-slate-700 leading-relaxed">{f}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {data.recommendations && data.recommendations.length > 0 && (
              <Card className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-extrabold flex items-center gap-2">
                    <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
                    Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.recommendations.map((r, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-extrabold tabular-nums">
                        {i + 1}
                      </span>
                      <p className="text-sm text-slate-700 leading-relaxed">{r}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ST assessment */}
          {data.stSegment && (
            <Card className="border-slate-200">
              <CardContent className="p-5">
                <h3 className="font-extrabold text-slate-900 mb-2 flex items-center gap-2 text-sm">
                  <HeartPulse className="h-4.5 w-4.5 text-teal-700" />
                  ST Segment & T Wave Assessment
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">{data.stSegment}</p>
              </CardContent>
            </Card>
          )}

          {/* ---------- AI chat about this case ---------- */}
          <CaseChat caseId={data.id} disabled={!completed} />

          {/* Disclaimer */}
          <p className="text-xs text-slate-400 text-center leading-relaxed px-6">
            Report generated with AI assistance via the AIECG platform — a decision-support tool
            for physicians that does not replace direct clinical evaluation or the treating
            physician's judgment.
          </p>
        </>
      )}
    </div>
  )
}
