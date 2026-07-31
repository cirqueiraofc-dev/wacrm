// ============================================================
// File extraction — type detection + limits.
//
// Decide which extractor a file goes to, from its MIME type first
// (what the browser/Meta reports) and its extension as a fallback
// (uploads frequently arrive as `application/octet-stream`). Pure and
// fully unit-testable — no I/O.
// ============================================================

import type { ExtractKind } from './types'
import { ExtractError } from './types'

/** Hard cap on input size. Bounds memory + parse time on the server;
 *  the route enforces the same limit before buffering the body. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15 MB

/** Image MIME types the AI vision path accepts. Aligned with what the
 *  major providers ingest — GIF/BMP/TIFF are intentionally excluded. */
const IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

/** Spreadsheet MIME types (xlsx + the CSV/TSV text variants). Old
 *  binary `.xls` is not supported by the reader and is rejected. */
const SPREADSHEET_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/csv',
  'text/tab-separated-values',
])

/** Extension → kind, the fallback when the MIME type is generic. */
const EXTENSION_KIND: Record<string, ExtractKind> = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  xlsx: 'spreadsheet',
  csv: 'spreadsheet',
  tsv: 'spreadsheet',
}

/** Lowercased extension without the dot, or '' when there is none. */
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot < 0 || dot === filename.length - 1) return ''
  return filename.slice(dot + 1).toLowerCase()
}

/**
 * Resolve the extractor kind for an upload, or `null` when we don't
 * support it. MIME type wins; extension is the fallback for the common
 * `application/octet-stream` / empty-type cases.
 */
export function detectKind(
  filename: string,
  contentType: string | null | undefined,
): ExtractKind | null {
  const mime = (contentType ?? '').split(';')[0].trim().toLowerCase()

  if (mime === 'application/pdf') return 'pdf'
  if (IMAGE_MIME.has(mime)) return 'image'
  if (SPREADSHEET_MIME.has(mime)) return 'spreadsheet'

  // MIME was generic/unknown — fall back to the extension.
  return EXTENSION_KIND[fileExtension(filename)] ?? null
}

/** Human-readable list of what we accept, for error messages. */
export const SUPPORTED_HINT = 'PDF, images (PNG/JPEG/WebP/GIF), or spreadsheets (XLSX/CSV/TSV)'

/**
 * Detect the kind or throw a 415 `unsupported_type` ExtractError. Keeps
 * the "reject unknown files" decision in one place.
 */
export function requireKind(
  filename: string,
  contentType: string | null | undefined,
): ExtractKind {
  const kind = detectKind(filename, contentType)
  if (!kind) {
    throw new ExtractError(
      `Unsupported file type. Supported: ${SUPPORTED_HINT}.`,
      { code: 'unsupported_type', status: 415 },
    )
  }
  return kind
}
