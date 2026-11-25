/**
 * AIECG PDF report generator — English LTR layout.
 * Used server-side only (Next.js route handlers / node).
 */
import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from '@react-pdf/renderer'

// ---------------------------------------------------------------- fonts
const FONT_FAMILY = process.env.AIECG_PDF_FONT || 'Helvetica'

// ---------------------------------------------------------------- types
export interface EcgReportAnalysis {
  heartRate?: number | string | null
  rhythm?: string | null
  pWave?: string | null
  prInterval?: string | null
  qrsDuration?: string | null
  qtInterval?: string | null
  qtcInterval?: string | null
  axis?: string | null
  stSegment?: string | null
  quality?: string | null
  confidence?: string | null
  normality?: string | null
  urgency?: string | null
  findings?: string[] | null
  conclusion?: string | null
  recommendations?: string[] | null
  leadFindings?: Array<{
    lead: string
    scpCode?: string | null
    finding: string
    severity: string
  }> | null
  regionalSummary?: Array<{
    region: string
    leads: string[]
    verdict: string
    evidenceLeads: string[]
    note: string
  }> | null
  crossCheck?: {
    regionalConsistency: string
    discrepancies: string[]
    notes: string
  } | null
}

export interface EcgReportData {
  caseNumber: string
  createdAt: string
  patient: {
    name: string
    age: number
    gender: string
    patientId?: string | null
    bloodPressure?: string | null
    clinicalNotes?: string | null
  }
  doctor: { name: string; hospital: string; specialty?: string | null }
  analysis: EcgReportAnalysis
  imageBase64: string
  imageMimeType: string
}

// ---------------------------------------------------------------- palette
const C = {
  teal: '#0f766e',
  tealDark: '#115e59',
  tealSoft: '#f0fdfa',
  tealBorder: '#99f6e4',
  ink: '#0f172a',
  slate: '#475569',
  slateLight: '#94a3b8',
  border: '#e2e8f0',
  tile: '#f8fafc',
  ok: '#15803d',
  okBg: '#f0fdf4',
  okBorder: '#bbf7d0',
  warn: '#b45309',
  warnBg: '#fffbeb',
  warnBorder: '#fde68a',
  bad: '#b91c1c',
  badBg: '#fef2f2',
  badBorder: '#fecaca',
}

const NORMALITY_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  Normal: { color: C.ok, bg: C.okBg, border: C.okBorder, label: 'Normal ECG' },
  Borderline: { color: C.warn, bg: C.warnBg, border: C.warnBorder, label: 'Borderline ECG — needs review' },
  Abnormal: { color: C.bad, bg: C.badBg, border: C.badBorder, label: 'Abnormal ECG' },
}
const FALLBACK = { color: C.slate, bg: '#f8fafc', border: C.border, label: 'Analysis' }

// ---------------------------------------------------------------- styles
const styles = StyleSheet.create({
  page: {
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    color: C.ink,
    paddingTop: 30,
    paddingBottom: 56,
    paddingHorizontal: 34,
  },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoBox: {
    width: 44, height: 38, borderRadius: 10, backgroundColor: C.teal,
    alignItems: 'center', justifyContent: 'center',
  },
  logoChar: { color: '#ffffff', fontSize: 13, fontWeight: 700 },
  brandTexts: { flexDirection: 'column' },
  brandName: { fontSize: 16, fontWeight: 700, color: C.tealDark },
  brandSub: { fontSize: 8.5, color: C.slateLight },
  reportMeta: { flexDirection: 'column', alignItems: 'flex-end' },
  reportTitle: { fontSize: 13, fontWeight: 700, color: C.ink },
  reportMetaLine: { fontSize: 9, color: C.slate },
  tealBar: { height: 3, backgroundColor: C.teal, borderRadius: 2, marginBottom: 10 },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginTop: 0 },
  sectionBar: { width: 4, height: 13, borderRadius: 2, backgroundColor: C.teal },
  sectionTitle: { fontSize: 12.5, fontWeight: 700, color: C.tealDark },

  patientBox: { borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 9, marginBottom: 10 },
  patientGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start' },
  patientCell: { width: '48.6%', backgroundColor: C.tile, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9 },
  patientLabel: { fontSize: 8, color: C.slateLight, marginBottom: 1 },
  patientValue: { fontSize: 10.5, fontWeight: 600, color: C.ink },

  imageWrap: {
    borderWidth: 1, borderColor: C.border, borderRadius: 8,
    padding: 5, marginBottom: 3, backgroundColor: '#ffffff',
  },
  ecgImage: { width: '100%', height: 150, objectFit: 'contain' },
  imageCaption: { fontSize: 8, color: C.slateLight, textAlign: 'center', marginBottom: 9 },

  paramsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start' },
  paramCell: {
    width: '23.9%', backgroundColor: C.tealSoft, borderWidth: 1, borderColor: C.tealBorder,
    borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8,
  },
  paramLabel: { fontSize: 8, color: C.slate, marginBottom: 2 },
  paramValue: { fontSize: 10, fontWeight: 600, color: C.tealDark },

  listItemRow: { flexDirection: 'row', gap: 7, marginBottom: 4, alignItems: 'flex-start' },
  listNumber: {
    width: 15, height: 15, borderRadius: 8, backgroundColor: C.teal,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  listNumberText: { color: '#ffffff', fontSize: 8.5, fontWeight: 700 },
  listText: { flex: 1, fontSize: 10.5, color: C.ink, lineHeight: 1.5 },

  conclusionBox: {
    borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10,
    borderLeftWidth: 4,
  },
  conclusionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  conclusionTitle: { fontSize: 11.5, fontWeight: 700 },
  pillRow: { flexDirection: 'row', gap: 5, marginTop: 7 },
  pill: { borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, backgroundColor: '#ffffff', borderWidth: 1 },
  pillText: { fontSize: 8.5, fontWeight: 600 },
  conclusionText: { fontSize: 10.5, lineHeight: 1.6 },

  notesBox: {
    backgroundColor: C.tile, borderWidth: 1, borderColor: C.border, borderRadius: 8,
    padding: 10, marginBottom: 12,
  },
  notesText: { fontSize: 10, color: C.slate, lineHeight: 1.55 },

  // -------- per-lead table --------
  leadTable: { borderWidth: 1, borderColor: C.border, borderRadius: 6, marginBottom: 12 },
  leadTableHeader: {
    flexDirection: 'row', backgroundColor: C.tealDark, borderRadius: 5,
    paddingVertical: 4, paddingHorizontal: 6,
  },
  leadTableHeaderText: { color: '#ffffff', fontSize: 8.5, fontWeight: 700 },
  leadRow: {
    flexDirection: 'row', borderBottomWidth: 0.5, borderColor: C.border,
    paddingVertical: 3.5, paddingHorizontal: 6, alignItems: 'flex-start',
  },
  leadCellLead: { width: '9%', fontSize: 9, fontWeight: 700, color: C.tealDark },
  leadCellCode: { width: '11%', fontSize: 7.5, color: C.slateLight },
  leadCellFinding: { width: '66%', fontSize: 8.5, color: C.ink, lineHeight: 1.35 },
  leadCellSeverity: { width: '14%', fontSize: 7.5, fontWeight: 700, textAlign: 'right' },

  // -------- regional summary --------
  regionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  regionCard: {
    width: '48.6%', borderWidth: 1, borderRadius: 6, padding: 7,
    paddingVertical: 6,
  },
  regionTitle: { fontSize: 9.5, fontWeight: 700, marginBottom: 2 },
  regionNote: { fontSize: 8, color: C.slate, lineHeight: 1.4 },

  // -------- cross-check --------
  crossCheckBox: {
    borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 9, marginBottom: 12,
    backgroundColor: C.tile,
  },
  crossCheckTitle: { fontSize: 10.5, fontWeight: 700, color: C.tealDark, marginBottom: 4 },
  crossCheckText: { fontSize: 8.5, color: C.slate, lineHeight: 1.45 },
  crossCheckDisc: { flexDirection: 'row', gap: 5, marginBottom: 3, alignItems: 'flex-start' },
  crossCheckDiscDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.warn, marginTop: 4 },
  crossCheckDiscText: { flex: 1, fontSize: 8.5, color: C.ink, lineHeight: 1.4 },

  footerLine: {
    position: 'absolute', bottom: 48, left: 34, right: 34, height: 1, backgroundColor: C.border,
  },
  footerNote: {
    position: 'absolute', bottom: 30, left: 34, width: '70%', fontSize: 7.5,
    color: C.slateLight, lineHeight: 1.3,
  },
  footerPage: {
    position: 'absolute', bottom: 30, right: 34, width: '20%', textAlign: 'right',
    fontSize: 8.5, color: C.teal, fontWeight: 600,
  },
})

// ---------------------------------------------------------------- helpers
function fmtDate(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const orDash = (v?: string | number | null) =>
  v === null || v === undefined || v === '' ? '—' : String(v)

// ---------------------------------------------------------------- document
export function EcgReportDocument({ data }: { data: EcgReportData }) {
  const a = data.analysis
  const ns = (a.normality && NORMALITY_STYLE[a.normality]) || FALLBACK
  const findings = (a.findings || []).filter(Boolean)
  const recommendations = (a.recommendations || []).filter(Boolean)
  const leadFindings = (a.leadFindings || []).filter((l) => l && l.lead)
  const regionalSummary = (a.regionalSummary || []).filter((r) => r && r.region)
  const crossCheck = a.crossCheck
  const hr = a.heartRate != null ? `${a.heartRate} bpm` : null

  const SEV_COLOR: Record<string, string> = {
    Normal: C.ok,
    Borderline: C.warn,
    Abnormal: C.bad,
  }
  const VERDICT_COLOR: Record<string, string> = {
    Normal: C.ok,
    Unremarkable: C.slate,
    Suggestive: C.warn,
    Abnormal: C.bad,
  }
  const CONS_COLOR: Record<string, string> = {
    Consistent: C.ok,
    Partial: C.warn,
    Inconsistent: C.bad,
  }

  const params: Array<[string, string]> = [
    ['Heart Rate', orDash(hr)],
    ['Cardiac Rhythm', orDash(a.rhythm)],
    ['PR Interval', orDash(a.prInterval)],
    ['QRS Duration', orDash(a.qrsDuration)],
    ['QT Interval', orDash(a.qtInterval)],
    ['QTc Interval', orDash(a.qtcInterval)],
    ['Electrical Axis', orDash(a.axis)],
    ['Recording Quality', orDash(a.quality)],
  ]

  return (
    <Document
      title={`AIECG Report ${data.caseNumber}`}
      author="AIECG Platform"
      language="en"
    >
      <Page size="A4" style={styles.page}>
        {/* ---------------- header ---------------- */}
        <View style={styles.headerRow}>
          <View style={styles.brand}>
            <View style={styles.logoBox}>
              <Text style={styles.logoChar}>ECG</Text>
            </View>
            <View style={styles.brandTexts}>
              <Text style={styles.brandName}>AIECG</Text>
              <Text style={styles.brandSub}>AI-Powered ECG Analysis</Text>
            </View>
          </View>
          <View style={styles.reportMeta}>
            <Text style={styles.reportTitle}>Electrocardiogram Analysis Report</Text>
            <Text style={styles.reportMetaLine}>{`Report No: ${data.caseNumber}`}</Text>
            <Text style={styles.reportMetaLine}>{`Issued: ${fmtDate(data.createdAt)}`}</Text>
          </View>
        </View>
        <View style={styles.tealBar} />

        {/* ---------------- patient ---------------- */}
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionBar} />
          <Text style={styles.sectionTitle}>Patient &amp; Examination Data</Text>
        </View>
        <View style={styles.patientBox} wrap={false}>
          <View style={styles.patientGrid}>
            <View style={styles.patientCell}>
              <Text style={styles.patientLabel}>Patient Name</Text>
              <Text style={styles.patientValue}>{data.patient.name}</Text>
            </View>
            <View style={styles.patientCell}>
              <Text style={styles.patientLabel}>Age</Text>
              <Text style={styles.patientValue}>{`${data.patient.age} years`}</Text>
            </View>
            <View style={styles.patientCell}>
              <Text style={styles.patientLabel}>Gender</Text>
              <Text style={styles.patientValue}>{data.patient.gender}</Text>
            </View>
            <View style={styles.patientCell}>
              <Text style={styles.patientLabel}>Patient ID</Text>
              <Text style={styles.patientValue}>{orDash(data.patient.patientId)}</Text>
            </View>
            <View style={styles.patientCell}>
              <Text style={styles.patientLabel}>Blood Pressure</Text>
              <Text style={styles.patientValue}>{orDash(data.patient.bloodPressure)}</Text>
            </View>
            <View style={styles.patientCell}>
              <Text style={styles.patientLabel}>Hospital / Center</Text>
              <Text style={styles.patientValue}>{data.doctor.hospital}</Text>
            </View>
          </View>
          <View style={{ marginTop: 7 }}>
            <Text style={[styles.paramLabel, { marginBottom: 1 }]}>
              {`Attending Physician: Dr. ${data.doctor.name}${data.doctor.specialty ? ` — ${data.doctor.specialty}` : ''}`}
            </Text>
          </View>
        </View>

        {/* ---------------- image ---------------- */}
        <View style={styles.imageWrap} wrap={false}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
          <Image
            style={styles.ecgImage}
            src={`data:${data.imageMimeType};base64,${data.imageBase64}`}
          />
        </View>
        <Text style={styles.imageCaption}>Uploaded ECG image (as received from the hospital)</Text>

        {/* ---------------- parameters ---------------- */}
        <View style={styles.sectionTitleRow} wrap={false}>
          <View style={styles.sectionBar} />
          <Text style={styles.sectionTitle}>Measured Parameters</Text>
        </View>
        <View style={styles.paramsGrid}>
          {params.map(([label, value], i) => (
            <View key={i} style={styles.paramCell} wrap={false}>
              <Text style={styles.paramLabel}>{label}</Text>
              <Text style={styles.paramValue}>{value}</Text>
            </View>
          ))}
        </View>
        <View style={{ height: 6 }} />

        {/* ---------------- per-lead readings table ---------------- */}
        {leadFindings.length > 0 && (
          <View>
            <View style={styles.sectionTitleRow} wrap={false}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionTitle}>Per-Lead Readings (12-Lead Individual Analysis)</Text>
            </View>
            <View style={styles.leadTable}>
              <View style={styles.leadTableHeader} wrap={false}>
                <Text style={[styles.leadTableHeaderText, { width: '9%' }]}>Lead</Text>
                <Text style={[styles.leadTableHeaderText, { width: '11%' }]}>SCP-ECG</Text>
                <Text style={[styles.leadTableHeaderText, { width: '66%' }]}>Lead Finding</Text>
                <Text style={[styles.leadTableHeaderText, { width: '14%', textAlign: 'right' }]}>Severity</Text>
              </View>
              {leadFindings.map((l, i) => (
                <View key={l.lead + i} style={styles.leadRow} wrap={false}>
                  <Text style={styles.leadCellLead}>{l.lead}</Text>
                  <Text style={styles.leadCellCode}>{l.scpCode || '—'}</Text>
                  <Text style={styles.leadCellFinding}>{l.finding}</Text>
                  <Text
                    style={[
                      styles.leadCellSeverity,
                      { color: SEV_COLOR[l.severity] ?? C.slate },
                    ]}
                  >
                    {l.severity || '—'}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={[styles.imageCaption, { marginBottom: 10 }]}>
              SCP-ECG codes per PTB-XL v1.0.3 (PhysioNet) reference statements
            </Text>
          </View>
        )}

        {/* ---------------- regional wall summary ---------------- */}
        {regionalSummary.length > 0 && (
          <View>
            <View style={styles.sectionTitleRow} wrap={false}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionTitle}>Regional Wall Summary</Text>
            </View>
            <View style={styles.regionGrid}>
              {regionalSummary.map((r, i) => {
                const vc = VERDICT_COLOR[r.verdict] ?? C.slate
                return (
                  <View
                    key={r.region + i}
                    style={[
                      styles.regionCard,
                      { borderColor: r.verdict === 'Abnormal' ? C.badBorder : r.verdict === 'Suggestive' ? C.warnBorder : C.border },
                    ]}
                    wrap={false}
                  >
                    <Text style={[styles.regionTitle, { color: vc }]}>{r.region}</Text>
                    {r.leads.length > 0 && (
                      <Text style={[styles.leadCellCode, { marginBottom: 2 }]}>
                        {`Leads: ${r.leads.join(', ')}`}
                      </Text>
                    )}
                    <Text style={styles.regionNote}>{r.note}</Text>
                    {r.evidenceLeads.length > 0 && (
                      <Text style={[styles.leadCellCode, { marginTop: 2 }]}>
                        {`Evidence: ${r.evidenceLeads.join(', ')} · ${r.verdict}`}
                      </Text>
                    )}
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* ---------------- cross-check card ---------------- */}
        {crossCheck && (
          <View style={styles.crossCheckBox} wrap={false}>
            <Text style={styles.crossCheckTitle}>
              {`Regional Consistency Cross-Check: ${crossCheck.regionalConsistency}`}
            </Text>
            <Text style={[styles.leadCellCode, { marginBottom: 4 }]}>{crossCheck.notes}</Text>
            {crossCheck.discrepancies.length > 0 && (
              <View>
                <Text style={[styles.crossCheckText, { fontWeight: 700, marginBottom: 3 }]}>
                  Discrepancies flagged:
                </Text>
                {crossCheck.discrepancies.map((d, i) => (
                  <View key={i} style={styles.crossCheckDisc} wrap={false}>
                    <View style={styles.crossCheckDiscDot} />
                    <Text style={styles.crossCheckDiscText}>{d}</Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={[styles.leadCellCode, { marginTop: crossCheck.discrepancies.length > 0 ? 4 : 0 }]}>
              Automated verification of per-lead findings vs regional statements against PTB-XL reference criteria
            </Text>
          </View>
        )}

        {/* ---------------- conclusion ---------------- */}
        <View style={[styles.conclusionBox, { borderColor: ns.border, backgroundColor: ns.bg, borderLeftColor: ns.color }]} wrap={false}>
          <View style={styles.conclusionHead}>
            <Text style={[styles.conclusionTitle, { color: ns.color }]}>{`Overall Result: ${ns.label}`}</Text>
          </View>
          <View style={styles.conclusionText}>
            <Text>{orDash(a.conclusion)}</Text>
          </View>
          <View style={styles.pillRow}>
            <View style={[styles.pill, { borderColor: ns.border }]}>
              <Text style={[styles.pillText, { color: ns.color }]}>{`Urgency: ${orDash(a.urgency)}`}</Text>
            </View>
            <View style={[styles.pill, { borderColor: ns.border }]}>
              <Text style={[styles.pillText, { color: ns.color }]}>{`Reading Confidence: ${orDash(a.confidence)}`}</Text>
            </View>
          </View>
        </View>

        {/* ---------------- findings ---------------- */}
        {findings.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <View style={styles.sectionTitleRow} wrap={false}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionTitle}>Detailed Findings</Text>
            </View>
            {findings.map((f, i) => (
              <View key={i} style={styles.listItemRow} wrap={false}>
                <View style={styles.listNumber}>
                  <Text style={styles.listNumberText}>{i + 1}</Text>
                </View>
                <View style={styles.listText}>
                  <Text>{f}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ---------------- recommendations ---------------- */}
        {recommendations.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <View style={styles.sectionTitleRow} wrap={false}>
              <View style={styles.sectionBar} />
              <Text style={styles.sectionTitle}>Recommendations</Text>
            </View>
            {recommendations.map((r, i) => (
              <View key={i} style={styles.listItemRow} wrap={false}>
                <View style={[styles.listNumber, { backgroundColor: C.slate }]}>
                  <Text style={styles.listNumberText}>{i + 1}</Text>
                </View>
                <View style={styles.listText}>
                  <Text>{r}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ---------------- clinical notes ---------------- */}
        {data.patient.clinicalNotes ? (
          <View style={styles.notesBox}>
            <Text style={[styles.paramLabel, { color: C.slate, marginBottom: 3 }]}>
              Clinical Notes Entered by the Physician
            </Text>
            <View style={styles.notesText}>
              <Text>{data.patient.clinicalNotes}</Text>
            </View>
          </View>
        ) : null}

        {/* ---------------- footer: fixed elements as DIRECT children of Page ---------------- */}
        <View style={styles.footerLine} fixed />
        <Text style={styles.footerNote} fixed>
          This report was generated with AI assistance via the AIECG platform. It is a decision-support
          tool for physicians and does not replace direct clinical evaluation or the treating
          physician's judgment.
        </Text>
        <Text
          style={styles.footerPage}
          fixed
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  )
}
