'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import type { AppView, EcgCaseDTO } from '@/types/ecg'
import {
  ChevronRight,
  FileDown,
  FilePlus2,
  FolderOpen,
  Loader2,
  Search,
  Trash2,
} from 'lucide-react'
import { NormalityBadge, StatusBadge, formatDate } from './ecg-visuals'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'Normal' | 'Borderline' | 'Abnormal' | 'analyzing' | 'failed'

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'Normal', label: 'Normal' },
  { key: 'Borderline', label: 'Borderline' },
  { key: 'Abnormal', label: 'Abnormal' },
  { key: 'analyzing', label: 'Analyzing' },
  { key: 'failed', label: 'Failed' },
]

export function CasesList({
  onOpenCase,
  onNavigate,
}: {
  onOpenCase: (id: string) => void
  onNavigate: (v: AppView) => void
}) {
  const { toast } = useToast()
  const [cases, setCases] = useState<EcgCaseDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [deleteTarget, setDeleteTarget] = useState<EcgCaseDTO | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/cases')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setCases(data.cases as EcgCaseDTO[])
    } catch {
      setCases([])
      toast({ title: 'Could not load cases', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const list = cases ?? []
    const q = query.trim().toLowerCase()
    return list.filter((c) => {
      if (q) {
        const hay = `${c.patientName} ${c.caseNumber} ${c.patientId ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filter === 'all') return true
      if (filter === 'analyzing' || filter === 'failed') return c.status === filter
      return c.normality === filter && c.status === 'completed'
    })
  }, [cases, query, filter])

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/cases/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setCases((prev) => prev?.filter((c) => c.id !== deleteTarget.id) ?? null)
      toast({ title: 'Case deleted', description: deleteTarget.caseNumber })
    } catch {
      toast({ title: 'Could not delete the case', variant: 'destructive' })
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Search & filter tools */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by patient name or case number..."
            className="ps-9 bg-white"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto nice-scroll pb-1 -mx-1 px-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors',
                filter === f.key
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-4 flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-7 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-white">
          <CardContent className="py-14 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 border border-teal-100">
              <FolderOpen className="h-8 w-8 text-teal-700" />
            </div>
            {cases && cases.length > 0 ? (
              <>
                <p className="font-extrabold text-slate-800">No matching results</p>
                <p className="text-sm text-slate-500 mt-1">Try adjusting the search or filter</p>
              </>
            ) : (
              <>
                <p className="font-extrabold text-slate-800">The case archive is empty</p>
                <p className="text-sm text-slate-500 mt-1 mb-5">
                  Upload your hospital's first ECG case
                </p>
                <Button onClick={() => onNavigate('new')} className="font-bold bg-teal-700 hover:bg-teal-800">
                  <FilePlus2 className="mr-1.5 h-4 w-4" />
                  New Case
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.id} className="border-slate-200 hover:border-teal-300 hover:shadow-md transition-all">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <button
                  onClick={() => onOpenCase(c.id)}
                  className="flex flex-1 items-center gap-4 text-start min-w-0"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-50 to-teal-100 border border-teal-100 text-sm font-extrabold text-teal-800">
                    {c.patientAge}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-800">{c.patientName}</span>
                      <span className="text-xs text-slate-400">{c.patientGender}</span>
                      {c.urgency === 'Emergency' || c.urgency === 'Urgent' ? (
                        <span className="rounded-full bg-red-600 text-white px-2 py-0.5 text-[10px] font-extrabold">
                          {c.urgency === 'Emergency' ? 'Emergency' : 'Urgent'}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="tabular-nums">{c.caseNumber}</span>
                      <span>·</span>
                      <span>{formatDate(c.createdAt)}</span>
                      {c.heartRate != null && (
                        <>
                          <span>·</span>
                          <span className="tabular-nums">{c.heartRate} bpm</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.status === 'completed' ? (
                      <NormalityBadge normality={c.normality} />
                    ) : (
                      <StatusBadge status={c.status} />
                    )}
                    <ChevronRight className="h-4 w-4 text-slate-300 hidden sm:block" />
                  </div>
                </button>

                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  {c.status === 'completed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 font-bold border-teal-200 text-teal-700 hover:bg-teal-50"
                      asChild
                    >
                      <a href={`/api/cases/${c.id}/pdf`} download>
                        <FileDown className="mr-1 h-4 w-4" />
                        PDF
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setDeleteTarget(c)}
                    aria-label={`Delete case for ${c.patientName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this case permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              Case {deleteTarget?.caseNumber} for patient {deleteTarget?.patientName} will be
              deleted along with its ECG image, report and chat history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:justify-start">
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 font-bold"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, delete'}
            </AlertDialogAction>
            <AlertDialogCancel className="font-bold" disabled={deleting}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
