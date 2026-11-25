'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import type { AuthUser } from '@/types/ecg'
import { ArrowLeft, Building2, HeartPulse, Lock, Mail, Stethoscope, UserRound } from 'lucide-react'
import { EcgLine, AiecgLogo } from './ecg-visuals'

const SPECIALTIES = [
  'Cardiology',
  'Internal Medicine',
  'Emergency Medicine',
  'Critical Care',
  'Family Medicine',
  'Diagnostic Radiology',
  'Other',
]

export function AuthView({
  onAuthed,
  onBack,
}: {
  onAuthed: (user: AuthUser) => void
  onBack: () => void
}) {
  const { toast } = useToast()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)

  // ---- login state ----
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // ---- register state ----
  const [doctorName, setDoctorName] = useState('')
  const [hospitalName, setHospitalName] = useState('')
  const [specialty, setSpecialty] = useState<string>('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPassword2, setRegPassword2] = useState('')

  async function submitLogin() {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Sign-in failed', description: data.error || 'Check your details', variant: 'destructive' })
        return
      }
      onAuthed(data.user as AuthUser)
    } catch {
      toast({ title: 'Network error', description: 'Could not reach the server', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  async function submitRegister() {
    if (regPassword !== regPassword2) {
      toast({ title: 'Passwords do not match', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorName,
          hospitalName,
          specialty: specialty || '',
          email: regEmail,
          password: regPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Account creation failed', description: data.error || 'Check your details', variant: 'destructive' })
        return
      }
      toast({ title: 'Welcome to AIECG', description: 'Your account was created successfully' })
      onAuthed(data.user as AuthUser)
    } catch {
      toast({ title: 'Network error', description: 'Could not reach the server', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_1.1fr]">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between bg-teal-900 p-10 overflow-hidden">
        <div className="absolute inset-0 ecg-paper-dark opacity-70" aria-hidden="true" />
        <div className="relative">
          <button onClick={onBack} className="inline-flex items-center gap-2 text-teal-200 hover:text-white transition-colors text-sm font-bold">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </button>
        </div>
        <div className="relative space-y-6">
          <AiecgLogo size={64} />
          <h1 className="text-3xl font-extrabold text-white leading-snug">
            Join the network of doctors
            <br />
            who read the heart faster
          </h1>
          <p className="text-teal-100/90 leading-relaxed max-w-md">
            One account for your hospital gives your team ECG case uploads, structured AI
            readings, professional downloadable reports — and a consultant chat to discuss every
            case.
          </p>
          <EcgLine className="h-20 max-w-lg" color="#5eead4" />
        </div>
        <div className="relative text-xs text-teal-200/70">
          © 2026 AIECG — a decision-support tool for the treating physician
        </div>
      </div>

      {/* Login/register form */}
      <div className="flex items-center justify-center p-4 sm:p-8 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <AiecgLogo size={36} />
              <span className="text-lg font-extrabold text-teal-900">AIECG</span>
            </div>
            <button onClick={onBack} className="text-sm font-bold text-slate-500 hover:text-teal-700 inline-flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Home
            </button>
          </div>

          <Card className="shadow-xl shadow-slate-900/5 border-slate-200">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 border border-teal-100">
                <HeartPulse className="h-6 w-6 text-teal-700" />
              </div>
              <CardTitle className="text-xl font-extrabold text-slate-900">
                {tab === 'login' ? 'Sign In' : 'New Hospital Account'}
              </CardTitle>
              <CardDescription>
                {tab === 'login'
                  ? 'Enter your account details to continue to the dashboard'
                  : 'Create an account for your hospital or medical center in a minute'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'register')}>
                <TabsList className="grid w-full grid-cols-2 mb-5">
                  <TabsTrigger value="login" className="font-bold">Sign In</TabsTrigger>
                  <TabsTrigger value="register" className="font-bold">Register</TabsTrigger>
                </TabsList>

                {/* ---------- login ---------- */}
                <TabsContent value="login">
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (!loading) submitLogin()
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="login-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="doctor@hospital.com"
                          className="ps-9"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="login-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          id="login-password"
                          type="password"
                          placeholder="••••••••"
                          className="ps-9"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <Button type="submit" disabled={loading} className="w-full h-11 font-bold bg-teal-700 hover:bg-teal-800">
                      {loading ? 'Verifying…' : 'Sign in to dashboard'}
                    </Button>
                  </form>
                </TabsContent>

                {/* ---------- register ---------- */}
                <TabsContent value="register">
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (!loading) submitRegister()
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-doctor">Physician name</Label>
                      <div className="relative">
                        <UserRound className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          id="reg-doctor"
                          placeholder="Dr. John Smith"
                          className="ps-9"
                          value={doctorName}
                          onChange={(e) => setDoctorName(e.target.value)}
                          required
                          minLength={2}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-hospital">Hospital / center name</Label>
                      <div className="relative">
                        <Building2 className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          id="reg-hospital"
                          placeholder="King Faisal Specialist Hospital"
                          className="ps-9"
                          value={hospitalName}
                          onChange={(e) => setHospitalName(e.target.value)}
                          required
                          minLength={2}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Specialty (optional)</Label>
                      <Select value={specialty} onValueChange={setSpecialty}>
                        <SelectTrigger className="w-full">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Stethoscope className="h-4 w-4" />
                            <SelectValue placeholder="Choose your specialty" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {SPECIALTIES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-email">Work email</Label>
                      <div className="relative">
                        <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          id="reg-email"
                          type="email"
                          placeholder="doctor@hospital.com"
                          className="ps-9"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-password">Password</Label>
                        <Input
                          id="reg-password"
                          type="password"
                          placeholder="At least 8 characters"
                          className="ps-3"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          required
                          minLength={8}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-password2">Confirm password</Label>
                        <Input
                          id="reg-password2"
                          type="password"
                          placeholder="••••••••"
                          className="ps-3"
                          value={regPassword2}
                          onChange={(e) => setRegPassword2(e.target.value)}
                          required
                          minLength={8}
                        />
                      </div>
                    </div>
                    <Button type="submit" disabled={loading} className="w-full h-11 font-bold bg-teal-700 hover:bg-teal-800">
                      {loading ? 'Creating account…' : 'Create account & start'}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <p className="mt-5 text-center text-xs text-slate-500 leading-relaxed px-6">
            By creating an account you acknowledge that AIECG reports are decision-support tools
            for the treating physician and do not replace direct clinical evaluation.
          </p>
        </div>
      </div>
    </div>
  )
}
