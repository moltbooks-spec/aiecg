/**
 * Vision-model client for the ECG reader — one call, multiple providers.
 *
 * Providers, tried in order until one answers:
 *   1. OpenRouter (OpenAI-compatible, OpenRouter_API_KEY env) — primary on
 *      serverless hosts. Model chain: nemotron-3.5-super-vl (best ECG
 *      reading in tests) → ling-3.2-flash → gemma-4-31b (rate-limit
 *      fallbacks).
 *   2. z.ai internal API (.z-ai-config file or ZAI_* env) — primary on the
 *      sandbox/CLI host (glm-4.5v).
 *
 * The wire format follows each provider's OpenAI-compatible
 * chat/completions endpoint; the response is normalized to
 * { choices: [{ message: { content } }] } everywhere.
 */
import { existsSync, readFileSync } from 'fs'
import os from 'os'
import path from 'path'

// ---------------------------------------------------------------- types

export interface VisionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
}

interface VisionChoice {
  message?: { content?: string | null }
}

export interface VisionResponse {
  choices: VisionChoice[]
  model?: string
}

interface Provider {
  name: string
  model: string
  url: string
  headers: Record<string, string>
}

// ---------------------------------------------------------------- providers

/** OpenRouter model chain, ordered by ECG reading quality (tested). */
const OPENROUTER_MODELS = [
  'nvidia/nemotron-3.5-super-vl:free',
  'inclusionai/ling-3.2-flash:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
]

interface ZaiCreds {
  baseUrl: string
  apiKey: string
  chatId?: string
  userId?: string
  token?: string
}

let cachedZai: ZaiCreds | null = null

/** z.ai credentials from config file or ZAI_* env (null when absent). */
function zaiCreds(): ZaiCreds | null {
  if (cachedZai) return cachedZai
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
        cachedZai = {
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          chatId: cfg.chatId,
          userId: cfg.userId,
          token: cfg.token,
        }
        return cachedZai
      }
    } catch {
      // try next candidate
    }
  }
  if (process.env.ZAI_API_KEY) {
    cachedZai = {
      baseUrl: process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1',
      apiKey: process.env.ZAI_API_KEY,
      chatId: process.env.ZAI_CHAT_ID,
      userId: process.env.ZAI_USER_ID,
      token: process.env.ZAI_TOKEN,
    }
    return cachedZai
  }
  return null
}

/** Build the provider chain for this request (OpenRouter first on serverless). */
function providerChain(): Provider[] {
  const chain: Provider[] = []

  const orKey = process.env.OPENROUTER_API_KEY
  if (orKey) {
    for (const model of OPENROUTER_MODELS) {
      chain.push({
        name: `openrouter:${model}`,
        model,
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${orKey}`,
          'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://aiecg.app',
          'X-Title': 'AIECG',
        },
      })
    }
  }

  const zai = zaiCreds()
  if (zai) {
    const internal = /internal-api\.z\.ai/.test(zai.baseUrl)
    const base = zai.baseUrl.replace(/\/$/, '')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${zai.apiKey}`,
    }
    if (internal) {
      headers['X-Z-AI-From'] = 'Z'
      if (zai.chatId) headers['X-Chat-Id'] = zai.chatId
      if (zai.userId) headers['X-User-Id'] = zai.userId
      if (zai.token) headers['X-Token'] = zai.token
    }
    chain.push({
      name: `zai:${internal ? 'glm-4.5v' : 'glm-4.5v'}`,
      model: 'glm-4.5v',
      url: internal ? `${base}/chat/completions/vision` : `${base}/chat/completions`,
      headers,
    })
  }

  return chain
}

// ---------------------------------------------------------------- call

/**
 * Send a vision chat completion across the provider chain.
 * @throws Error listing every provider failure when all of them fail.
 */
export async function zaiCreateVision(body: {
  model?: string
  messages: VisionMessage[]
  thinking?: { type: 'disabled' | 'enabled' }
}): Promise<VisionResponse> {
  const chain = providerChain()
  if (chain.length === 0) {
    throw new Error(
      'no AI provider configured: set OPENROUTER_API_KEY (or ZAI_API_KEY) in the environment'
    )
  }

  const errors: string[] = []
  for (const p of chain) {
    const requestBody: Record<string, unknown> = {
      model: body.model || p.model,
      messages: body.messages,
    }
    // thinking is a z.ai extension; OpenRouter providers ignore extras but
    // some reject unknown fields, so only send it to z.ai.
    if (p.name.startsWith('zai:')) {
      requestBody.thinking = body.thinking ?? { type: 'disabled' }
    }

    let response: Response
    try {
      response = await fetch(p.url, {
        method: 'POST',
        headers: p.headers,
        body: JSON.stringify(requestBody),
      })
    } catch (e) {
      errors.push(`${p.name}: connection failed (${(e as Error).message})`)
      continue
    }

    if (!response.ok) {
      const t = await response.text().catch(() => '')
      errors.push(`${p.name}: HTTP ${response.status} ${t.slice(0, 160)}`)
      continue // try the next model/provider
    }

    const json = (await response.json()) as VisionResponse
    const content = json.choices?.[0]?.message?.content
    if (!content) {
      errors.push(`${p.name}: empty response`)
      continue
    }
    return json
  }

  throw new Error(`all AI providers failed — ${errors.join(' | ')}`)
}
