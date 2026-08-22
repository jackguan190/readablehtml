# Canonical Document Contract v1

The durable, versioned representation of an ingested document. Generated HTML
is disposable; this contract is the source of truth that a future Next.js web
app and a separate extraction worker communicate through.

## Dependency rule

- Any module may import this contract (via `index.ts` only).
- This contract imports nothing from the application: no React, Next.js,
  Supabase, storage clients, pipeline modules (`lib/documents/*`), or UI types.
- Zod is the single runtime schema source; all public TypeScript types are
  inferred from the schemas. Do not hand-write parallel types.

## Version policy

`schemaVersion: 1`, exact match. `parseDocumentV1` rejects missing, malformed,
or unknown versions with a distinguishable `unsupported_version` result before
any structural validation (`invalid_document`). No forward compatibility is
claimed; a future version requires an explicit migration policy.

## Shape

A document is an envelope (`documentId`, optional `title`, `source`,
`extraction`) plus a non-empty flat array of typed blocks, pre-sorted by
`readingOrder`. Block kinds: `heading`, `paragraph`, `footnote`,
`reference_entry`, `table`, `figure`, `formula`, `caption`, `page_artifact`.
Every block carries a stable `id`, a `readingOrder`, a source `anchor`
(one-based `page`, optional bounding box), a `confidence`, and an optional
`fallback`.

`source` describes the file itself (`mediaType: "application/pdf"`, optional
`storagePath` and `pageCount`). `extraction` describes independently how
content was produced from it (`embedded_text`, `ocr`, `vision`, `hybrid`).
Recognizing a method is a contract boundary, not a product feature — the MVP
product still accepts born-digital PDFs only, and no OCR pipeline exists here.

Bounding boxes use one convention: normalized top-left origin, all values
fractions of the page in `0..1`, and boxes may not extend past page edges.

## Marker offsets

Citation and footnote markers inside a paragraph carry `start`/`end` offsets:
zero-based, end-exclusive, **UTF-16 code units** into that paragraph's
`sourceText` — the same unit browser selection APIs use. Validation requires
`sourceText.slice(start, end) === markerText`, so every marker's source
relationship is verifiable. This anchors markers only; it does not implement
annotations.

## Invariants (validated)

- The document contains at least one block.
- Block ids are unique; reading order is strictly increasing (deterministic).
- Relationship targets exist and have compatible kinds: paragraph citations →
  `reference_entry`, footnote refs → `footnote`, captions → `table` /
  `figure` / `formula`.
- Bounding boxes stay within the page; `source_region` fallbacks require a
  bounding box (they must be croppable).
- When `source.pageCount` is declared, no block anchor page and no
  `source_region` fallback anchor page may exceed it.
- Figures always retain a croppable source representation: `anchor.bbox`, or
  an explicit `source_region` fallback. Figures carry no free-form text
  fields — alt text and descriptions are AI assistance outside the source
  layer.
- Captions have exactly one canonical representation: the anchored `caption`
  block related through `captionFor`. Tables and figures have no inline
  caption strings.
- Source fidelity: evidence-bearing blocks keep exact `sourceText`. Tables
  and formulas may leave it empty only when an explicit fallback preserves
  the source region or raw text. Reconstructions (including
  `ai_reconstructed`) are labeled by provenance and never replace source
  content. Unknown extra properties are rejected (strict schemas), so
  generated content cannot ride along inside the source layer.

## Block ID stability (requirement, not implemented here)

Consumers (annotations, reading cards) will anchor to `block.id` plus text
offsets. IDs must therefore be stable for the lifetime of a stored document
version; re-extraction that changes IDs is a new document version and needs a
migration/recovery story. ID *generation* is an extraction-time concern and is
deliberately out of scope for this contract.

## Out of scope in v1

Persistence mapping, extraction adapters, HTML rendering, annotation
anchoring/recovery, AI assistance layers, and any OCR/vision pipeline code.
`source.mediaType` is `application/pdf` only; adding a media type is a schema
change with a version bump.
