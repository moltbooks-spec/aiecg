import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, destroySession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  await destroySession(token)
  const res = NextResponse.json({ ok: true })
  res.cookies.set({ name: SESSION_COOKIE, value: '', httpOnly: true, path: '/', maxAge: 0 })
  return res
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
