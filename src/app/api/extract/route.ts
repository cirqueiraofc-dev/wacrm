import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadAiConfig } from '@/lib/ai/config'
import { AiError } from '@/lib/ai/types'
import {
  extractFile,
  ExtractError,
  MAX_FILE_BYTES,
  SUPPORTED_HINT,
} from '@/lib/extract'

// The spreadsheet reader (`read-excel-file/node`) uses `node:stream` /
// `node:fs` and Buffer, so this route must run on the Node.js runtime,
// not Edge. It's the default, but pinned here to make the requirement
// explicit. maxDuration gives large PDFs and the image vision call room.
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/extract  (agent+)
 *
 * Read the text/data out of an uploaded file — PDF, image, or Excel
 * spreadsheet — and return it as JSON. This is the dashboard-side entry
 * point (session-authenticated, RLS-scoped); the heavy lifting lives in
 * pure functions under `@/lib/extract` so it stays unit-testable.
 *
 * Request: multipart/form-data with a `file` field.
 * Optional `prompt` field overrides the image transcription instruction.
 *
 * Response: { data: ExtractResult }.
 *   - PDF  → { kind, text, meta: { pages } }
 *   - image → { kind, text, meta: { usage, model } }   (uses the account's AI key)
 *   - spreadsheet → { kind, text, sheets: [{ name, rows }], meta }
 *
 * Notes:
 *   - Images have no local fallback, so they need an active AI config
 *     (Settings → AI). PDF/Excel never touch the AI key.
 *   - Errors use the dashboard's `{ error }` shape; ExtractError carries
 *     its own status (415 unsupported, 413 too large, 422 unreadable…).
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')

    const limit = checkRateLimit(`extract:${userId}`, RATE_LIMITS.fileExtract)
    if (!limit.success) return rateLimitResponse(limit)

    // Cheap pre-check: reject an oversized body before buffering it, when
    // the browser sent a Content-Length we can trust.
    const declared = Number(request.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_BYTES / (1024 * 1024)} MB.` },
        { status: 413 },
      )
    }

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json(
        { error: 'Expected multipart/form-data with a "file" field.' },
        { status: 400 },
      )
    }

    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: `Missing "file" field. Upload a ${SUPPORTED_HINT}.` },
        { status: 400 },
      )
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'The uploaded file is empty.' }, { status: 400 })
    }
    // Authoritative size check (Content-Length can be spoofed/absent).
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_BYTES / (1024 * 1024)} MB.` },
        { status: 413 },
      )
    }

    const promptField = form.get('prompt')
    const imagePrompt =
      typeof promptField === 'string' && promptField.trim()
        ? promptField.trim()
        : undefined

    // Load the account's AI config lazily — only images need it, but
    // fetching it here keeps the extractor pure. requireActive:false so
    // extraction works even when auto-reply is toggled off.
    const aiConfig = await loadAiConfig(supabase, accountId, {
      requireActive: false,
    }).catch(() => null)

    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await extractFile({
      bytes,
      filename: file.name || 'upload',
      contentType: file.type,
      aiConfig,
      imagePrompt,
    })

    return NextResponse.json({ data: result })
  } catch (err) {
    // ExtractError (415/413/422/…) and AiError (from the vision path:
    // invalid_key → 401, timeout → 504, …) both carry their own status.
    if (err instanceof ExtractError || err instanceof AiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return toErrorResponse(err)
  }
}
