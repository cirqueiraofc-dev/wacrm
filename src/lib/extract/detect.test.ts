import { describe, it, expect } from 'vitest'
import { detectKind, fileExtension, requireKind } from './detect'
import { ExtractError } from './types'

describe('fileExtension', () => {
  it('returns the lowercased extension', () => {
    expect(fileExtension('Report.PDF')).toBe('pdf')
    expect(fileExtension('data.xlsx')).toBe('xlsx')
    expect(fileExtension('archive.tar.gz')).toBe('gz')
  })

  it('returns empty string when there is no usable extension', () => {
    expect(fileExtension('noext')).toBe('')
    expect(fileExtension('trailingdot.')).toBe('')
    expect(fileExtension('.hidden')).toBe('hidden')
  })
})

describe('detectKind', () => {
  it('detects by MIME type, ignoring charset params', () => {
    expect(detectKind('x', 'application/pdf')).toBe('pdf')
    expect(detectKind('x', 'image/png')).toBe('image')
    expect(detectKind('x', 'image/jpeg')).toBe('image')
    expect(
      detectKind(
        'x',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe('spreadsheet')
    expect(detectKind('x', 'text/csv; charset=utf-8')).toBe('spreadsheet')
  })

  it('falls back to the extension when the MIME type is generic', () => {
    expect(detectKind('doc.pdf', 'application/octet-stream')).toBe('pdf')
    expect(detectKind('photo.JPEG', '')).toBe('image')
    expect(detectKind('sheet.xlsx', null)).toBe('spreadsheet')
    expect(detectKind('list.tsv', undefined)).toBe('spreadsheet')
  })

  it('returns null for unsupported types', () => {
    expect(detectKind('note.txt', 'text/plain')).toBeNull()
    expect(detectKind('legacy.xls', 'application/vnd.ms-excel')).toBeNull()
    expect(detectKind('movie.mp4', 'video/mp4')).toBeNull()
    expect(detectKind('unknown', 'application/octet-stream')).toBeNull()
  })
})

describe('requireKind', () => {
  it('returns the kind for supported files', () => {
    expect(requireKind('a.pdf', 'application/pdf')).toBe('pdf')
  })

  it('throws a 415 ExtractError for unsupported files', () => {
    try {
      requireKind('a.txt', 'text/plain')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractError)
      expect((err as ExtractError).code).toBe('unsupported_type')
      expect((err as ExtractError).status).toBe(415)
    }
  })
})
