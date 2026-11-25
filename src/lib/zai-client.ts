/**
 * Thin HTTP client for the z.ai chat/vision API — drop-in replacement for
 * z-ai-web-dev-sdk's chat.completions.createVision().
 *
 * Why: the SDK reads its config ONLY from a .z-ai-config file at <cwd>,
 * <homedir> or /etc — all absent or read-only on serverless hosts (Vercel).
 * This client keeps the exact same wire format (endpoint, headers, request
 * and response shape) but resolves credentials from, in order:
 *   1. a .z-ai-config file (sandbox / CLI host — same files the SDK checks)
 *   2. ZAI_* environment variables (Vercel)
 *
 * Only the surface the app uses is implemented: createVision().
 */
import { existsSync, readFileSync } from 'fs'
import os from 'os'
import path from 'path'

interface ZaiCreds {
  baseUrl: string
  apiKey: string
  chatId?: string
  userId?: string
  token?: string
}

let cachedCreds: ZaiCreds | null = null

/** Resolve credentials from config file or ZAI_* env vars. */
export function zaiCreds(): ZaiCreds {
  if (cachedCreds) return cachedCreds

  // 1) config file — the same candidates the SDK itself checks
  const candidates = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ]
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue
      const cfg = JSON.parse(readFileSync(p, 'utf-8'))
      if (cfg.baseUrl && cfg.apiKey) {
        cachedCreds = {
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          chatId: cfg.chatId,
          userId: cfg.userId,
          token: cfg.token,
        }
        return cachedCreds
      }
    } catch {
      // try next candidate
    }
  }

  // 2) environment (serverless hosts)
  if (process.env.ZAI_API_KEY) {
    cachedCreds = {
      baseUrl: process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1',
      apiKey: process.env.ZAI_API_KEY,
      chatId: process.env.ZAI_CHAT_ID,
      userId: process.env.ZAI_USER_ID,
      token: process.env.ZAI_TOKEN,
    }
    return cachedCreds
  }

  throw new Error(
    'z-ai credentials unavailable: no .z-ai-config file and ZAI_API_KEY is not set'
  )
}

export interface VisionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
}

interface VisionChoice {
  message?: { content?: string | null }
}

/**
 * Send a vision chat completion.
 *
 * Two wire formats, auto-selected by endpoint:
 *  - internal (internal-api.z.ai): POST {baseUrl}/chat/completions/vision
 *    with X-Z-AI-From / X-Chat-Id headers (this sandbox).
 *  - public (api.z.ai open platform, OpenAI-compatible): POST {baseUrl}/chat/completions
 *    with plain Bearer auth — used when ZAI_BASE_URL points at the public API,
 *    e.g. https://api.z.ai/api/paas/v4 (serverless hosts like Vercel).
 *
 * @throws Error with a descriptive message on connection or API failure.
 */
export async function zaiCreateVision(body: {
  model: string
  messages: VisionMessage[]
  thinking?: { type: 'disabled' | 'enabled' }
}): Promise<{ choices: VisionChoice[] }> {
  const creds = zaiCreds()
  const internal = /internal-api\.z\.ai/.test(creds.baseUrl)
  const base = creds.baseUrl.replace(/\/$/, '')
  const url = internal ? `${base}/chat/completions/vision` : `${base}/chat/completions`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${creds.apiKey}`,
  }
  if (internal) {
    headers['X-Z-AI-From'] = 'Z'
    if (creds.chatId) headers['X-Chat-Id'] = creds.chatId
    if (creds.userId) headers['X-User-Id'] = creds.userId
    if (creds.token) headers['X-Token'] = creds.token
  }

  const requestBody = { ...body, thinking: body.thinking ?? { type: 'disabled' } }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })
  } catch (e) {
    throw new Error(`vision API connection failed: ${(e as Error).message}`)
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(
      `vision API request failed with status ${response.status}: ${errorBody.slice(0, 300)}`
    )
  }

  return (await response.json()) as { choices: VisionChoice[] }
}
