import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifyPassword, createSession, sessionCookieOptions } from '@/lib/auth'

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || 'Incomplete data'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const { email, password } = parsed.data

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Incorrect email address or password' }, { status: 401 })
    }

    const token = await createSession(user.id)
    const res = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        doctorName: user.doctorName,
        hospitalName: user.hospitalName,
        specialty: user.specialty,
        createdAt: user.createdAt,
      },
    })
    res.cookies.set({ ...sessionCookieOptions(), value: token })
    return res
  } catch (e) {
    console.error('login error:', e)
    return NextResponse.json({ error: 'An error occurred while signing in, please try again' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
