'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import type { EcgCaseDTO } from '@/types/ecg'
import {
  Activity,
  BadgeCheck,
  BrainCircuit,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Send,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/** Card where the physician confirms or corrects the AI reading (feeds self-learning). */
export function FeedbackCard({
  data,
  onSaved,
}: {
  data: EcgCaseDTO
  onSaved?: (fb: EcgCaseDTO['myFeedback']) => void
}) {
  const { toast } = useToast()
  const existing = data.myFeedback
  const [verdict, setVerdict] = useState<string>(existing?.verdict ?? '')
  const [correctNormality, setCorrectNormality] = useState<string>(
    existing?.correctNormality ?? ''
  )
  const [correctUrgency, setCorrectUrgency] = useState<string>(existing?.correctUrgency ?? '')
  const [comment, setComment] = useState<string>(existing?.comment ?? '')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!verdict) {
      toast({ title: 'Select your verdict first', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/cases/${data.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verdict,
          correctNormality: correctNormality || null,
          correctUrgency: correctUrgency || null,
          comment,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to save feedback')
      toast({
        title: 'Feedback saved',
        description: body.learningSampleCreated
          ? 'Your reading label was added to the self-learning dataset.'
          : 'Saved. (No digitized signal on this case — learning sample skipped.)',
      })
      onSaved?.({
        verdict,
        correctNormality: correctNormality || null,
        correctUrgency: correctUrgency || null,
        comment: comment || null,
      })
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const verdicts: Array<{ v: string; label: string; icon: typeof ThumbsUp; tone: string }> = [
    { v: 'agree', label: 'Agree with reading', icon: ThumbsUp, tone: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
    { v: 'partial', label: 'Partially correct', icon: MessageSquare, tone: 'border-amber-500 bg-amber-50 text-amber-800' },
    { v: 'disagree', label: 'Disagree', icon: ThumbsDown, tone: 'border-red-500 bg-red-50 text-red-800' },
  ]

  return (
    <Card className="border-teal-200 bg-gradient-to-br from-teal-50/60 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-extrabold flex items-center gap-2">
          <BadgeCheck className="h-4.5 w-4.5 text-teal-700" />
          Your Expert Opinion — Improve the Reader
          {existing && (
            <span className="ms-auto text-[11px] font-medium text-teal-600">submitted</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          Confirming or correcting this reading adds a physician-verified training label to the
          database. The model retrains automatically on confirmed cases (self-learning loop).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {verdicts.map(({ v, label, icon: Icon, tone }) => (
            <button
              key={v}
              onClick={() => setVerdict(v)}
              className={cn(
                'flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-xs font-bold transition-all text-start',
                verdict === v ? tone : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {verdict !== '' && verdict !== 'agree' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1.5">
                Correct normality (your ground truth)
              </label>
              <div className="flex gap-1.5">
                {['Normal', 'Borderline', 'Abnormal'].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCorrectNormality(n)}
                    className={cn(
                      'flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold',
                      correctNormality === n
                        ? 'border-teal-600 bg-teal-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1.5">
                Correct urgency
              </label>
              <div className="flex gap-1.5">
                {['Routine', 'Urgent', 'Emergency'].map((u) => (
                  <button
                    key={u}
                    onClick={() => setCorrectUrgency(u)}
                    className={cn(
                      'flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold',
                      correctUrgency === u
                        ? 'border-teal-600 bg-teal-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600'
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional comment (what the reader missed or got right — becomes part of the training context)"
          rows={2}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
        />

        <div className="flex items-center gap-2">
          <Button
            onClick={submit}
            disabled={saving || !verdict}
            className="font-bold bg-teal-700 hover:bg-teal-800"
          >
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            {existing ? 'Update Feedback' : 'Submit Feedback'}
          </Button>
          {existing && (
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Your feedback is in the learning dataset
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Renders the digitized per-lead signals as a mini waveform grid. */
export function DigitizedSignalsCard({ data }: { data: EcgCaseDTO }) {
  const info = data.digitizerInfo
  if (!data.hasSignals) {
    return info?.ok === false ? (
      <Card className="border-slate-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-2.5">
            <Activity className="h-4.5 w-4.5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-slate-700">Digitization unavailable</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {info.reason ?? 'The image could not be converted to digital signals.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    ) : null
  }

  const leadNames = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-extrabold flex items-center gap-2">
          <Activity className="h-4.5 w-4.5 text-teal-700" />
          Digitized Signals (stored in database)
          <span className="ms-auto text-[11px] font-medium text-slate-400">
            {info?.samplingHz ?? 100} Hz · {info?.durationS ?? '—'} s ·{' '}
            {Math.round((info?.gridConfidence ?? 0) * 100)}% grid confidence
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {leadNames.map((lead) => (
            <MiniWave key={lead} lead={lead} />
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-2.5 leading-relaxed">
          {info?.notes ?? ''} — these per-lead arrays feed the self-learning model when you confirm
          a reading.
        </p>
      </CardContent>
    </Card>
  )
}

/** Placeholder mini-wave visual (signals render server-side; client shows summary). */
function MiniWave({ lead }: { lead: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5 flex items-center gap-2">
      <BrainCircuit className="h-3 w-3 text-teal-600 shrink-0" />
      <span className="text-[11px] font-extrabold text-teal-800">{lead}</span>
      <svg viewBox="0 0 60 16" className="flex-1 h-4 w-full" preserveAspectRatio="none">
        <polyline
          points="0,8 6,8 9,7.5 12,8 15,2 18,13 21,8 28,8 31,7.5 34,8 37,3 40,12 43,8 52,8 55,7.5 60,8"
          fill="none"
          stroke="#0f766e"
          strokeWidth="1"
        />
      </svg>
    </div>
  )
}
