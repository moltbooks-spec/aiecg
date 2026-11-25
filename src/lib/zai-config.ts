/**
 * Runtime bootstrap for the z-ai-web-dev-sdk on hosts without a
 * pre-installed config file (e.g. Vercel serverless).
 *
 * The SDK reads a JSON config from:
 *   1. <cwd>/.z-ai-config
 *   2. <homedir>/.z-ai-config
 *   3. /etc/.z-ai-config
 * and throws if none exists. On this sandbox /etc/.z-ai-config exists, but a
 * fresh Vercel build has nothing. This module materializes the file from the
 * ZAI_* environment variables BEFORE the SDK first loads, so the same code
 * runs everywhere. It is a no-op when a config file already exists.
 *
 * Environment variables (all optional except ZAI_API_KEY):
 *   ZAI_BASE_URL  (default https://internal-api.z.ai/v1)
 *   ZAI_API_KEY   (required)
 *   ZAI_CHAT_ID, ZAI_USER_ID, ZAI_TOKEN, ZAI_STAGE  (optional passthrough)
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'

let ensured = false

/** Write .z-ai-config from env once per process (idempotent, best-effort). */
export function ensureZaiConfig(): { ok: boolean; reason?: string } {
  if (ensured) return { ok: true }
  ensured = true

  const candidates = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ]

  // already configured (sandbox/CLI host) — nothing to do
  if (candidates.some((p) => existsSync(p))) return { ok: true }

  const apiKey = process.env.ZAI_API_KEY
  if (!apiKey) {
    return { ok: false, reason: 'z-ai config missing and ZAI_API_KEY is not set' }
  }

  const config = {
    baseUrl: process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1',
    apiKey,
    ...(process.env.ZAI_CHAT_ID && { chatId: process.env.ZAI_CHAT_ID }),
    ...(process.env.ZAI_USER_ID && { userId: process.env.ZAI_USER_ID }),
    ...(process.env.ZAI_TOKEN && { token: process.env.ZAI_TOKEN }),
    ...(process.env.ZAI_STAGE && { stage: process.env.ZAI_STAGE }),
  }

  try {
    // cwd is read-only on some serverless runtimes; home dir is writable on
    // Vercel's Node runtime and is the SDK's 2nd lookup path.
    const home = os.homedir()
    const target = path.join(home, '.z-ai-config')
    writeFileSync(target, JSON.stringify(config), { mode: 0o600 })
    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed to write z-ai config at runtime' }
  }
}
