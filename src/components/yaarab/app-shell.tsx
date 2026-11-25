'use client'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { AppView, AuthUser } from '@/types/ecg'
import {
  FilePlus2,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  UserRound,
} from 'lucide-react'
import { AiecgLogo, EcgLine } from './ecg-visuals'
import { cn } from '@/lib/utils'

const NAV: Array<{ key: AppView; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'new', label: 'New Case', icon: FilePlus2 },
  { key: 'cases', label: 'Case Archive', icon: FolderOpen },
  { key: 'profile', label: 'Profile', icon: UserRound },
]

export function AppShell({
  user,
  view,
  onNavigate,
  onLogout,
  children,
}: {
  user: AuthUser
  view: AppView
  onNavigate: (v: AppView) => void
  onLogout: () => void
  children: React.ReactNode
}) {
  const initials = user.doctorName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')

  const currentTitle = NAV.find((n) => n.key === view)?.label ?? ''

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 md:flex-row">
      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground sticky top-0 h-screen">
        <div className="p-5 pb-3">
          <div className="flex items-center gap-2.5">
            <AiecgLogo size={38} />
            <div className="leading-tight">
              <div className="text-lg font-extrabold text-white">AIECG</div>
              <div className="text-[11px] text-teal-200/80">ECG Analysis</div>
            </div>
          </div>
          <EcgLine className="h-10 mt-3 opacity-70" color="#5eead4" strokeWidth={2} />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Main navigation">
          {NAV.map((item) => {
            const active =
              view === item.key || (view === 'case' && item.key === 'cases')
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-all',
                  active
                    ? 'bg-sidebar-accent text-white shadow-inner'
                    : 'text-teal-100/80 hover:bg-sidebar-accent/60 hover:text-white'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <item.icon className="h-4.5 w-4.5" />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Avatar className="h-10 w-10 border-2 border-teal-400/40">
              <AvatarFallback className="bg-teal-800 text-teal-100 font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-bold text-white">Dr. {user.doctorName}</div>
              <div className="truncate text-[11px] text-teal-200/70">{user.hospitalName}</div>
            </div>
            <button
              onClick={onLogout}
              className="rounded-lg p-2 text-teal-200/80 hover:bg-red-500/20 hover:text-red-200 transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ---------- Content ---------- */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 bg-sidebar text-white border-b border-sidebar-border">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2">
              <AiecgLogo size={30} />
              <span className="font-extrabold">AIECG</span>
            </div>
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-teal-100/90 hover:bg-red-500/20 hover:text-red-200"
            >
              <LogOut className="h-4 w-4" />
              Exit
            </button>
          </div>
          <div className="px-4 pb-2 text-[11px] text-teal-200/70 truncate">
            Dr. {user.doctorName} — {user.hospitalName}
          </div>
        </header>

        {/* Desktop title bar */}
        <div className="hidden md:flex items-center justify-between px-8 pt-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{currentTitle}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {view === 'new'
                ? 'Enter patient data and upload the ECG image to generate the report'
                : view === 'cases'
                ? 'All cases uploaded by your hospital'
                : `Welcome, ${user.hospitalName}`}
            </p>
          </div>
          <Button
            onClick={() => onNavigate('new')}
            className="font-bold bg-teal-700 hover:bg-teal-800"
          >
            <FilePlus2 className="mr-1.5 h-4 w-4" />
            New Case
          </Button>
        </div>

        <main className="flex-1 px-4 md:px-8 py-5 md:py-6 pb-24 md:pb-8 w-full max-w-6xl mx-auto">
          {children}
        </main>

        {/* ---------- Mobile bottom navigation ---------- */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
          aria-label="Bottom navigation"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="grid grid-cols-4">
            {NAV.map((item) => {
              const active =
                view === item.key || (view === 'case' && item.key === 'cases')
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold transition-colors',
                    active ? 'text-teal-700' : 'text-slate-400'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </button>
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
