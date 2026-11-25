'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { AuthUser, EcgCaseDTO } from '@/types/ecg'
import {
  Building2,
  CalendarDays,
  FileDown,
  FolderOpen,
  HeartPulse,
  Mail,
  Stethoscope,
  UserRound,
} from 'lucide-react'
import { formatDateShort } from './ecg-visuals'

export function Profile({ user, onOpenCase }: { user: AuthUser; onOpenCase: (id: string) => void }) {
  const [cases, setCases] = useState<EcgCaseDTO[] | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/cases')
        if (res.ok) {
          const data = await res.json()
          setCases(data.cases as EcgCaseDTO[])
        } else setCases([])
      } catch {
        setCases([])
      }
    })()
  }, [])

  const completed = cases?.filter((c) => c.status === 'completed') ?? []
  const downloads = completed.slice(0, 5)

  return (
    <div className="space-y-6 animate-fade-up">
      <Card className="overflow-hidden border-slate-200">
        <div className="h-24 bg-gradient-to-r from-teal-800 to-teal-600 relative">
          <div className="absolute inset-0 ecg-paper-dark opacity-50" aria-hidden="true" />
        </div>
        <CardContent className="p-6 -mt-10">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-teal-700 text-white shadow-lg">
              <UserRound className="h-9 w-9" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-extrabold text-slate-900">Dr. {user.doctorName}</h2>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              { icon: Building2, label: 'Hospital / Center', value: user.hospitalName },
              { icon: Stethoscope, label: 'Specialty', value: user.specialty || 'Not specified' },
              { icon: CalendarDays, label: 'Member since', value: formatDateShort(user.createdAt) },
              { icon: FolderOpen, label: 'Total cases', value: cases ? String(cases.length) : '...' },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                <row.icon className="h-5 w-5 text-teal-700 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-400">{row.label}</div>
                  <div className="font-bold text-slate-800 truncate">{row.value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <Badge className="bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-50 font-bold">
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              Verified institutional account
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-extrabold flex items-center gap-2">
            <FileDown className="h-4.5 w-4.5 text-teal-700" />
            Latest Reports Ready to Download
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!cases ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : downloads.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              No completed reports yet — upload a new case to generate the first report
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {downloads.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 border border-teal-100">
                    <HeartPulse className="h-4.5 w-4.5 text-teal-700" />
                  </div>
                  <button onClick={() => onOpenCase(c.id)} className="min-w-0 flex-1 text-start">
                    <div className="font-bold text-slate-800 truncate">{c.patientName}</div>
                    <div className="text-xs text-slate-400 tabular-nums">
                      {c.caseNumber} · {formatDateShort(c.createdAt)}
                    </div>
                  </button>
                  <Button asChild size="sm" variant="outline" className="font-bold border-teal-200 text-teal-700 hover:bg-teal-50">
                    <a href={`/api/cases/${c.id}/pdf`} download>
                      <FileDown className="mr-1 h-3.5 w-3.5" />
                      PDF
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
