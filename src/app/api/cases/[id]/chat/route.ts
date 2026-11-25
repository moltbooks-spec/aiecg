import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionUserFromRequest } from '@/lib/auth'
import { chatAboutCase } from '@/lib/ecg-chat'

export const maxDuration = 300

const listSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(4000),
})

/** GET: chat history for a case */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const c = await db.ecgCase.findFirst({ where: { id, userId: user.id } })
  if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  if (c.status !== 'completed') {
    return NextResponse.json({ error: 'Chat is available only after the analysis completes' }, { status: 409 })
  }

  const messages = await db.chatMessage.findMany({
    where: { caseId: id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, content: true, createdAt: true },
  })

  return NextResponse.json({ messages })
}

/** POST: send a message and get the AI reply */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const c = await db.ecgCase.findFirst({ where: { id, userId: user.id } })
  if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  if (c.status !== 'completed') {
    return NextResponse.json({ error: 'Chat is available only after the analysis completes' }, { status: 409 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const parsed = listSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || 'Invalid message'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Persist the user message first
  const userMsg = await db.chatMessage.create({
    data: { caseId: id, role: 'user', content: parsed.data.message },
    select: { id: true, role: true, content: true, createdAt: true },
  })

  // Load history BEFORE the just-saved message; the new message goes as the final user turn
  const prior = await db.chatMessage.findMany({
    where: { caseId: id },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true, createdAt: true },
  })
  // prior includes userMsg as the last element
  const history = prior.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  try {
    const reply = await chatAboutCase(c, history)

    const assistantMsg = await db.chatMessage.create({
      data: { caseId: id, role: 'assistant', content: reply },
      select: { id: true, role: true, content: true, createdAt: true },
    })

    return NextResponse.json({ userMessage: userMsg, assistantMessage: assistantMsg })
  } catch (e) {
    console.error('chat failed:', (e as Error)?.message)
    return NextResponse.json(
      { error: 'The assistant could not respond. Please try again.', userMessage: userMsg },
      { status: 502 }
    )
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
