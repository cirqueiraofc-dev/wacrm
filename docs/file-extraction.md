# File extraction (`/api/extract`)

Read the text/data out of an uploaded **PDF**, **image**, or **Excel/CSV
spreadsheet** and get it back as JSON. This is a dashboard API endpoint
(session-authenticated, RLS-scoped) meant to be called from the site's own
frontend.

The parsing logic lives in `src/lib/extract/` as pure, unit-tested
functions; the route handler (`src/app/api/extract/route.ts`) only handles
upload, auth, limits, and error mapping.

## Endpoint

```
POST /api/extract
Content-Type: multipart/form-data
```

| Field    | Required | Description                                                        |
| -------- | -------- | ------------------------------------------------------------------ |
| `file`   | yes      | The file to read.                                                  |
| `prompt` | no       | Overrides the default image transcription instruction (images only). |

- **Auth:** signed-in member with the `agent` role or higher.
- **Rate limit:** 20 requests/min per user (`RATE_LIMITS.fileExtract`).
- **Max size:** 15 MB (`MAX_FILE_BYTES`).

### Supported types

| Kind          | Extensions / MIME                                             | How it's read                              |
| ------------- | ------------------------------------------------------------ | ------------------------------------------ |
| PDF           | `.pdf` · `application/pdf`                                    | Text layer via [`unpdf`](https://github.com/unjs/unpdf) (pure JS). Scanned/image-only PDFs come back with `meta.empty: true`. |
| Image         | `.png .jpg .jpeg .webp .gif`                                 | The account's configured **AI vision model** (BYO key). Requires an AI config. |
| Spreadsheet   | `.xlsx` · `.csv` · `.tsv`                                    | XLSX via [`read-excel-file`](https://github.com/catamphetamine/read-excel-file); CSV/TSV via a built-in parser. |

Old binary `.xls` is **not** supported — re-save as `.xlsx`.

## Response

Success is `{ "data": ExtractResult }`:

```jsonc
// PDF
{ "data": { "kind": "pdf", "filename": "invoice.pdf", "contentType": "application/pdf",
            "text": "…", "meta": { "pages": 3, "empty": false } } }

// spreadsheet
{ "data": { "kind": "spreadsheet", "filename": "contacts.xlsx",
            "text": "Name\tEmail\n…",
            "sheets": [ { "name": "Sheet1", "rows": [ ["Name","Email"], ["Ann","a@x.com"] ] } ],
            "meta": { "sheetCount": 1, "rowCount": 2 } } }

// image
{ "data": { "kind": "image", "filename": "receipt.jpg", "contentType": "image/jpeg",
            "text": "…transcribed text…",
            "meta": { "model": "gpt-5.4-mini", "provider": "openai", "usage": { … } } } }
```

Failures use the dashboard's `{ "error": "<message>" }` shape with a matching
HTTP status:

| Status | When                                                             |
| ------ | ---------------------------------------------------------------- |
| 400    | No `file` field / empty file / images requested but no AI config |
| 401/403| Not signed in / role below `agent`                              |
| 413    | File larger than 15 MB                                          |
| 415    | Unsupported file type                                           |
| 422    | Corrupt / unreadable PDF or spreadsheet                         |
| 429    | Rate limit exceeded                                             |
| 502/504| AI vision provider error / timeout (images)                    |

## Notes

- **Images need an AI key.** Unlike PDF and Excel (parsed locally), images
  are read by the account's AI vision model, so an active config in
  **Settings → AI** is required. PDF and spreadsheets never touch the AI key.
- **Reuse the library directly.** Server code can call `extractFile()` from
  `@/lib/extract` without going through HTTP — e.g. to feed an uploaded PDF
  into the AI knowledge base, or to import contacts from a spreadsheet.
