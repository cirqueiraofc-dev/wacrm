// ============================================================
// File extraction — shared types.
//
// One small surface for turning an uploaded file (PDF, image, or Excel
// spreadsheet) into plain, machine-usable content. Kept provider- and
// framework-agnostic so the pure extractors stay unit-testable and the
// route handler (`/api/extract`) stays thin.
// ============================================================

/** The three input kinds we know how to read. */
export type ExtractKind = 'pdf' | 'image' | 'spreadsheet'

/** One parsed sheet from a spreadsheet workbook. */
export interface ExtractedSheet {
  /** Sheet/tab name as it appears in the workbook. */
  name: string
  /** Row-major cell values. Empty cells are `null`; everything else is
   *  coerced to string/number/boolean by the reader. */
  rows: (string | number | boolean | null)[][]
}

/**
 * The unified result every extractor returns. `text` is always present
 * (a human- and LLM-readable rendering of the file); `sheets` is only
 * set for spreadsheets so callers can work with structured rows without
 * re-parsing the text.
 */
export interface ExtractResult {
  kind: ExtractKind
  filename: string
  /** MIME type we detected / were given for the input. */
  contentType: string
  /** Plain-text rendering of the file's content. */
  text: string
  /** Structured rows, spreadsheets only. */
  sheets?: ExtractedSheet[]
  /** Extra per-kind facts (page count, sheet count, AI token usage…). */
  meta?: Record<string, unknown>
}

/**
 * Typed error for every extraction failure. `status` maps cleanly to an
 * HTTP response in the route; `code` lets the UI/tests branch
 * (unsupported_type vs too_large vs ai_not_configured, etc.).
 */
export class ExtractError extends Error {
  readonly code: string
  readonly status: number
  constructor(message: string, opts: { code?: string; status?: number } = {}) {
    super(message)
    this.name = 'ExtractError'
    this.code = opts.code ?? 'extract_error'
    this.status = opts.status ?? 422
  }
}
