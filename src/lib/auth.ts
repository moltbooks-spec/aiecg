import { db } from '@/lib/db'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

export const SESSION_COOKIE = 'aiecg_session'
const SESSION_DAYS = 7

// ---------------- password hashing (scrypt) ----------------
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

// ---------------- sessions ----------------
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(48).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.session.create({ data: { token, userId, expiresAt } })
  return token
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  }
}

export interface SessionUser {
  id: string
  email: string
  doctorName: string
  hospitalName: string
  specialty: string | null
  createdAt: Date
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (!token) return null
    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    })
    if (!session) return null
    if (session.expiresAt < new Date()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {})
      return null
    }
    const u = session.user
    return {
      id: u.id,
      email: u.email,
      doctorName: u.doctorName,
      hospitalName: u.hospitalName,
      specialty: u.specialty,
      createdAt: u.createdAt,
    }
  } catch {
    return null
  }
}

/** For requests arriving via NextRequest (route handlers) */
export async function getSessionUserFromRequest(req: NextRequest): Promise<SessionUser | null> {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value
    if (!token) return null
    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    })
    if (!session) return null
    if (session.expiresAt < new Date()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {})
      return null
    }
    const u = session.user
    return {
      id: u.id,
      email: u.email,
      doctorName: u.doctorName,
      hospitalName: u.hospitalName,
      specialty: u.specialty,
      createdAt: u.createdAt,
    }
  } catch {
    return null
  }
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return
  await db.session.deleteMany({ where: { token } }).catch(() => {})
}
