'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AppView, AuthUser } from '@/types/ecg'
import { Landing } from '@/components/yaarab/landing'
import { AuthView } from '@/components/yaarab/auth-view'
import { AppShell } from '@/components/yaarab/app-shell'
import { Dashboard } from '@/components/yaarab/dashboard'
import { NewCase } from '@/components/yaarab/new-case'
import { CasesList } from '@/components/yaarab/cases-list'
import { CaseDetail } from '@/components/yaarab/case-detail'
import { Profile } from '@/components/yaarab/profile'

type Screen = 'landing' | 'auth' | 'app'

export default function Home() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [view, setView] = useState<AppView>('dashboard')
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)

  // Fetch the current user on boot
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me')
        const data = await res.json()
        if (data.user) {
          setUser(data.user as AuthUser)
          setScreen('app')
          setView('dashboard')
        }
      } catch {
        /* visitor */
      } finally {
        setBooting(false)
      }
    })()
  }, [])

  const openCase = useCallback((id: string) => {
    setActiveCaseId(id)
    setView('case')
    window.scrollTo({ top: 0 })
  }, [])

  const navigate = useCallback((v: AppView) => {
    setView(v)
    if (v !== 'case') setActiveCaseId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
    setScreen('landing')
    setView('dashboard')
    setActiveCaseId(null)
  }

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 animate-heartbeat flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
            </svg>
          </div>
          <p className="text-sm font-bold text-teal-800">Starting AIECG…</p>
        </div>
      </div>
    )
  }

  if (screen === 'landing') {
    return (
      <Landing
        onStart={() => setScreen('auth')}
        onLogin={() => setScreen('auth')}
      />
    )
  }

  if (screen === 'auth' || !user) {
    return (
      <AuthView
        onBack={() => setScreen('landing')}
        onAuthed={(u) => {
          setUser(u)
          setScreen('app')
          setView('dashboard')
        }}
      />
    )
  }

  return (
    <AppShell user={user} view={view} onNavigate={navigate} onLogout={logout}>
      {view === 'dashboard' && (
        <Dashboard user={user} onNavigate={navigate} onOpenCase={openCase} />
      )}
      {view === 'new' && (
        <NewCase
          onNavigate={navigate}
          onDone={(c) => openCase(c.id)}
        />
      )}
      {view === 'cases' && (
        <CasesList onNavigate={navigate} onOpenCase={openCase} />
      )}
      {view === 'case' && activeCaseId && <CaseDetail caseId={activeCaseId} />}
      {view === 'profile' && <Profile user={user} onOpenCase={openCase} />}
    </AppShell>
  )
}
