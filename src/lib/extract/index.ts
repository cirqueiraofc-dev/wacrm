// ============================================================
// File extraction — public entry point.
//
// One function the route calls: hand it the file bytes + metadata and
// it dispatches to the right extractor (PDF / image / spreadsheet) and
// returns the unified `ExtractResult`. The AI config is only consulted
// for images; PDF and spreadsheets never need it.
// ============================================================

import type { AiConfig } from '@/lib/ai/types'
import { requireKind } from './detect'
import { extractPdf } from './pdf'
import { extractSpreadsheet, sheetsToText } from './spreadsheet'
import { extractImageText, DEFAULT_IMAGE_PROMPT } from './image'
import { ExtractError, type ExtractResult } from './types'

export * from './types'
export { MAX_FILE_BYTES, SUPPORTED_HINT, detectKind, requireKind } from './detect'

export interface ExtractInput {
  bytes: Uint8Array
  filename: string
  contentType: string | null | undefined
  /** Required only when the file is an image; ignored otherwise. Pass
   *  the account's loaded AI config or null. */
  aiConfig?: AiConfig | null
  /** Optional override for the image transcription instruction. */
  imagePrompt?: string
}

/**
 * Turn an uploaded file into structured, machine-usable content.
 * Detects the kind (throwing 415 for anything unsupported) and routes
 * to the matching extractor.
 */
export async function extractFile(input: ExtractInput): Promise<ExtractResult> {
  const { bytes, filename, contentType, aiConfig, imagePrompt } = input
  const kind = requireKind(filename, contentType)
  const resolvedType = (contentType ?? '').split(';')[0].trim() || 'application/octet-stream'

  if (kind === 'pdf') {
    const { text, pages } = await extractPdf(bytes)
    return {
      kind,
      filename,
      contentType: resolvedType,
      text,
      meta: { pages, empty: text.length === 0 },
    }
  }

  if (kind === 'spreadsheet') {
    const sheets = await extractSpreadsheet(bytes, filename)
    return {
      kind,
      filename,
      contentType: resolvedType,
      text: sheetsToText(sheets),
      sheets,
      meta: {
        sheetCount: sheets.length,
        rowCount: sheets.reduce((n, s) => n + s.rows.length, 0),
      },
    }
  }

  // image
  if (!aiConfig) {
    throw new ExtractError(
      'Reading images requires an active AI configuration. Set one up in Settings → AI, then try again.',
      { code: 'ai_not_configured', status: 400 },
    )
  }
  const { text, usage } = await extractImageText(
    bytes,
    resolvedType,
    aiConfig,
    imagePrompt ?? DEFAULT_IMAGE_PROMPT,
  )
  return {
    kind,
    filename,
    contentType: resolvedType,
    text,
    meta: { usage, model: aiConfig.model, provider: aiConfig.provider },
  }
}
