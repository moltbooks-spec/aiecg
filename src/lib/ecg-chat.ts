/**
 * AI case discussion chat engine — server-side only.
 * Lets the physician discuss a completed ECG case with the AI: the model receives
 * the full case context (patient data, analysis results, the ECG image itself)
 * plus the conversation history, and answers as a consulting cardiologist.
 */
import { zaiCreateVision } from '@/lib/zai-client'
import { sanitizeMedicalText } from '@/lib/text-sanitize'
import type { EcgCase } from '@prisma/client'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

const CHAT_SYSTEM_PROMPT = `You are AIECG's consulting cardiologist, an AI assistant specialized in electrocardiography, discussing a completed ECG case with the treating physician.

Your behavior:
1. You are given the patient's data, the full AI analysis results of their ECG, and the ECG image itself. Ground every answer in this context; when referencing specific findings, quote the values given.
2. Answer in clear, professional medical English. Be concise but complete — short paragraphs or compact bullet lists.
3. You may discuss: differential diagnoses, how a specific measurement was derived, what to look for in follow-up ECGs, risk stratification, next investigations, and management considerations.
4. Be honest about uncertainty: if something cannot be determined from the tracing, say so plainly rather than guessing.
5. Always keep the safety framing: AIECG is a decision-support tool; final diagnosis and treatment remain with the treating physician. Mention this when the discussion approaches management decisions.
6. Never invent patient history, symptoms or lab values that were not provided. You may say what additional information would help.
7. Keep answers focused on the case at hand; if asked something unrelated to cardiology or this patient, politely steer back to the case.`

function caseContext(c: EcgCase): string {
  const lines: string[] = [
    '=== CASE CONTEXT ===',
    `Case number: ${c.caseNumber}`,
    `Patient: ${c.patientName}, ${c.patientAge} years, ${c.patientGender}.`,
  ]
  if (c.patientId) lines.push(`Patient ID: ${c.patientId}`)
  if (c.bloodPressure) lines.push(`Blood pressure: ${c.bloodPressure}`)
  if (c.clinicalNotes) lines.push(`Clinical notes: ${c.clinicalNotes}`)
  lines.push('--- AI ECG analysis ---')
  if (c.heartRate != null) lines.push(`Heart rate: ${c.heartRate} bpm`)
  if (c.rhythm) lines.push(`Rhythm: ${c.rhythm}`)
  if (c.pWave) lines.push(`P wave: ${c.pWave}`)
  if (c.prInterval) lines.push(`PR interval: ${c.prInterval}`)
  if (c.qrsDuration) lines.push(`QRS duration: ${c.qrsDuration}`)
  if (c.qtInterval) lines.push(`QT interval: ${c.qtInterval}`)
  if (c.qtcInterval) lines.push(`QTc interval: ${c.qtcInterval}`)
  if (c.axis) lines.push(`Axis: ${c.axis}`)
  if (c.stSegment) lines.push(`ST segment / T wave: ${c.stSegment}`)
  if (c.quality) lines.push(`Recording quality: ${c.quality}`)
  if (c.normality) lines.push(`Overall assessment: ${c.normality}`)
  if (c.urgency) lines.push(`Urgency: ${c.urgency}`)
  if (c.confidence) lines.push(`Analysis confidence: ${c.confidence}`)
  if (c.conclusion) lines.push(`Conclusion: ${c.conclusion}`)
  if (c.findingsJson) {
    try {
      const f = JSON.parse(c.findingsJson)
      if (Array.isArray(f) && f.length) lines.push(`Findings:\n- ${f.filter(Boolean).join('\n- ')}`)
    } catch {
      /* ignore */
    }
  }
  if (c.recommendationsJson) {
    try {
      const r = JSON.parse(c.recommendationsJson)
      if (Array.isArray(r) && r.length) lines.push(`Recommendations:\n- ${r.filter(Boolean).join('\n- ')}`)
    } catch {
      /* ignore */
    }
  }
  // ---- per-lead readings (PTB-XL anchored) ----
  if (c.leadFindingsJson) {
    try {
      const lf = JSON.parse(c.leadFindingsJson)
      if (Array.isArray(lf) && lf.length) {
        lines.push('--- Per-lead readings (SCP-ECG anchored, PTB-XL) ---')
        for (const l of lf) {
          if (l && typeof l === 'object' && typeof l.lead === 'string') {
            lines.push(`- ${l.lead} [${l.severity ?? '—'}${l.scpCode ? `, SCP ${l.scpCode}` : ''}]: ${l.finding ?? ''}`)
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (c.regionalSummaryJson) {
    try {
      const rs = JSON.parse(c.regionalSummaryJson)
      if (Array.isArray(rs) && rs.length) {
        lines.push('--- Regional wall summary ---')
        for (const r of rs) {
          if (r && typeof r === 'object' && typeof r.region === 'string') {
            lines.push(`- ${r.region} (${Array.isArray(r.leads) ? r.leads.join('/') : ''}): ${r.verdict ?? '—'} — ${r.note ?? ''}`)
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (c.crossCheckJson) {
    try {
      const cc = JSON.parse(c.crossCheckJson)
      if (cc && typeof cc === 'object') {
        lines.push(`Regional cross-check: ${cc.regionalConsistency ?? '—'}`)
        if (Array.isArray(cc.discrepancies) && cc.discrepancies.length) {
          lines.push(`Discrepancies:\n- ${cc.discrepancies.filter(Boolean).join('\n- ')}`)
        }
      }
    } catch {
      /* ignore */
    }
  }
  lines.push('=== END CASE CONTEXT ===')
  return lines.join('\n')
}

/**
 * Sends the physician's message to the model and returns the reply text.
 * The model sees: system prompt + case context + ECG image + prior chat history.
 * Uses createVision because the ECG image is part of the context.
 */
export async function chatAboutCase(
  c: EcgCase,
  history: ChatTurn[]
): Promise<string> {

  const visionContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [
    { type: 'text', text: caseContext(c) },
    { type: 'image_url', image_url: { url: `data:${c.imageMimeType};base64,${c.imageBase64}` } },
    {
      type: 'text',
      text: 'The physician will now ask questions about this case. Answer as the consulting cardiologist described in your instructions.',
    },
  ]

  const messages = [
    { role: 'system' as const, content: CHAT_SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: visionContent,
    },
    // Prior conversation turns (already persisted, oldest first)
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ]

  const response = await zaiCreateVision({
    messages,
    thinking: { type: 'disabled' },
  })

  const raw = response.choices[0]?.message?.content
  if (!raw || !raw.trim()) throw new Error('No response received from the assistant')

  return stripMarkdown(sanitizeMedicalText(raw)).trim()
}

/** Convert common markdown formatting to plain text for the chat UI */
function stripMarkdown(text: string): string {
  let out = text
  // Bold / italic markers
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
  out = out.replace(/__([^_]+)__/g, '$1').replace(/_([^_]+)_/g, '$1')
  // Headings -> plain lines
  out = out.replace(/^#{1,6}\s+/gm, '')
  // Inline code and code fences
  out = out.replace(/`([^`]+)`/g, '$1').replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?|```/g, ''))
  // Bullet markers -> uniform bullet
  out = out.replace(/^\s*[-*•]\s+/gm, '• ')
  return out
}
