import { AiError, type ChatMessage, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  toNetworkError,
  type ProviderArgs,
} from './shared'

// Google Gemini via the Generative Language API. Chosen because it has a
// genuinely free API tier (a Google AI Studio key), so an operator can run
// the assistant without any paid provider. The request shape differs from
// OpenAI/Anthropic: roles are `user`/`model`, the system prompt is a
// separate `systemInstruction`, and the key travels in a header.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiPart {
  text?: string
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
  promptFeedback?: { blockReason?: string }
}

/**
 * Gemini requires `contents` to start with a `user` turn and use the
 * roles `user`/`model`. Merge consecutive same-role turns, map
 * `assistant` → `model`, and drop any leading model turns (an agent
 * greeting before the customer spoke) so the transcript always opens on
 * the customer. Guarantees a valid, non-empty payload.
 */
function toGeminiContents(messages: ChatMessage[]) {
  const merged = mergeConsecutive(messages)
  while (merged.length > 0 && merged[0].role === 'assistant') {
    merged.shift()
  }
  const source =
    merged.length > 0
      ? merged
      : [{ role: 'user' as const, content: '(The customer has not sent a message yet.)' }]
  return source.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
}

/**
 * Turn a non-2xx Gemini response into a typed AiError. Gemini reports an
 * invalid/again-restricted key as HTTP 400/403 with an `API_KEY_INVALID`
 * / `PERMISSION_DENIED` body (unlike OpenAI/Anthropic's 401), so we map
 * those to `invalid_key` (status 401) explicitly — that's what the
 * settings "Test key" button keys off.
 */
async function geminiHttpError(res: Response): Promise<AiError> {
  let detail = ''
  let reason = ''
  try {
    const body = (await res.json()) as {
      error?: { message?: string; status?: string }
    }
    detail = body?.error?.message ?? ''
    reason = body?.error?.status ?? ''
  } catch {
    // Non-JSON error body — fall back to the status line.
  }

  const looksLikeBadKey =
    res.status === 401 ||
    res.status === 403 ||
    reason === 'PERMISSION_DENIED' ||
    reason === 'UNAUTHENTICATED' ||
    /api[\s_-]?key/i.test(detail)

  if (looksLikeBadKey) {
    return new AiError(
      detail ? `Google rejected the API key: ${detail}` : 'Google rejected the API key',
      { code: 'invalid_key', status: 401 },
    )
  }
  if (res.status === 429) {
    return new AiError(
      detail ? `Google rate limit reached: ${detail}` : 'Google rate limit reached',
      { code: 'rate_limited', status: 502 },
    )
  }
  return new AiError(
    detail ? `Google API error (${res.status}): ${detail}` : `Google API error (${res.status})`,
    { code: 'provider_error', status: 502 },
  )
}

/**
 * Call Gemini's `generateContent` endpoint with the caller's own key.
 * Returns the raw assistant text + token usage (handoff parsing happens
 * in `generateReply`).
 */
export async function generateGoogle(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args

  let res: Response
  try {
    res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: toGeminiContents(messages),
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await geminiHttpError(res)
  }

  const data = (await res.json().catch(() => null)) as GeminiResponse | null
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim()
  if (!text) {
    // A safety block returns 200 with no candidate text — surface it as a
    // distinct, actionable error rather than a bare "empty response".
    const blocked = data?.promptFeedback?.blockReason
    throw new AiError(
      blocked
        ? `Gemini blocked the response (${blocked}).`
        : 'Gemini returned an empty response.',
      { code: blocked ? 'content_blocked' : 'empty_response' },
    )
  }

  const usage = normalizeUsage({
    prompt: data?.usageMetadata?.promptTokenCount,
    completion: data?.usageMetadata?.candidatesTokenCount,
    total: data?.usageMetadata?.totalTokenCount,
  })
  return { text, usage }
}
