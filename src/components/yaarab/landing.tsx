'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  FileDown,
  FolderLock,
  HeartPulse,
  Hospital,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UploadCloud,
  Users,
} from 'lucide-react'
import { EcgLine, AiecgLogo } from './ecg-visuals'

const features = [
  {
    icon: BrainCircuit,
    title: 'Instant AI Reading',
    desc: 'A medical vision engine analyzes the tracing (12-lead or rhythm strip) and extracts rhythm, rate, intervals, axis and pathological changes.',
  },
  {
    icon: FileDown,
    title: 'Professional PDF Report',
    desc: 'A formatted report with patient data, the image, measured parameters, conclusion and recommendations — ready to download, print and archive.',
  },
  {
    icon: MessageSquare,
    title: 'Chat About the Case',
    desc: 'After the report is issued, discuss the case directly with the AI consultant: differential diagnoses, follow-up, and what to look for next.',
  },
  {
    icon: Users,
    title: 'Hospital Accounts',
    desc: 'Open an account for your hospital or center and upload patient cases from one place, with complete data separation for each institution.',
  },
  {
    icon: FolderLock,
    title: 'Organized Patient Archive',
    desc: 'Every case keeps its data, report and creation history, with search and filtering by overall result.',
  },
  {
    icon: LayoutDashboard,
    title: 'Statistical Dashboard',
    desc: 'Live indicators: total cases, completed reports, abnormal results, and result distribution to track department performance.',
  },
]

const steps = [
  {
    icon: Stethoscope,
    title: 'Enter Patient Data',
    desc: 'Name, age, gender and clinical case details — in under a minute.',
  },
  {
    icon: UploadCloud,
    title: 'Upload the ECG Image',
    desc: 'A clear image of a 12-lead ECG or rhythm strip, in PNG or JPEG.',
  },
  {
    icon: HeartPulse,
    title: 'Receive & Download the Report',
    desc: 'The engine reads the tracing and returns a structured report downloadable as PDF, then chat with the AI about the case.',
  },
]

export function Landing({
  onStart,
  onLogin,
}: {
  onStart: () => void
  onLogin: () => void
}) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ---------------- Header ---------------- */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/85 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AiecgLogo size={38} />
            <div className="leading-tight">
              <div className="text-lg font-extrabold text-teal-900">AIECG</div>
              <div className="text-[11px] text-slate-500 hidden sm:block">
                AI-Powered ECG Analysis
              </div>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-teal-700 transition-colors">Features</a>
            <a href="#how" className="hover:text-teal-700 transition-colors">How It Works</a>
            <a href="#trust" className="hover:text-teal-700 transition-colors">Privacy & Accuracy</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onLogin} className="font-bold text-slate-700 hover:text-teal-700">
              Sign In
            </Button>
            <Button onClick={onStart} className="font-bold bg-teal-700 hover:bg-teal-800">
              Get Started
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 ecg-paper opacity-70" aria-hidden="true" />
        <div className="absolute -top-24 -start-24 h-72 w-72 rounded-full bg-teal-200/40 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-32 -end-16 h-80 w-80 rounded-full bg-rose-100/60 blur-3xl" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-16 md:pt-20 md:pb-24">
          <div className="grid gap-10 lg:grid-cols-2 items-center">
            <div className="animate-fade-up">
              <Badge className="mb-5 bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-50 font-bold text-[13px] px-3 py-1">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Powered by medical-grade AI vision
              </Badge>
              <h1 className="text-4xl md:text-5xl font-extrabold leading-[1.25] text-slate-900">
                ECG reading with
                <br />
                <span className="text-gradient-teal">specialist-level accuracy</span>
                <br />
                in under a minute
              </h1>
              <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-xl">
                AIECG is a platform built for doctors and hospitals: upload an ECG image, let the
                AI engine read it and issue a structured medical report downloadable as PDF — then
                discuss the case with the AI consultant.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={onStart} className="h-12 px-7 text-base font-bold bg-teal-700 hover:bg-teal-800">
                  Create a hospital account — free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline" onClick={onLogin} className="h-12 px-7 text-base font-bold border-teal-300 text-teal-800 hover:bg-teal-50">
                  I already have an account
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-teal-600" />
                  Isolated institutional data
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-teal-600" />
                  12-lead and rhythm strip analysis
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Hospital className="h-4 w-4 text-teal-600" />
                  Designed for hospital workflows
                </span>
              </div>
            </div>

            {/* Live report preview card */}
            <div className="relative animate-fade-up [animation-delay:150ms]">
              <Card className="relative shadow-2xl shadow-teal-900/10 border-teal-100 overflow-hidden">
                <div className="ecg-paper border-b border-rose-100 px-4 pt-3">
                  <EcgLine className="h-24" color="#0f766e" />
                </div>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <AiecgLogo size={30} />
                      <div className="leading-tight">
                        <div className="font-extrabold text-teal-900 text-sm">AIECG Report</div>
                        <div className="text-[10px] text-slate-400">ECG-2026-0007</div>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 text-xs font-bold">
                      <HeartPulse className="h-3.5 w-3.5" />
                      Normal ECG
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      ['Rate', '76'],
                      ['PR', '160'],
                      ['QRS', '92'],
                      ['QTc', '415'],
                    ].map(([l, v]) => (
                      <div key={l} className="rounded-lg bg-teal-50/70 border border-teal-100 py-2">
                        <div className="text-[10px] text-slate-500">{l}</div>
                        <div className="font-extrabold text-teal-800 text-sm tabular-nums">{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2 text-[13px] text-slate-600">
                    <p className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                      Regular sinus rhythm at 76 beats per minute
                    </p>
                    <p className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                      No ischemic changes in the ST segment or T wave
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-teal-300 bg-teal-50/50 p-3">
                    <MessageSquare className="h-5 w-5 text-teal-700" />
                    <span className="text-sm font-bold text-teal-800">Discuss the case with the AI consultant</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-teal-300 bg-teal-50/50 p-3">
                    <FileDown className="h-5 w-5 text-teal-700" />
                    <span className="text-sm font-bold text-teal-800">Downloadable, printable PDF report</span>
                  </div>
                </CardContent>
              </Card>
              <div className="absolute -top-4 -end-4 hidden md:flex animate-float-slow items-center gap-2 rounded-xl bg-white shadow-xl border border-slate-100 px-3.5 py-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500" />
                </span>
                <span className="text-xs font-bold text-slate-700">Report in ~60 seconds</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section id="features" className="py-16 md:py-20 bg-slate-50/70">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-extrabold text-slate-900">
              Everything a cardiology department needs, <span className="text-teal-700">in one platform</span>
            </h2>
            <p className="mt-3 text-slate-600">
              From case upload to an archivable report — a complete workflow designed with clinic
              and hospital logic.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="group hover:shadow-lg hover:shadow-teal-900/5 hover:-translate-y-0.5 transition-all border-slate-200">
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700 border border-teal-100 group-hover:bg-teal-700 group-hover:text-white transition-colors">
                    <f.icon className="h-5.5 w-5.5" />
                  </div>
                  <h3 className="font-extrabold text-slate-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how" className="py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-extrabold text-slate-900">Just three steps</h2>
            <p className="mt-3 text-slate-600">From the ECG image to a shareable, professional report.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3 relative">
            <div className="hidden md:block absolute top-9 start-[16%] end-[16%] h-0.5 bg-gradient-to-r from-teal-100 via-teal-300 to-teal-100" aria-hidden="true" />
            {steps.map((s, i) => (
              <div key={s.title} className="relative text-center">
                <div className="mx-auto mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-white border-2 border-teal-200 shadow-md shadow-teal-900/5 relative z-10">
                  <s.icon className="h-8 w-8 text-teal-700" />
                  <span className="absolute -top-2 -end-2 flex h-6 w-6 items-center justify-center rounded-full bg-teal-700 text-white text-xs font-extrabold">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-extrabold text-slate-900 mb-1.5">{s.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button size="lg" onClick={onStart} className="h-12 px-8 text-base font-bold bg-teal-700 hover:bg-teal-800">
              Try AIECG now
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* ---------------- Trust ---------------- */}
      <section id="trust" className="py-14 bg-teal-900 relative overflow-hidden">
        <div className="absolute inset-0 ecg-paper-dark opacity-60" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4">
          <div className="grid gap-8 md:grid-cols-[1.2fr_1fr] items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-snug">
                Competitive accuracy, strict medical governance
              </h2>
              <p className="mt-4 text-teal-100/90 leading-relaxed">
                AIECG is an advanced decision-support tool that works beside the physician, not in
                their place: the model reports its reading confidence and urgency level, and you
                can re-run the analysis or refine the inputs. The diagnostic and treatment decision
                always stays with the treating physician.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {['Each hospital\'s data is fully isolated', 'Protected sessions and encrypted passwords', 'Complete audit trail for every case'].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3.5 py-1.5 text-sm text-teal-50">
                    <ShieldCheck className="h-4 w-4 text-teal-300" />
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                ['12', 'lead + rhythm strip'],
                ['~60s', 'average report time'],
                ['PDF', 'instant download'],
              ].map(([v, l]) => (
                <div key={l} className="rounded-2xl bg-white/5 border border-white/10 p-4 backdrop-blur-sm">
                  <div className="text-2xl font-extrabold text-white tabular-nums">{v}</div>
                  <div className="mt-1 text-xs text-teal-200">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- CTA + Footer ---------------- */}
      <footer className="mt-auto bg-slate-900 text-slate-300">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-white/10">
            <div className="flex items-center gap-3">
              <AiecgLogo size={42} />
              <div>
                <div className="text-lg font-extrabold text-white">AIECG</div>
                <div className="text-xs text-slate-400">AI-Powered ECG Analysis</div>
              </div>
            </div>
            <Button size="lg" onClick={onStart} className="font-bold bg-teal-600 hover:bg-teal-500">
              Start using the platform
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <div className="pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>© 2026 AIECG. All rights reserved.</p>
            <p className="max-w-xl text-center md:text-end leading-relaxed">
              Medical disclaimer: AIECG reports are AI-assisted and are decision-support tools for
              physicians; they do not replace direct clinical evaluation or the treating
              physician's judgment.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
