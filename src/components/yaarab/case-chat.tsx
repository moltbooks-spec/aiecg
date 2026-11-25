'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import {
  BrainCircuit,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  ShieldAlert,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatMessageDTO {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

const SUGGESTIONS = [
  'Walk me through the per-lead readings — which leads drive the conclusion?',
  'Which regional wall is most concerning here, and what is the evidence from individual leads?',
  'Could the V1–V3 changes represent a posterior (mirror) pattern rather than a primary septal issue?',
  'What reciprocal changes should I verify between inferior (II/III/aVF) and high-lateral (I/aVL) leads?',
  'What would you measure differently on a follow-up ECG for this patient?',
]

/** Renders message content with simple paragraph handling */
function MessageBody({ content }: { content: string }) {
  const paragraphs = content.split(/\n{2,}/).filter(Boolean)
  return (
    <div className="space-y-2">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap leading-relaxed">
          {p.replace(/^\s*[-*•]\s+/, '• ')}
        </p>
      ))}
    </div>
  )
}

export function CaseChat({ caseId, disabled }: { caseId: string; disabled?: boolean }) {
  const { toast } = useToast()
  const [messages, setMessages] = useState<ChatMessageDTO[] | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [historyVersion, setHistoryVersion] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}/chat`)
      if (res.status === 409) {
        setMessages([])
        return
      }
      if (!res.ok) throw new Error()
      const json = await res.json()
      setMessages(json.messages as ChatMessageDTO[])
    } catch {
      setMessages([])
    }
  }, [caseId])

  useEffect(() => {
    load()
  }, [load, historyVersion])

  // Auto-scroll to the latest message
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || sending || disabled) return
    setSending(true)
    setInput('')
    try {
      const res = await fetch(`/api/cases/${caseId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'The assistant could not respond', description: json.error, variant: 'destructive' })
        // Still show the persisted user message if the server saved it
        if (json.userMessage) {
          setMessages((prev) => [...(prev ?? []), json.userMessage as ChatMessageDTO])
        }
        return
      }
      setMessages((prev) => [
        ...(prev ?? []),
        json.userMessage as ChatMessageDTO,
        json.assistantMessage as ChatMessageDTO,
      ])
    } catch {
      toast({ title: 'Network error', description: 'Could not reach the server, please try again', variant: 'destructive' })
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  return (
    <Card className="border-slate-200" id="case-chat">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-extrabold flex items-center gap-2">
          <MessageSquare className="h-4.5 w-4.5 text-teal-700" />
          Discuss This Case with AI
          <span className="ms-auto text-[11px] font-medium text-slate-400">
            Cardiology consultation
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ---------- Message area ---------- */}
        <div
          ref={scrollRef}
          className="h-[380px] overflow-y-auto nice-scroll rounded-xl border border-slate-100 bg-slate-50/60 p-4 space-y-4"
        >
          {messages === null ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
                  <div className="h-12 w-2/3 rounded-2xl bg-slate-200/70" />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 border border-teal-100">
                <BrainCircuit className="h-7 w-7 text-teal-700" />
              </div>
              <p className="font-bold text-slate-700">Start the discussion</p>
              <p className="text-sm text-slate-500 mt-1 max-w-sm leading-relaxed">
                Ask anything about this case — findings, differential diagnoses, measurements,
                follow-up plan. The AI consultant sees the full report and the ECG image.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex gap-2.5 animate-chat-in', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {m.role === 'assistant' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white mt-0.5">
                    <BrainCircuit className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
                    m.role === 'user'
                      ? 'bg-teal-700 text-white rounded-br-md'
                      : 'bg-white border border-slate-200 text-slate-700 shadow-sm rounded-bl-md'
                  )}
                >
                  {m.role === 'user' ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  ) : (
                    <MessageBody content={m.content} />
                  )}
                </div>
                {m.role === 'user' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 mt-0.5">
                    <UserRound className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))
          )}

          {/* Typing indicator while the model is answering */}
          {sending && (
            <div className="flex gap-2.5 justify-start animate-chat-in">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white mt-0.5">
                <BrainCircuit className="h-4 w-4" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-white border border-slate-200 px-4 py-3 shadow-sm flex items-center gap-1.5 h-11">
                <span className="typing-dot h-2 w-2 rounded-full bg-teal-500" />
                <span className="typing-dot h-2 w-2 rounded-full bg-teal-500" />
                <span className="typing-dot h-2 w-2 rounded-full bg-teal-500" />
              </div>
            </div>
          )}
        </div>

        {/* ---------- Suggested questions (only when empty) ---------- */}
        {messages != null && messages.length === 0 && !sending && !disabled && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-teal-200 bg-teal-50/70 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100 transition-colors text-start"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* ---------- Input ---------- */}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <Input
            ref={inputRef}
            placeholder={disabled ? 'Chat available after analysis completes' : 'Ask about this case...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={disabled || sending}
            className="bg-white"
            maxLength={4000}
          />
          <Button
            type="submit"
            disabled={disabled || sending || !input.trim()}
            className="font-bold bg-teal-700 hover:bg-teal-800 shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">Send</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || sending || (messages ?? []).length === 0}
            onClick={() => setHistoryVersion((v) => v + 1)}
            className="shrink-0"
            title="Reload conversation"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </form>

        <p className="text-[11px] text-slate-400 flex items-start gap-1.5 leading-relaxed">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
          AI consultation is decision support only — final diagnosis and treatment remain with the
          treating physician.
        </p>
      </CardContent>
    </Card>
  )
}
