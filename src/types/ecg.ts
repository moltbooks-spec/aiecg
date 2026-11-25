/** Shared types between client and server (free of any server-side imports) */

export interface LeadFindingDTO {
  lead: string
  scpCode?: string | null
  finding: string
  severity: 'Normal' | 'Borderline' | 'Abnormal'
}

export interface RegionalSummaryDTO {
  region: string
  leads: string[]
  verdict: 'Normal' | 'Abnormal' | 'Unremarkable' | 'Suggestive'
  evidenceLeads: string[]
  note: string
}

export interface CrossCheckDTO {
  regionalConsistency: 'Consistent' | 'Partial' | 'Inconsistent'
  discrepancies: string[]
  notes: string
}

export interface EcgCaseDTO {
  id: string
  caseNumber: string
  patientName: string
  patientAge: number
  patientGender: string
  patientId: string | null
  bloodPressure: string | null
  clinicalNotes: string | null
  status: 'analyzing' | 'completed' | 'failed'
  heartRate: number | null
  rhythm: string | null
  pWave: string | null
  prInterval: string | null
  qrsDuration: string | null
  qtInterval: string | null
  qtcInterval: string | null
  axis: string | null
  stSegment: string | null
  quality: string | null
  confidence: string | null
  normality: string | null
  urgency: string | null
  findings: string[] | null
  conclusion: string | null
  recommendations: string[] | null
  leadFindings: LeadFindingDTO[] | null
  regionalSummary: RegionalSummaryDTO[] | null
  crossCheck: CrossCheckDTO | null
  digitizedAt: string | null
  digitizerInfo: {
    method?: string
    samplingHz?: number
    durationS?: number
    gridConfidence?: number
    notes?: string
    ok?: boolean
    reason?: string
  } | null
  hasSignals: boolean
  myFeedback: {
    verdict: string
    correctNormality: string | null
    correctUrgency: string | null
    comment: string | null
  } | null
  error: string | null
  doctorName: string
  hospitalName: string
  createdAt: string
  updatedAt: string
  imageBase64?: string
  imageMimeType?: string
}

export interface AuthUser {
  id: string
  email: string
  doctorName: string
  hospitalName: string
  specialty: string | null
  createdAt: string
}

export type AppView = 'dashboard' | 'new' | 'cases' | 'case' | 'profile'
