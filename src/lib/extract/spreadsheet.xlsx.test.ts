import { describe, it, expect } from 'vitest'
import { extractSpreadsheet, normalizeWorkbook } from './spreadsheet'

// A real single-sheet .xlsx ("People": Name/Age/Joined with a string,
// number, date, and an empty cell), generated once and inlined so the
// test exercises the actual read-excel-file stream path with no dev
// dependency. Regenerate with write-excel-file if the schema changes.
const SAMPLE_XLSX_BASE64 =
  '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'

describe('normalizeWorkbook', () => {
  it('maps the wrapped [{ sheet, data }] shape, coercing dates + blanks', () => {
    const out = normalizeWorkbook([
      {
        sheet: 'S1',
        data: [
          ['h1', 'h2'],
          ['v', 3],
          [new Date(Date.UTC(2021, 5, 1)), null],
        ],
      },
    ])
    expect(out).toEqual([
      {
        name: 'S1',
        rows: [
          ['h1', 'h2'],
          ['v', 3],
          ['2021-06-01T00:00:00.000Z', null],
        ],
      },
    ])
  })

  it('names unnamed sheets and wraps the bare Cell[][] shape', () => {
    expect(normalizeWorkbook([{ data: [['a']] }])[0].name).toBe('Sheet1')
    expect(normalizeWorkbook([['a', 'b'], [1, 2]])).toEqual([
      { name: 'Sheet1', rows: [['a', 'b'], [1, 2]] },
    ])
  })

  it('returns [] for a non-array input', () => {
    expect(normalizeWorkbook(null)).toEqual([])
  })
})

describe('extractSpreadsheet (real .xlsx)', () => {
  it('reads a workbook end-to-end via the stream path', async () => {
    const bytes = Uint8Array.from(Buffer.from(SAMPLE_XLSX_BASE64, 'base64'))
    const sheets = await extractSpreadsheet(bytes, 'people.xlsx')
    expect(sheets).toHaveLength(1)
    expect(sheets[0].name).toBe('People')
    expect(sheets[0].rows[0]).toEqual(['Name', 'Age', 'Joined'])
    expect(sheets[0].rows[1][0]).toBe('Alice')
    expect(sheets[0].rows[1][1]).toBe(30)
    // Date cell comes back coerced to an ISO string.
    expect(sheets[0].rows[1][2]).toBe('2020-01-15T00:00:00.000Z')
    // Empty cell is null.
    expect(sheets[0].rows[2][2]).toBeNull()
  })
})
