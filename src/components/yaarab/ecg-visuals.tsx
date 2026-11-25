'use client'

import { cn } from '@/lib/utils'

/** AIECG logo: heart with an ECG trace */
export function AiecgLogo({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <div
      className={cn(
        'rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center shadow-lg shadow-teal-600/25',
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={size * 0.72}
        height={size * 0.72}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
      </svg>
    </div>
  )
}

/** Animated ECG trace (SVG) */
export function EcgLine({
  className,
  color = '#14b8a6',
  strokeWidth = 2.5,
  animate = true,
}: {
  className?: string
  color?: string
  strokeWidth?: number
  animate?: boolean
}) {
  const path =
    'M0 50 L60 50 L70 50 L78 38 L86 62 L92 50 L110 50 L118 44 L126 56 L132 50 L160 50 L170 50 L178 34 L188 68 L194 50 L220 50 L230 50 L238 42 L246 58 L252 50 L280 50 L290 50 L298 36 L306 66 L312 50 L340 50 L350 50 L358 44 L366 56 L372 50 L400 50 L410 50 L418 32 L428 70 L434 50 L470 50 L480 50 L488 40 L496 60 L502 50 L540 50 L550 50 L558 36 L568 66 L574 50 L620 50 L630 50 L638 42 L646 58 L652 50 L700 50'
  return (
    <svg
      viewBox="0 0 700 100"
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      aria-hidden="true"
    >
      {/* Faint background copy */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth * 0.6}
        opacity="0.16"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Animated copy */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        className={animate ? 'animate-ecg' : undefined}
        style={animate ? { filter: 'drop-shadow(0 0 6px rgba(20,184,166,0.45))' } : undefined}
      />
    </svg>
  )
}

/** Overall result badge */
export function NormalityBadge({
  normality,
  className,
}: {
  normality?: string | null
  className?: string
}) {
  if (normality === 'Normal') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold',
          className
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Normal
      </span>
    )
  }
  if (normality === 'Borderline') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-xs font-bold',
          className
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Borderline
      </span>
    )
  }
  if (normality === 'Abnormal') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 text-xs font-bold',
          className
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Abnormal
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 text-xs font-bold',
        className
      )}
    >
      —
    </span>
  )
}

/** Urgency badge */
export function UrgencyBadge({ urgency, className }: { urgency?: string | null; className?: string }) {
  if (urgency === 'Emergency') {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full bg-red-600 text-white px-2.5 py-0.5 text-xs font-bold', className)}>
        Emergency
      </span>
    )
  }
  if (urgency === 'Urgent') {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full bg-amber-500 text-white px-2.5 py-0.5 text-xs font-bold', className)}>
        Urgent
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 text-xs font-bold', className)}>
      Routine
    </span>
  )
}

/** Analysis status badge */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  if (status === 'completed') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700', className)}>
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Completed
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold text-red-600', className)}>
        <span className="h-2 w-2 rounded-full bg-red-500" />
        Failed
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-bold text-teal-700', className)}>
      <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
      Analyzing
    </span>
  )
}

/** Compact English date formatting */
export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function formatDateShort(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
