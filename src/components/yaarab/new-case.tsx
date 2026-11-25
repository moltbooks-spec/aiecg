'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import type { AppView, EcgCaseDTO } from '@/types/ecg'
import {
  BrainCircuit,
  CheckCircle2,
  FileImage,
  ImageIcon,
  Lightbulb,
  Loader2,
  RotateCcw,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react'
import { EcgLine } from './ecg-visuals'
import { cn } from '@/lib/utils'

/** Downscale the image client-side before sending to keep the upload smooth */
async function downscaleImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  // Formats that can't be downscaled (e.g. small png) — return as-is if within size
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(dataUrl)) {
    throw new Error('Unsupported image format, use PNG, JPEG or WebP')
  }
  if (dataUrl.length < 8 * 1024 * 1024 && file.size < 4 * 1024 * 1024) return dataUrl

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = dataUrl
  })
  const maxSide = 1800
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.92)
}

const PROGRESS_STAGES = [
  { at: 8, text: 'Validating data and uploading the image...' },
  { at: 22, text: 'Checking image quality and verifying it is an ECG...' },
  { at: 42, text: 'Measuring rhythm, heart rate and intervals (PR, QRS, QT)...' },
  { at: 64, text: 'Assessing axis, ST segment and T waves...' },
  { at: 82, text: 'Composing the conclusion and recommendations...' },
  { at: 95, text: 'Saving the report to the case archive...' },
]

export function NewCase({
  onDone,
  onNavigate,
}: {
  onDone: (c: EcgCaseDTO) => void
  onNavigate: (v: AppView) => void
}) {
  const { toast } = useToast()

  const [patientName, setPatientName] = useState('')
  const [patientAge, setPatientAge] = useState('')
  const [patientGender, setPatientGender] = useState<string>('')
  const [patientId, setPatientId] = useState('')
  const [bloodPressure, setBloodPressure] = useState('')
  const [clinicalNotes, setClinicalNotes] = useState('')

  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageProcessing, setImageProcessing] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stageText, setStageText] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Animate the progress bar while the analysis runs
  useEffect(() => {
    if (!submitting) return
    const iv = setInterval(() => {
      setProgress((p) => {
        const next = p + (95 - p) * 0.035
        const stage = [...PROGRESS_STAGES].reverse().find((s) => next >= s.at)
        if (stage) setStageText(stage.text)
        return next
      })
    }, 900)
    return () => clearInterval(iv)
  }, [submitting])

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return
      if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
        toast({ title: 'Unsupported format', description: 'Allowed: PNG, JPEG or WebP', variant: 'destructive' })
        return
      }
      if (file.size > 15 * 1024 * 1024) {
        toast({ title: 'Image too large', description: 'Maximum size is 15 MB', variant: 'destructive' })
        return
      }
      setImageProcessing(true)
      try {
        const dataUrl = await downscaleImage(file)
        setImagePreview(dataUrl)
      } catch (e) {
        toast({ title: 'Could not read the image', description: (e as Error).message, variant: 'destructive' })
      } finally {
        setImageProcessing(false)
      }
    },
    [toast]
  )

  async function submit() {
    if (!patientName.trim() || patientName.trim().length < 2) {
      toast({ title: 'Patient name is required', variant: 'destructive' })
      return
    }
    const age = parseInt(patientAge, 10)
    if (Number.isNaN(age) || age < 0 || age > 130) {
      toast({ title: 'Enter a valid age (0-130)', variant: 'destructive' })
      return
    }
    if (!patientGender) {
      toast({ title: 'Select the patient gender', variant: 'destructive' })
      return
    }
    if (!imagePreview) {
      toast({ title: 'ECG image is required', description: 'Upload the ECG image first', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    setProgress(8)
    setStageText(PROGRESS_STAGES[0].text)

    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: patientName.trim(),
          patientAge: age,
          patientGender,
          patientId: patientId.trim(),
          bloodPressure: bloodPressure.trim(),
          clinicalNotes: clinicalNotes.trim(),
          imageDataUrl: imagePreview,
        }),
      })
      const data = await res.json()
      setProgress(100)
      if (!res.ok) {
        toast({ title: 'Could not create the case', description: data.error || 'An unexpected error occurred', variant: 'destructive' })
        setSubmitting(false)
        setProgress(0)
        return
      }
      const c = data.case as EcgCaseDTO
      if (c.status === 'failed') {
        toast({
          title: 'Image analysis failed',
          description: data.error || c.error || 'Try again with a clearer image',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Analysis completed successfully',
          description: `Report ${c.caseNumber} is ready to view and download`,
        })
      }
      setTimeout(() => onDone(c), 600)
    } catch {
      toast({ title: 'Network error', description: 'Could not reach the server, please try again', variant: 'destructive' })
      setSubmitting(false)
      setProgress(0)
    }
  }

  const canSubmit = !submitting && !imageProcessing

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] animate-fade-up">
      {/* ---------- Form ---------- */}
      <div className="space-y-6">
        {/* Patient data */}
        <Card className="border-slate-200">
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 border border-teal-100 text-teal-700">
                <UserRound className="h-4.5 w-4.5" />
              </div>
              <h2 className="font-extrabold text-slate-900">Patient Data</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="p-name">Full name *</Label>
                <Input
                  id="p-name"
                  placeholder="e.g. John Adam Smith"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-age">Age (years) *</Label>
                <Input
                  id="p-age"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={130}
                  placeholder="45"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Gender *</Label>
                <RadioGroup
                  value={patientGender}
                  onValueChange={setPatientGender}
                  className="flex gap-4 pt-2"
                  disabled={submitting}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Male" id="g-m" />
                    <Label htmlFor="g-m" className="cursor-pointer">Male</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Female" id="g-f" />
                    <Label htmlFor="g-f" className="cursor-pointer">Female</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-id">Patient ID / file no. (optional)</Label>
                <Input
                  id="p-id"
                  placeholder="1029384756"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-bp">Blood pressure (optional)</Label>
                <Input
                  id="p-bp"
                  placeholder="125/82"
                  value={bloodPressure}
                  onChange={(e) => setBloodPressure(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Clinical details */}
        <Card className="border-slate-200">
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 border border-teal-100 text-teal-700">
                <FileImage className="h-4.5 w-4.5" />
              </div>
              <h2 className="font-extrabold text-slate-900">Clinical Case Details</h2>
            </div>
            <Textarea
              placeholder="Symptoms, medical history, current medications, reason for the ECG... (optional but improves the accuracy of the conclusion and recommendations)"
              rows={4}
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              disabled={submitting}
              className="resize-none"
            />
          </CardContent>
        </Card>

        {/* Image upload */}
        <Card className={cn('border-slate-200 transition-colors', dragOver && 'border-teal-500 ring-2 ring-teal-200')}>
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 border border-teal-100 text-teal-700">
                <ImageIcon className="h-4.5 w-4.5" />
              </div>
              <h2 className="font-extrabold text-slate-900">ECG Image *</h2>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />

            {!imagePreview ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  handleFile(e.dataTransfer.files?.[0])
                }}
                className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 hover:border-teal-400 hover:bg-teal-50/40 transition-all p-8 md:p-10 text-center"
                disabled={submitting || imageProcessing}
              >
                {imageProcessing ? (
                  <Loader2 className="mx-auto h-10 w-10 text-teal-600 animate-spin" />
                ) : (
                  <UploadCloud className="mx-auto h-10 w-10 text-teal-600" />
                )}
                <p className="mt-3 font-bold text-slate-700">
                  {imageProcessing ? 'Preparing image...' : 'Drag the image here or click to browse'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  PNG or JPEG up to 15MB — a clear, straight-on photo of the tracing works best
                </p>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-white">
                  <img
                    src={imagePreview}
                    alt="ECG image preview"
                    className="w-full max-h-[340px] object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setImagePreview(null)}
                    className="absolute top-2 end-2 rounded-full bg-slate-900/70 hover:bg-red-600 text-white p-1.5 transition-colors"
                    aria-label="Remove image"
                    disabled={submitting}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold">
                    <CheckCircle2 className="h-4 w-4" />
                    Image ready for analysis
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 font-bold text-teal-700 hover:underline"
                    disabled={submitting}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Replace image
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- Sidebar: submit & progress ---------- */}
      <div className="space-y-5 lg:sticky lg:top-6 self-start">
        {!submitting ? (
          <>
            <Card className="border-teal-100">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <BrainCircuit className="h-5 w-5 text-teal-700" />
                  <h3 className="font-extrabold text-slate-900">Ready to analyze?</h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-4">
                  On submit, the AIECG engine reads the image and extracts the rhythm, intervals,
                  axis and pathological changes, then issues a downloadable PDF report. The whole
                  process usually takes under a minute.
                </p>
                <ul className="space-y-2 text-sm mb-5">
                  {[
                    ['Patient name', patientName.trim().length >= 2],
                    ['Age', /^\d{1,3}$/.test(patientAge) && +patientAge <= 130],
                    ['Gender', !!patientGender],
                    ['ECG image', !!imagePreview],
                  ].map(([label, ok]) => (
                    <li key={label as string} className="flex items-center gap-2">
                      {ok ? (
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                      ) : (
                        <span className="h-4.5 w-4.5 rounded-full border-2 border-slate-300 inline-block" />
                      )}
                      <span className={cn('font-bold', ok ? 'text-slate-700' : 'text-slate-400')}>
                        {label as string}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={submit}
                  disabled={!canSubmit}
                  className="w-full h-12 text-base font-extrabold bg-teal-700 hover:bg-teal-800"
                >
                  <BrainCircuit className="mr-2 h-5 w-5" />
                  Analyze ECG & Generate Report
                </Button>
              </CardContent>
            </Card>

            <Card className="border-amber-100 bg-amber-50/60">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="h-5 w-5 text-amber-600" />
                  <h3 className="font-extrabold text-amber-900">For the most accurate reading</h3>
                </div>
                <ul className="space-y-2 text-sm text-amber-800/90 leading-relaxed list-disc ps-4">
                  <li>Photograph the full sheet with even lighting and no shadows</li>
                  <li>Make sure all 12 leads, the rhythm strip and calibration marks are visible</li>
                  <li>Capture straight from above, not at an angle</li>
                  <li>Add clinical details — the model uses them in the conclusion and recommendations</li>
                </ul>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="border-teal-200 pulse-ring">
            <CardContent className="p-6 text-center">
              <div className="rounded-2xl bg-teal-50 border border-teal-100 p-4 mb-5">
                <EcgLine className="h-16" color="#0f766e" />
              </div>
              <h3 className="font-extrabold text-slate-900 text-lg mb-1">Reading the ECG...</h3>
              <p className="text-sm text-slate-500 mb-5 min-h-5">{stageText}</p>
              <Progress value={progress} className="h-2.5 mb-2" />
              <p className="text-xs text-slate-400 tabular-nums">{Math.round(progress)}%</p>
              <p className="mt-4 text-[11px] text-slate-400">
                Don't close this page — you can navigate freely afterwards and the report will be
                in the case archive
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
