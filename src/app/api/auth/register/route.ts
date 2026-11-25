import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, createSession, sessionCookieOptions } from '@/lib/auth'

const registerSchema = z.object({
  doctorName: z.string().trim().min(2, 'Physician name is required (at least 2 characters)').max(80),
  hospitalName: z.string().trim().min(2, 'Hospital or center name is required').max(120),
  specialty: z.string().trim().max(60).optional().or(z.literal('')),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || 'Incomplete data'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const { doctorName, hospitalName, specialty, email, password } = parsed.data

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'This email address is already registered' }, { status: 409 })
    }

    const user = await db.user.create({
      data: {
        email,
        doctorName,
        hospitalName,
        specialty: specialty && specialty !== '' ? specialty : null,
        passwordHash: hashPassword(password),
      },
    })

    const token = await createSession(user.id)
    const res = NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          doctorName: user.doctorName,
          hospitalName: user.hospitalName,
          specialty: user.specialty,
          createdAt: user.createdAt,
        },
      },
      { status: 201 }
    )
    res.cookies.set({ ...sessionCookieOptions(), value: token })
    return res
  } catch (e) {
    console.error('register error:', e)
    return NextResponse.json({ error: 'An error occurred while creating the account, please try again' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
