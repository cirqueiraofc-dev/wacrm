// ============================================================
// File extraction — images (via the account's AI vision model).
//
// wacrm is bring-your-own-key: rather than bundle a heavy OCR engine,
// image text is read by the same OpenAI/Anthropic model the account
// already configured for replies. `buildVisionRequest` is pure (so the
// request shape is unit-testable); `extractImageText` performs the call
// and reuses the AI module's error mapping so failures look identical to
// the rest of the app (invalid key → 401, timeout → 504, …).
// ============================================================

import type { AiConfig, AiUsage } from '@/lib/ai/types'
import {
  normalizeUsage,
  providerHttpError,
  toNetworkError,
} from '@/lib/ai/providers/shared'
import { aiRequestTimeoutMs } from '@/lib/ai/defaults'
import { ExtractError } from './types'

/** Cap on transcription length — plenty for a page of text while
 *  bounding token spend on the caller's own key. */
const MAX_VISION_TOKENS = 2048

/** Default instruction: transcribe verbatim, describe only if empty. */
export const DEFAULT_IMAGE_PROMPT =
  'Transcribe all text visible in this image exactly, preserving line breaks and reading order. ' +
  'Do not translate, summarize, or add commentary. ' +
  'If the image contains no readable text, briefly describe what it shows instead.'

export interface VisionRequest {
  url: string
  headers: Record<string, string>
  body: unknown
}

/**
 * Build the provider-specific HTTP request that sends one image + a text
 * prompt. Pure — no I/O — so tests can assert the exact payload each
 * provider receives. The image is inlined as a base64 data part.
 */
export function buildVisionRequest(args: {
  provider: AiConfig['provider']
  model: string
  apiKey: string
  prompt: string
  base64: string
  mimeType: string
}): VisionRequest {
  const { provider, model, apiKey, prompt, base64, mimeType } = args

  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: {
        model,
        max_tokens: MAX_VISION_TOKENS,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: base64,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      },
    }
  }

  // OpenAI Chat Completions with an inline data-URL image part.
  return {
    url: 'https://api.openai.com/v1/chat/completions',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model,
      max_completion_tokens: MAX_VISION_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
    },
  }
}

interface AnthropicVisionResponse {
  content?: { type?: string; text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}
interface OpenAiVisionResponse {
  choices?: { message?: { content?: string } }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/** Pull the assistant text out of either provider's response body. */
function parseVisionText(provider: AiConfig['provider'], data: unknown): string {
  if (provider === 'anthropic') {
    const d = data as AnthropicVisionResponse | null
    return (
      d?.content
        ?.filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('')
        .trim() ?? ''
    )
  }
  const d = data as OpenAiVisionResponse | null
  return d?.choices?.[0]?.message?.content?.trim() ?? ''
}

/** Normalize either provider's usage block into our shared shape. */
function parseVisionUsage(
  provider: AiConfig['provider'],
  data: unknown,
): AiUsage | null {
  if (provider === 'anthropic') {
    const u = (data as AnthropicVisionResponse | null)?.usage
    return normalizeUsage({ prompt: u?.input_tokens, completion: u?.output_tokens })
  }
  const u = (data as OpenAiVisionResponse | null)?.usage
  return normalizeUsage({
    prompt: u?.prompt_tokens,
    completion: u?.completion_tokens,
    total: u?.total_tokens,
  })
}

export interface ImageExtraction {
  text: string
  usage: AiUsage | null
}

/**
 * Read text from an image using the account's configured vision model.
 * Requires an active AI config — the route surfaces `ai_not_configured`
 * when there is none, since (unlike PDF/Excel) images have no local
 * fallback.
 */
export async function extractImageText(
  bytes: Uint8Array,
  mimeType: string,
  config: AiConfig,
  prompt: string = DEFAULT_IMAGE_PROMPT,
): Promise<ImageExtraction> {
  const base64 = Buffer.from(bytes).toString('base64')
  const req = buildVisionRequest({
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    prompt,
    base64,
    mimeType,
  })

  let res: Response
  try {
    res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(aiRequestTimeoutMs()),
    })
  } catch (err) {
    // toNetworkError returns an AiError (code/status); rethrow as-is so
    // the route's error mapper handles it uniformly.
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError(
      config.provider === 'anthropic' ? 'Anthropic' : 'OpenAI',
      res,
    )
  }

  const data = await res.json().catch(() => null)
  const text = parseVisionText(config.provider, data)
  if (!text) {
    throw new ExtractError('The AI model returned no text for this image.', {
      code: 'image_empty_response',
      status: 502,
    })
  }
  return { text, usage: parseVisionUsage(config.provider, data) }
}
