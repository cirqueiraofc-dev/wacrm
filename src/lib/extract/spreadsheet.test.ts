import { describe, it, expect } from 'vitest'
import { parseDelimited, sheetsToText, extractSpreadsheet } from './spreadsheet'

describe('parseDelimited (CSV)', () => {
  it('parses a simple grid', () => {
    expect(parseDelimited('a,b,c\n1,2,3', ',')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('treats empty unquoted fields as null but keeps quoted empties', () => {
    expect(parseDelimited('a,,c', ',')).toEqual([['a', null, 'c']])
    expect(parseDelimited('a,"",c', ',')).toEqual([['a', '', 'c']])
  })

  it('handles quoted fields with delimiters and newlines', () => {
    const rows = parseDelimited('name,note\n"Doe, Jane","line1\nline2"', ',')
    expect(rows).toEqual([
      ['name', 'note'],
      ['Doe, Jane', 'line1\nline2'],
    ])
  })

  it('handles escaped quotes ("")', () => {
    expect(parseDelimited('"she said ""hi"""', ',')).toEqual([['she said "hi"']])
  })

  it('normalizes CRLF and does not emit a trailing empty row', () => {
    expect(parseDelimited('a,b\r\n1,2\r\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('parses TSV with a tab delimiter', () => {
    expect(parseDelimited('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('sheetsToText', () => {
  it('renders a single sheet as tab-separated rows without a header', () => {
    const text = sheetsToText([
      { name: 'Sheet1', rows: [['a', 'b'], [1, null, 'c']] },
    ])
    // null cells render as empty between delimiters; the final trim only
    // touches trailing whitespace at the very end of the whole output.
    expect(text).toBe('a\tb\n1\t\tc')
  })

  it('prefixes each sheet with its name when there are several', () => {
    const text = sheetsToText([
      { name: 'One', rows: [['x']] },
      { name: 'Two', rows: [['y']] },
    ])
    expect(text).toBe('### One\nx\n\n### Two\ny')
  })
})

describe('extractSpreadsheet (CSV/TSV path)', () => {
  it('reads a CSV buffer into one sheet', async () => {
    const bytes = new TextEncoder().encode('a,b\n1,2')
    const sheets = await extractSpreadsheet(bytes, 'data.csv')
    expect(sheets).toEqual([
      { name: 'CSV', rows: [['a', 'b'], ['1', '2']] },
    ])
  })

  it('reads a TSV buffer with the tab delimiter', async () => {
    const bytes = new TextEncoder().encode('a\tb\n1\t2')
    const sheets = await extractSpreadsheet(bytes, 'data.tsv')
    expect(sheets[0].name).toBe('TSV')
    expect(sheets[0].rows).toEqual([['a', 'b'], ['1', '2']])
  })
})
