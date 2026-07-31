// ============================================================
// File extraction — PDF text.
//
// Thin wrapper over `unpdf` (a serverless-friendly, pure-JS build of
// pdf.js — no native deps, works in the Next.js runtime). We pull the
// text layer only; scanned/image-only PDFs come back near-empty, which
// the caller surfaces rather than silently returning "".
// ============================================================

import { ExtractError } from './types'

export interface PdfExtraction {
  text: string
  /** Number of pages the document reports. */
  pages: number
}

/**
 * Extract the text layer from a PDF. Throws a typed ExtractError on a
 * corrupt/unreadable file; returns whatever text exists otherwise (an
 * empty string is a valid result for an image-only PDF — the caller
 * decides how to present that).
 */
export async function extractPdf(bytes: Uint8Array): Promise<PdfExtraction> {
  // Imported lazily so the ~1 MB pdf.js bundle only loads on routes that
  // actually parse a PDF, not on every import of the extract module.
  const { extractText, getDocumentProxy } = await import('unpdf')

  let pages: number
  let text: string
  try {
    const pdf = await getDocumentProxy(bytes)
    pages = pdf.numPages
    const result = await extractText(pdf, { mergePages: true })
    // With mergePages, `text` is a single string; be defensive in case a
    // future version returns the per-page array shape.
    text = Array.isArray(result.text) ? result.text.join('\n\n') : result.text
  } catch (err) {
    throw new ExtractError(
      `Could not read the PDF: ${err instanceof Error ? err.message : String(err)}`,
      { code: 'pdf_parse_failed', status: 422 },
    )
  }

  return { text: text.trim(), pages }
}
