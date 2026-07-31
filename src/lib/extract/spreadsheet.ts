// ============================================================
// File extraction — spreadsheets (XLSX + CSV/TSV).
//
// XLSX goes through `read-excel-file` (pure JS, read-only, no native
// deps and no `archiver`/zip-writer transitive vulnerabilities). CSV/TSV
// are parsed here with a small RFC-4180-ish parser so we don't pull a
// second dependency for the text formats. Both produce the same
// `ExtractedSheet[]` shape plus a flat text rendering.
// ============================================================

import type { ExtractedSheet } from './types'
import { ExtractError } from './types'
import { fileExtension } from './detect'

type Cell = string | number | boolean | null

/** Coerce a reader cell (which may be a Date) into our JSON-safe cell. */
function normalizeCell(value: unknown): Cell {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return value as Cell
  }
  return String(value)
}

/** Render parsed sheets as tab-separated plain text, one block per sheet.
 *  Multi-sheet workbooks get a `### <name>` header so the boundaries
 *  survive into the text field (used by the AI knowledge base etc.). */
export function sheetsToText(sheets: ExtractedSheet[]): string {
  const multi = sheets.length > 1
  return sheets
    .map((sheet) => {
      const body = sheet.rows
        .map((row) => row.map((cell) => (cell === null ? '' : String(cell))).join('\t'))
        .join('\n')
      return multi ? `### ${sheet.name}\n${body}` : body
    })
    .join('\n\n')
    .trim()
}

/**
 * Parse a single delimited-text sheet (CSV/TSV). Handles quoted fields
 * containing the delimiter, embedded newlines, and escaped quotes (`""`).
 * Returns row-major cells; every cell is a string (delimited text is
 * untyped) or null for an empty field.
 */
export function parseDelimited(input: string, delimiter: string): Cell[][] {
  const rows: Cell[][] = []
  let row: Cell[] = []
  let field = ''
  let inQuotes = false
  let fieldStarted = false

  const pushField = () => {
    // An unquoted empty field is null; a quoted "" stays an empty string.
    row.push(!fieldStarted && field === '' ? null : field)
    field = ''
    fieldStarted = false
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  // Normalize CRLF/CR so newline handling has a single case.
  const text = input.replace(/\r\n?/g, '\n')

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      fieldStarted = true
    } else if (ch === delimiter) {
      pushField()
    } else if (ch === '\n') {
      pushRow()
    } else {
      field += ch
      fieldStarted = true
    }
  }
  // Flush the trailing field/row unless the input ended on a newline
  // (which would otherwise append a spurious empty row).
  if (field !== '' || fieldStarted || row.length > 0) {
    pushRow()
  }
  return rows
}

/**
 * Parse a spreadsheet buffer into structured sheets. Dispatches on
 * extension: `.csv`/`.tsv` use the delimited parser, everything else is
 * treated as `.xlsx`. Throws a typed ExtractError on unreadable input.
 */
export async function extractSpreadsheet(
  bytes: Uint8Array,
  filename: string,
): Promise<ExtractedSheet[]> {
  const ext = fileExtension(filename)

  if (ext === 'csv' || ext === 'tsv') {
    const delimiter = ext === 'tsv' ? '\t' : ','
    const text = new TextDecoder('utf-8').decode(bytes)
    const rows = parseDelimited(text, delimiter)
    return [{ name: ext.toUpperCase(), rows }]
  }

  // XLSX. `read-excel-file/node` wants a readable *stream* (it rejects a
  // raw Buffer), and returns every sheet with its rows in one call. Both
  // imported lazily so the reader only loads when a workbook is parsed.
  const { default: readXlsxFile } = await import('read-excel-file/node')
  const { Readable } = await import('node:stream')
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  let raw: unknown
  try {
    raw = await readXlsxFile(Readable.from(buffer))
  } catch (err) {
    throw new ExtractError(
      `Could not read the spreadsheet: ${err instanceof Error ? err.message : String(err)}`,
      { code: 'spreadsheet_parse_failed', status: 422 },
    )
  }
  return normalizeWorkbook(raw)
}

/**
 * Normalize whatever `read-excel-file` hands back into `ExtractedSheet[]`.
 * Tolerant of both return shapes across versions: the wrapped
 * `[{ sheet, data }]` (all sheets at once) and the bare `Cell[][]` of a
 * single sheet.
 */
export function normalizeWorkbook(raw: unknown): ExtractedSheet[] {
  if (!Array.isArray(raw)) return []

  // Wrapped shape: [{ sheet: name, data: rows }, ...]
  if (raw.length > 0 && isSheetObject(raw[0])) {
    return (raw as { sheet?: string; data?: unknown[][] }[]).map((s, i) => ({
      name: s.sheet || `Sheet${i + 1}`,
      rows: (s.data ?? []).map((r) => r.map(normalizeCell)),
    }))
  }

  // Bare shape: Cell[][] — a single unnamed sheet.
  return [
    {
      name: 'Sheet1',
      rows: (raw as unknown[][]).map((r) =>
        Array.isArray(r) ? r.map(normalizeCell) : [normalizeCell(r)],
      ),
    },
  ]
}

function isSheetObject(v: unknown): v is { sheet?: string; data?: unknown[][] } {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    'data' in v &&
    Array.isArray((v as { data?: unknown }).data)
  )
}
