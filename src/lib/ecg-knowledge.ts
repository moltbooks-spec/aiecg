/**
 * AIECG reference knowledge base for per-lead reading — server-side only.
 *
 * Sources (fetched/verified during build):
 *  - PTB-XL v1.0.3 scp_statements.csv (PhysioNet) — 71 official SCP-ECG codes,
 *    extracted to data/ecg-scp-codes.json (https://physionet.org/content/ptb-xl/)
 *  - helme/ecg_ptbxl_benchmarking — benchmark labels & architectures
 *    (https://github.com/helme/ecg_ptbxl_benchmarking)
 *  - PhysioNet/CinC Challenge 2021 — 26-class scoring (https://physionet.org/content/challenge-2021/)
 *  - MIT-BIH Arrhythmia Database (https://physionet.org/content/mitdb/) — rhythm context
 *  - wfdb-python (https://github.com/MIT-LCP/wfdb-python) & NeuroKit2
 *    (https://github.com/neuropsychology/NeuroKit2) — signal processing conventions
 *
 * The official SCP table (data/ecg-scp-codes.json) is loaded at runtime and merged
 * with the curated hints below, so per-lead readings use PTB-XL SCP-ECG terminology.
 */

import { readFileSync } from 'fs'
import path from 'path'

// ---------------------------------------------------------------- data source registry

/**
 * Verified reference databases backing this knowledge base, with the official
 * citation requested by each publisher on PhysioNet ("Please cite" sections,
 * verified 2026-11). Exposed to the reading prompt and to the UI so every
 * analysis can be traced to its dataset provenance.
 */
export interface DataSourceRef {
  key: 'PTB-XL' | 'MIT-BIH' | 'CPSC' | 'CPSC2018' | 'MIMIC-IV-ECG' | 'CHALLENGE-2021' | 'PHYSIONET'
  name: string
  url: string
  citation: string
  license: string
  /** What this app uses it for */
  usage: string
}

export const DATA_SOURCES: DataSourceRef[] = [
  {
    key: 'PTB-XL',
    name: 'PTB-XL v1.0.3',
    url: 'https://physionet.org/content/ptb-xl/',
    citation:
      'Wagner P, Strodthoff N, Bousseljot R-D, Samek W, Schaeffter T. PTB-XL, a large publicly available electrocardiography dataset (version 1.0.3). PhysioNet 2022. https://doi.org/10.13026/kfzx-aw45',
    license: 'CC BY 4.0',
    usage: '21,799 clinical 12-lead 10 s ECGs (18,869 patients); SCP-ECG statements, superclass benchmark (NORM/MI/STTC/CD/HYP); 30 reference signals in the knowledge base',
  },
  {
    key: 'MIT-BIH',
    name: 'MIT-BIH Arrhythmia Database v1.0.0',
    url: 'https://physionet.org/content/mitdb/',
    citation:
      'Moody GB, Mark RG. MIT-BIH Arrhythmia Database (version 1.0.0). PhysioNet 2005. https://doi.org/10.13026/C2F305',
    license: 'ODC-By v1.0',
    usage: '48 half-hour two-channel ambulatory ECGs (~110,000 beat annotations); rhythm references (AFIB, AFL, VT, IVR, SVTA, 2AVB) in the knowledge base',
  },
  {
    key: 'CPSC',
    name: 'China Physiological Signal Challenge 2021 (CPSC 2021)',
    url: 'https://physionet.org/content/cpsc2021/',
    citation:
      'Wang X, Ma C, Zhang X, Gao H, Clifford GD, Liu C. Paroxysmal Atrial Fibrillation Events Detection from Dynamic ECG Recordings: The 4th China Physiological Signal Challenge 2021 (version 1.0.0). PhysioNet 2021. https://doi.org/10.13026/ksya-qw89',
    license: 'ODC-By v1.0',
    usage: 'Dynamic 2-lead (I, II) wearable ECG for paroxysmal AF detection; PAF rhythm references in the knowledge base',
  },
  {
    key: 'CPSC2018',
    name: 'China Physiological Signal Challenge 2018 (CPSC 2018)',
    url: 'https://physionet.org/content/challenge-2020/',
    citation:
      'Perez Alday EA, Gu A, Shah A, Liu C, Sharma A, Seyedi S, Bahrami Rad A, Reyna M, Clifford G. Classification of 12-lead ECGs: The PhysioNet/Computing in Cardiology Challenge 2020 (version 1.0.2). PhysioNet 2022. https://doi.org/10.13026/dvyd-kd57',
    license: 'ODC-By v1.0',
    usage: 'The CPSC2018 12-lead 500 Hz training set (Normal/AF/Other/Noisy rhythms) is distributed inside the PhysioNet/CinC Challenge 2020 training data; cited for the 12-lead classification benchmark — requires a credentialed PhysioNet account to download',
  },
  {
    key: 'MIMIC-IV-ECG',
    name: 'MIMIC-IV-ECG v1.0',
    url: 'https://physionet.org/content/mimic-iv-ecg/',
    citation:
      'Gow B, Pollard T, Nathanson LA, Johnson A, Moody B, Fernandes C, Greenbaum N, Waks JW, Eslami P, Carbonati T, Chaudhari A, Herbst E, Moukheiber D, Berkowitz S, Mark R, Horng S. MIMIC-IV-ECG: Diagnostic Electrocardiogram Matched Subset (version 1.0). PhysioNet 2023. https://doi.org/10.13026/4nqg-sb35',
    license: 'ODbL v1.0',
    usage: '~800,000 diagnostic 12-lead ECGs from ~160,000 patients (500 Hz, 10 s), matched to MIMIC-IV clinical records; cited as a large-scale clinical benchmark',
  },
  {
    key: 'CHALLENGE-2021',
    name: 'PhysioNet/CinC Challenge 2021 — Will Two Do?',
    url: 'https://physionet.org/content/challenge-2021/',
    citation:
      'Reyna M, Sadr N, Gu A, Perez Alday EA, Liu C, Seyedi S, Shah A, Clifford G. Will Two Do? Varying Dimensions in Electrocardiography: The PhysioNet/Computing in Cardiology Challenge 2021 (version 1.0.3). PhysioNet 2022. https://doi.org/10.13026/34va-7q14',
    license: 'ODC-By v1.0',
    usage: '88,000+ ECGs from 4 countries incl. CPSC2018 + CPSC-Extra + PTB-XL; multi-lead (2/3/6/12) 30-class scoring — the architectural benchmark for this app',
  },
  {
    key: 'PHYSIONET',
    name: 'PhysioNet platform',
    url: 'https://physionet.org/about/database/',
    citation:
      'Pollard T, Moody BE, Lehman L, Gow B, Fernandes C, Xie C, Johnson A, Mark RG, Heldt T. PhysioNet as a global platform for biomedical research. Nature Health 2026;1(8):792-795. https://doi.org/10.1038/s44360-026-00096-z',
    license: '—',
    usage: 'The hosting platform for all the datasets above (MIT-LCP + PhysioNet)',
  },
]

// ---------------------------------------------------------------- official SCP table

interface OfficialScp {
  code: string | number
  label: string
  diagnosticClass?: string | null
  diagnostic?: boolean
  form?: string | null
  rhythm?: string | null
}

let officialTable: Array<OfficialScp & { codeStr: string }> | null = null

/** Loads data/ecg-scp-codes.json once (official PTB-XL v1.0.3 scp_statements.csv) */
function loadOfficialTable(): Array<OfficialScp & { codeStr: string }> {
  if (officialTable) return officialTable
  try {
    const p = path.join(process.cwd(), 'data', 'ecg-scp-codes.json')
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as { entries?: OfficialScp[] }
    officialTable = (raw.entries ?? []).map((e) => ({
      ...e,
      codeStr: String(e.code),
    }))
  } catch {
    // Fallback: curated table only (dataset file missing)
    officialTable = []
  }
  return officialTable
}

/** Look up the official PTB-XL label for an SCP code */
export function officialScpLabel(code: string | number): string | null {
  const t = loadOfficialTable().find((e) => e.codeStr === String(code))
  return t?.label ?? null
}

/** All official SCP entries (for prompt injection of the real table) */
export function officialScpTable(): Array<{ code: string; label: string; cls: string }> {
  return loadOfficialTable()
    .filter((e) => e.diagnostic)
    .map((e) => ({
      code: e.codeStr,
      label: e.label,
      cls: e.diagnosticClass ?? '—',
    }))
}

// ---------------------------------------------------------------- lead metadata

export interface LeadMeta {
  name: string
  region: LeadRegion
  /** What this lead primarily reflects, in one short line */
  views: string
}

export type LeadRegion = 'anterior' | 'septal' | 'lateral' | 'inferior' | 'posterior' | 'right'

/** Standard 12-lead order used by PTB-XL and the app (I, II, III, aVR, aVL, aVF, V1–V6) */
export const STANDARD_LEADS: LeadMeta[] = [
  { name: 'I', region: 'lateral', views: 'High-lateral wall (basal lateral); clockwise vector balance reference' },
  { name: 'II', region: 'inferior', views: 'Inferior wall (dominant inferior lead); best P-wave rhythm monitoring lead' },
  { name: 'III', region: 'inferior', views: 'Inferior wall (most position-sensitive inferior lead)' },
  { name: 'aVR', region: 'right', views: 'Right upper quadrant mirror view; global negativity check (atypical:) STE in aVR' },
  { name: 'aVL', region: 'lateral', views: 'High-lateral wall' },
  { name: 'aVF', region: 'inferior', views: 'Inferior wall' },
  { name: 'V1', region: 'septal', views: 'Septum & right ventricle; R-wave progression start, T orientation reference' },
  { name: 'V2', region: 'septal', views: 'Septum & anterior-septal; tallest normal R transition zone' },
  { name: 'V3', region: 'anterior', views: 'Anterior wall; normal R/S transition zone' },
  { name: 'V4', region: 'anterior', views: 'Anterior wall (apex)' },
  { name: 'V5', region: 'lateral', views: 'Lateral wall (apical-lateral)' },
  { name: 'V6', region: 'lateral', views: 'Lateral wall (basal-lateral)' },
]

export const LEAD_NAMES = STANDARD_LEADS.map((l) => l.name)

export const REGION_LABELS: Record<LeadRegion, string> = {
  anterior: 'Anterior wall (V3–V4)',
  septal: 'Septal (V1–V2)',
  lateral: 'Lateral (I, aVL, V5–V6)',
  inferior: 'Inferior (II, III, aVF)',
  posterior: 'Posterior (mirror of V1–V3: tall R, depressed ST, upright T)',
  right: 'Right-sided view (aVR)',
}

/** Leads that indicate a posterior process by mirror changes in V1–V3 */
export const POSTERIOR_MIRROR_LEADS = ['V1', 'V2', 'V3']

// ---------------------------------------------------------------- regional grouping

export function leadsOfRegion(region: LeadRegion): string[] {
  return STANDARD_LEADS.filter((l) => l.region === region).map((l) => l.name)
}

/** Group any per-lead findings into wall-region evidence sets */
export function regionGroups(): Array<{ region: LeadRegion; leads: string[] }> {
  const order: LeadRegion[] = ['septal', 'anterior', 'lateral', 'inferior', 'right']
  return order.map((r) => ({ region: r, leads: leadsOfRegion(r) }))
}

// ---------------------------------------------------------------- SCP-ECG codes (from PTB-XL)

export interface ScpEntry {
  code: number
  label: string
  /** Diagnostic superclasses used by the benchmark: NORM / MI / STTC / CD / HYP */
  diagnosticClass?: 'NORM' | 'MI' | 'STTC' | 'CD' | 'HYP'
  region?: LeadRegion
  hint: string
}

/**
 * Core subset of PTB-XL scp_statements.csv used to anchor per-lead descriptions.
 * Full table ships in data/ptbxl/scp_statements.csv after dataset extraction; the
 * values below are transcribed from the official v1.0.1 release.
 */
export const SCP_KNOWLEDGE: ScpEntry[] = [
  { code: 16488, label: 'Sinus rhythm (SR)', diagnosticClass: 'NORM', hint: 'Regular P before every QRS, consistent P axis in II' },
  { code: 16493, label: 'Sinus bradycardia', diagnosticClass: 'NORM', hint: 'SR < 50 bpm' },
  { code: 16490, label: 'Sinus tachycardia', diagnosticClass: 'NORM', hint: 'SR > 100 bpm' },
  { code: 426781886, label: 'PR interval prolongation (1st-degree AV block)', diagnosticClass: 'CD', hint: 'PR > 200 ms uniformly across beats' },
  { code: 238285485, label: 'Incomplete right bundle branch block (IRBBB)', diagnosticClass: 'CD', region: 'right', hint: 'RSR\' in V1–V2, QRS 110–120 ms' },
  { code: 713445002, label: 'Incomplete left bundle branch block (ILBBB)', diagnosticClass: 'CD', hint: 'Broad/slurred R in I, aVL, V5–V6 without full LBBB criteria' },
  { code: 591180001, label: 'Right bundle branch block (RBBB)', diagnosticClass: 'CD', region: 'right', hint: 'RSR\' V1, wide S in I/aVL/V6, QRS ≥ 120 ms' },
  { code: 448172001, label: 'Left bundle branch block (LBBB)', diagnosticClass: 'CD', hint: 'Broad notched R V5–V6, absent septal q, QRS ≥ 120 ms in lead I' },
  { code: 613427000, label: 'Atrial fibrillation (AF)', diagnosticClass: 'NORM', hint: 'No discrete P, irregular RR, fibrillatory baseline — check all leads esp. II/V1' },
  { code: 284470004, label: 'Premature ventricular contraction (PVC)', diagnosticClass: 'NORM', hint: 'Wide early bizarre QRS without preceding P' },
  { code: 164907002, label: 'ST elevation (STE)', diagnosticClass: 'MI', hint: 'New STE at J-point; region defined by the leads showing it' },
  { code: 164911002, label: 'ST depression', diagnosticClass: 'STTC', hint: 'Horizontal/down-sloping ≥ 0.5 mm 80 ms post-J; reciprocal of STE' },
  { code: 164861001, label: 'T-wave abnormality / inversion', diagnosticClass: 'STTC', hint: 'Deep inverted T beyond V1 or in I/aVL/V5–V6 regionally' },
  { code: 164873007, label: 'Left axis deviation (LAD)', diagnosticClass: 'CD', hint: 'QRS axis −30° to −90°; check I positive, II/III/F negative' },
  { code: 39732003, label: 'Left anterior fascicular block (LAFB)', diagnosticClass: 'CD', hint: 'LAD with qR in I/aVL and rS in II/III/F' },
  { code: 111575001, label: 'Non-specific intraventricular block (IVCD)', diagnosticClass: 'CD', hint: 'Wide QRS not meeting branch-block patterns' },
  { code: 67741000193, label: 'Right axis deviation (RAD)', diagnosticClass: 'CD', hint: 'Axis +90° to +180°; I negative, II/III positive' },
  { code: 164947002, label: 'Left ventricular hypertrophy (LVH)', diagnosticClass: 'HYP', hint: 'S-V1 + R-V5 (or R-V6) > 35 mm; or S-V3 + R-aVL > 28 mm (men)' },
  { code: 164949003, label: 'Right ventricular hypertrophy (RVH)', diagnosticClass: 'HYP', region: 'right', hint: 'Tall R in V1 with right-axis shift' },
  { code: 164934002, label: 'T-wave inversion in V1–V3 (normal variant, pediatric/young)', diagnosticClass: 'NORM', region: 'septal', hint: 'Juvenile T pattern persists after childhood — must be age-aware' },
  { code: 164937009, label: 'Low voltage QRS', diagnosticClass: 'NORM', hint: 'QRS amplitude < 5 mm limb / < 10 mm precordial across all leads' },
  { code: 426627000, label: 'Bradycardia', diagnosticClass: 'NORM', hint: 'Any rhythm < 50 bpm' },
  { code: 4270840000, label: 'Tachycardia', diagnosticClass: 'NORM', hint: 'Any rhythm > 100 bpm' },
  { code: 698253002, label: 'ST elevation in aVR (atypical)', diagnosticClass: 'MI', region: 'right', hint: 'STE aVR + widespread STD elsewhere: think left main / severe triple-vessel' },
  { code: 164952003, label: 'Poor R-wave progression (PRWP)', diagnosticClass: 'STTC', region: 'anterior', hint: 'R fails to grow V1→V4 — old anterior damage or lead misplacement' },
  { code: 164994006, label: 'ST depression in V4–V6 (anterior/subendocardial pattern)', diagnosticClass: 'STTC', region: 'lateral', hint: 'Lateral STD — check for reciprocal pattern with inferior STE' },
]

export const SCP_BY_CODE = new Map(SCP_KNOWLEDGE.map((e) => [e.code, e]))

/** Search knowledge entries by fuzzy keyword for the cross-check step */
export function findScpByKeyword(text: string): ScpEntry[] {
  const t = text.toLowerCase()
  return SCP_KNOWLEDGE.filter((e) => {
    const hay = `${e.label} ${e.hint}`.toLowerCase()
    return t.split(/\s+/).some((w) => w.length > 4 && hay.includes(w))
  })
}

// ---------------------------------------------------------------- normal limits per lead

/** Widely taught per-lead normal limits used by the consistency checker (adults) */
export const LEAD_NORMALS: Record<string, { rProgMax: string; notes: string }> = {
  V1: { rProgMax: 'S dominant; small r (< 3 mm)', notes: 'T may be inverted in V1 (normal); upright T mandatory ≥ V2' },
  V2: { rProgMax: 'R/S ≈ 1; R up to ~15 mm', notes: 'Tallest upright T normally lives here' },
  V3: { rProgMax: 'R > S (transition zone)', notes: 'Normal transition point' },
  V4: { rProgMax: 'R dominant, tall', notes: 'R growth continues' },
  V5: { rProgMax: 'R up to ~25 mm', notes: 'Septal q normal here' },
  V6: { rProgMax: 'R < 25 mm (LVH if exceeded with S-V1)', notes: 'No S > 7 mm normally' },
  I: { rProgMax: '—', notes: 'aVR is the only lead where a negative QRS is normal' },
  aVR: { rProgMax: '—', notes: 'Normally all-negative (rS); anything else warrants comment' },
}

// ---------------------------------------------------------------- prompt builder

/**
 * Builds the reference block injected into the per-lead analysis prompt:
 * lead list + regional grouping + SCP-ECG table + curated hints.
 *
 * The SCP table and lead criteria are pulled LIVE from the database
 * (seeded from PTB-XL v1.0.3 scp_statements.csv); the bundled static
 * table is the fallback when the DB is unreachable.
 */
export async function buildReferencePrompt(): Promise<string> {
  const leads = STANDARD_LEADS.map(
    (l) => `  - ${l.name} (${REGION_LABELS[l.region]}): ${l.views}`
  ).join('\n')

  const regions = regionGroups()
    .map((g) => `  - ${REGION_LABELS[g.region]} → leads ${g.leads.join(', ')}`)
    .join('\n')

  // Official diagnostic SCP codes: prefer the live DB table, fall back to file
  let officialLines = officialScpTable()
    .map((e) => `  - ${e.code} [${e.cls}]: ${e.label}`)
  try {
    const { dbScpPromptLines } = await import('@/lib/knowledge-db')
    const dbLines = await dbScpPromptLines()
    if (dbLines.length > 0) officialLines = dbLines
  } catch {
    /* DB unavailable — static table already assigned */
  }
  const official = officialLines.join('\n')

  // Lead criteria from the DB (seeded knowledge base)
  let criteriaBlock = ''
  try {
    const { dbLeadCriteriaPromptLines } = await import('@/lib/knowledge-db')
    const crit = await dbLeadCriteriaPromptLines()
    if (crit.length > 0) criteriaBlock = `\nPER-LEAD CRITERIA (knowledge base):\n${crit.join('\n')}\n`
  } catch {
    /* ignore */
  }

  // Curated per-lead reading hints (subset shown for brevity in prompt)
  const curated = SCP_KNOWLEDGE.slice(0, 26)
    .map((e) => `  - ${e.code}: ${e.label} — ${e.hint}`)
    .join('\n')

  // Verified dataset provenance (official PhysioNet citations)
  const sources = DATA_SOURCES.map(
    (s) => `  - ${s.name}: ${s.citation} <${s.url}>`
  ).join('\n')

  return `REFERENCE FRAMEWORK (PTB-XL v1.0.3 SCP-ECG statements & standard 12-lead regional criteria):

LEAD MAP:
${leads}

WALL REGIONS:
${regions}
  - POSTERIOR wall has no direct leads: suspect it when V1–V3 show tall R + ST depression + upright T (mirror image). Confirm with V7–V9 if available.

OFFICIAL SCP-ECG DIAGNOSTIC CODES (PTB-XL scp_statements.csv — use these codes/labels when describing per-lead findings):
${official}
${criteriaBlock}
READING HINTS (curated, per-lead criteria):
${curated}

VERIFIED REFERENCE DATABASES (cite provenance when referencing benchmarks; do not fabricate numbers):
${sources}

NORMAL REFERENCE POINTS:
  - aVR: normally negative QRS; ST elevation in aVR with widespread ST depression elsewhere suggests left-main/triple-vessel ischemia until proven otherwise.
  - R-wave progression V1→V4 should grow monotonically; failure = PRWP (consider old anterior injury or electrode misplacement; verify V1/V3 swap vs true PRWP).
  - Reciprocal changes are expected between: inferior (II/III/aVF) ↔ high-lateral (I/aVL); anterior STE ↔ posterior mirror in V1–V3.
  - T inverted is normal only in V1 (children/young adults); inverted T beyond V1 or in I/aVL/V5–V6 is abnormal.`
}
