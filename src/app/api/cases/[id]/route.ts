import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUserFromRequest } from '@/lib/auth'
import { serializeCase } from '@/lib/cases'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const c = await db.ecgCase.findFirst({
    where: { id, userId: user.id },
    include: { user: { select: { doctorName: true, hospitalName: true } }, feedbacks: { where: { userId: user.id } } },
  })
  if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  return NextResponse.json({ case: serializeCase(c, true) })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const c = await db.ecgCase.findFirst({ where: { id, userId: user.id } })
  if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  await db.ecgCase.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
