/**
 * Server-side knowledge loader — pulls the SCP-ECG code table and lead
 * criteria from the Supabase database (seeded from PTB-XL scp_statements.csv)
 * and caches them in memory. Falls back to the bundled static knowledge
 * (src/lib/ecg-knowledge) when the DB is unavailable.
 */
import { db } from '@/lib/db'

export interface DbScpCode {
  code: string
  label: string
  diagnosticClass: string | null
  isDiagnostic: boolean
}

export interface DbLeadCriterion {
  lead: string
  region: string
  criterion: string
  detail: string
}

interface KnowledgeCache {
  scps: DbScpCode[]
  leadCriteria: DbLeadCriterion[]
  loadedAt: number
}

let cache: KnowledgeCache | null = null
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/** Load SCP codes + lead criteria from the DB (cached for 5 minutes). */
export async function loadKnowledge(): Promise<KnowledgeCache | null> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache
  try {
    const [scps, leadCriteria] = await Promise.all([
      db.scpCode.findMany({ orderBy: { id: 'asc' } }),
      db.leadCriterion.findMany({ orderBy: [{ lead: 'asc' }, { criterion: 'asc' }] }),
    ])
    cache = {
      scps: scps.map((s) => ({
        code: s.id,
        label: s.label,
        diagnosticClass: s.diagnosticClass,
        isDiagnostic: s.isDiagnostic,
      })),
      leadCriteria: leadCriteria.map((l) => ({
        lead: l.lead,
        region: l.region,
        criterion: l.criterion,
        detail: l.detail,
      })),
      loadedAt: Date.now(),
    }
    return cache
  } catch {
    return cache // stale cache better than nothing
  }
}

/** SCP entries formatted for prompt injection. */
export async function dbScpPromptLines(): Promise<string[]> {
  const k = await loadKnowledge()
  if (!k || k.scps.length === 0) return []
  return k.scps
    .filter((s) => s.isDiagnostic)
    .map((s) => `  - ${s.code} [${s.diagnosticClass ?? '—'}]: ${s.label}`)
}

/** Lead criteria formatted for prompt injection. */
export async function dbLeadCriteriaPromptLines(): Promise<string[]> {
  const k = await loadKnowledge()
  if (!k || k.leadCriteria.length === 0) return []
  return k.leadCriteria.map((l) => `  - ${l.lead} (${l.region}) ${l.criterion}: ${l.detail}`)
}
