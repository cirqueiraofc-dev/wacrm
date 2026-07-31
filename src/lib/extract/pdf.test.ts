import { describe, it, expect } from 'vitest'
import { extractPdf } from './pdf'
import { ExtractError } from './types'

// A real one-page PDF whose text layer reads "Hello PDF". Inlined so the
// test exercises the actual unpdf parse path with no fixtures on disk.
const SAMPLE_PDF_BASE64 =
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMzAwIDE0NF0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNDQ+PnN0cmVhbQpCVCAvRjEgMTggVGYgMjAgMTAwIFRkIChIZWxsbyBQREYpIFRqIEVUCmVuZHN0cmVhbSBlbmRvYmoKNSAwIG9iajw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYT4+ZW5kb2JqCnRyYWlsZXI8PC9Sb290IDEgMCBSPj4KJSVFT0Y='

describe('extractPdf', () => {
  it('extracts the text layer and page count from a real PDF', async () => {
    const bytes = Uint8Array.from(Buffer.from(SAMPLE_PDF_BASE64, 'base64'))
    const { text, pages } = await extractPdf(bytes)
    expect(pages).toBe(1)
    expect(text).toContain('Hello PDF')
  })

  it('throws a typed ExtractError on non-PDF bytes', async () => {
    const bytes = new TextEncoder().encode('this is definitely not a pdf')
    await expect(extractPdf(bytes)).rejects.toBeInstanceOf(ExtractError)
  })
})
