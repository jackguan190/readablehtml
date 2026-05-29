# BYOK Vision/OCR beta — design

Status: approved, ready for implementation plan.

## 1. Goal

Let signed-in users process scanned/image-based PDFs (`documents.status = 'needs_ocr'`) using their own vision-capable provider key — starting with OpenAI `gpt-4o` / `gpt-4o-mini`. DeepSeek must NOT be offered for scanned PDFs unless the provider adapter explicitly declares image-input support.

## 2. Non-goals

- Do not change or replace the existing unpdf text-extraction pipeline.
- Do not touch the Chandra (layout-aware OCR) pipeline.
- No payment, Stripe, sharing, or persistent API-key storage.
- No platform-key vision processing in v1 (BYOK only).
- No background-worker / polling — vision runs synchronously inside one server action, just like Chandra today.

## 3. Architectural overview

Mirrors the existing Chandra pipeline (`runChandraForDocument` in `lib/documents/actions.ts`). The PDF is sent directly to the user's OpenAI vision model as a base64 `file` content part in a single chat-completions call. The model returns strict JSON blocks (heading / paragraph / table / figure / footnote / metadata). Those blocks pass through a vision mapper that reuses `chandraToSections` and writes `StructuredSectionInput[]` into `document_pages` — identical persistence to Chandra, so the reading view renders the result with zero changes.

```
needs_ocr panel  ──►  "Process with BYOK Vision beta"  (button disabled when provider lacks vision)
       │
       ▼
cost-warning confirm
       │
       ▼
processScannedPdfWithVision(documentId, providerConfig)
   1. auth + ownership
   2. reject if !providerSupportsVision(config)           ← req 8/9 enforcement
   3. reject if config.source !== "byok"                  ← req 12 enforcement
   4. reject if page_count > 10                           ← req 10a enforcement
   5. status: vision_queued
   6. download PDF from Storage
   7. status: vision_processing
   8. OpenAiVisionProvider.convertPdf(pdfBytes, { apiKey, model })  ← req 3/4
   9. parse + validate strict-JSON blocks                 ← req 5
  10. visionToSections(result)                            ← req 6/7
  11. DELETE+INSERT document_pages
  12. status: vision_ready, processing_mode: byok_vision
on ANY failure ► status: vision_failed,
                 document_pages untouched,
                 "View original scan" still visible       ← req 13
```

## 4. Components

### 4.1 Provider capability — `lib/llm/types.ts`

Add a per-model capability flag and a helper:

- Widen `LLM_DEFAULTS` so each model declares `supportsImageInput: boolean`. OpenAI `gpt-4o` and `gpt-4o-mini` → `true`. DeepSeek `deepseek-v4-flash` / `deepseek-v4-pro` → `false`.
- Export `providerSupportsVision(config: LlmProviderConfig): boolean` — looks up the chosen model's capability flag. This is the **single source of truth** for req 8/9.

### 4.2 Vision provider — `lib/documents/vision-provider.ts` (new)

Mirrors `chandra-provider.ts` structurally. Returns the same block shape so the rest of the pipeline doesn't care which provider produced it.

```ts
// Reuse the existing Chandra block/page types as the contract surface.
// They already cover heading | paragraph | table | figure | footnote | metadata
// plus htmlTable / markdownTable / jsonTable.
import type { ChandraBlock, ChandraPage } from "./chandra-provider";

export interface VisionResult {
  pages: ChandraPage[];      // reuses block contract
  pageCount: number;
  provider: "byok_vision";   // tags the source
  modelUsed: string;
  rawApiResponse?: unknown;  // kept in memory only; not persisted in v1
}

export interface VisionConvertOptions {
  documentId: string;
  apiKey: string;            // BYOK key — in-memory for this call only
  model: string;             // e.g. "gpt-4o-mini"
  pageCount: number;
}

export interface VisionProvider {
  isConfigured(): boolean;
  convertPdf(buf: Uint8Array, opts: VisionConvertOptions): Promise<VisionResult>;
}

export class OpenAiVisionProvider implements VisionProvider { /* ... */ }
```

Implementation notes:
- Build the OpenAI client with the BYOK key only. Never read `process.env.OPENAI_API_KEY`. (Req 12.)
- Send the whole PDF as one `chat.completions.create` call with `response_format: { type: "json_object" }`, a strict-JSON system prompt, and the PDF as a `file` content part (base64 data URL, MIME `application/pdf`). One call, ≤10 pages — simpler than per-page fanout and cheaper.
- The system prompt asks the model to emit an object `{ "pages": [{ "page": N, "blocks": [...] }, ...] }` where each block has `blockType` ∈ { heading | paragraph | table | figure | footnote | metadata } and the optional fields the renderer consumes (`text`, `caption`, `level`, `htmlTable`, `markdownTable`, `jsonTable`, `figureDescription`).
- Use the existing `classifyError` from `lib/llm/provider.ts` to convert SDK errors into `LlmProviderError` (so 401 → `invalid_key`, 429 → `rate_limit`, 404 / "model not found" → `unsupported_model`, etc.).
- On JSON parse failure or schema validation failure: throw an `LlmProviderError("openai", "unknown", "...")` — caught by the action and surfaced cleanly.

### 4.3 Vision mapper — `lib/documents/vision-mapper.ts` (new, thin)

Wraps `chandraToSections` to keep the layout logic in one place. **Extends** the table mapping to preserve `markdownTable` and `jsonTable` losslessly (req 7) — today's `chandra-mapper.ts` only keeps `htmlTable`.

```ts
export function visionToSections(result: VisionResult): StructuredSectionInput[] {
  // Reuse chandra's structural pass (heading levels → section boundaries,
  // implicit "Opening" section, etc.) then post-walk each table paragraph
  // and copy markdownTable / jsonTable from the source blocks.
}
```

The widened `SerializedParagraph` / `Paragraph` type (see 4.5) carries the new fields through to `document_pages.body`.

### 4.4 Server action — `lib/documents/actions.ts`

New export `processScannedPdfWithVision(documentId, providerConfig)`. Structurally cloned from `runChandraForDocument`:

| Step | Action | Failure handling |
|------|--------|------------------|
| 1 | Auth + ownership | return `{ error }` |
| 2 | `providerSupportsVision(config)` | return req-9 copy verbatim |
| 3 | `config.source === "byok"` and `config.provider === "openai"` and `config.apiKey?.trim()` | return clear error; **never fall back to platform key** |
| 4 | `page_count <= 10`; if `page_count` is null, refuse with "page count unknown — re-upload" rather than skipping the check | return cap message (req 10a) |
| 5 | `status → vision_queued` | — |
| 6 | Download PDF | `status → vision_failed`, `error: msg`, return |
| 7 | `status → vision_processing` | — |
| 8 | `provider.convertPdf(...)` | `status → vision_failed`, `error: msg`, `document_pages` untouched, return (req 13) |
| 9 | Validate JSON shape | as step 8 |
| 10 | `visionToSections(result)` → `DELETE` old `document_pages` → `INSERT` new | if insert fails: `status → vision_failed`, surface error, ask user to re-run |
| 11 | `status → vision_ready`, `processing_mode = "byok_vision"`, `error = null`, `revalidatePath` | — |

**No quota peek, no `consumeQuota` call** — BYOK never touches `user_usage`, matching the existing `explainParagraphAction` pattern (which the maintainers explicitly chose so BYOK users don't burn platform quota).

### 4.5 Type widening — `lib/content.ts` and `lib/documents/types.ts`

Add optional fields to the table block (`blockType: "table"`):

```ts
markdownTable?: string;
jsonTable?: unknown;     // rows-of-cells JSON shape, opaque to the renderer for now
```

Backward compatible (all optional). Existing Chandra rows that lack these fields keep working unchanged.

### 4.6 UI — `app/documents/[id]/DocumentClient.tsx`

On the `needs_ocr` panel (the existing early-return block around line 586), add a "Process with BYOK Vision beta" button next to the "Run OCR with Chandra" button:

- **Capability gate.** Enabled only when `providerSupportsVision(aiSettings.config) && aiSettings.config.source === "byok"`. When disabled, the title attribute and an inline hint read:
  > "This provider can explain extracted text, but cannot process scanned PDFs." (req 9, verbatim)
- **Cost warning.** Clicking opens a confirm dialog (existing `window.confirm` style, matching the Chandra button's pattern):
  > "Process this scanned PDF with your BYOK OpenAI key? Up to N pages will be sent directly to OpenAI from your account — you will be billed by OpenAI. The result will replace the current document_pages. Existing pages remain intact if processing fails."
- **No auto-run.** The button is the only entry point; nothing on upload triggers it (req 10c).
- **Failure UX.** On `vision_failed`, the `needs_ocr` panel re-renders (status branch already covers an empty-pages document) with `document.error` shown and "View original scan" still present (req 13). I'll extend the status-meta `describeMode` map with `vision_*` entries so labels are accurate ("Vision queued" / "Vision running" / "Vision ready" / "Vision failed", `modeLabel: "BYOK Vision (beta)"`).

The `aiSettings` state already lives in client memory only (`useState`) — no localStorage / sessionStorage / cookies / Supabase writes anywhere in the BYOK paths. This spec adds no new persistence. (Req 11.)

### 4.7 Schema — `supabase/migrations/0009_byok_vision.sql`

Extend the two CHECK constraints only. No new table. Pattern copied from `0008_chandra.sql`:

```sql
alter table public.documents
  drop constraint if exists documents_status_check;
alter table public.documents
  add constraint documents_status_check
    check (status in (
      'uploaded','queued','processing','ready','failed','needs_ocr',
      'ocr_queued','ocr_processing','ocr_ready','ocr_failed',
      'chandra_queued','chandra_processing','chandra_ready','chandra_failed',
      'vision_queued','vision_processing','vision_ready','vision_failed'
    ));

alter table public.documents
  drop constraint if exists documents_processing_mode_check;
alter table public.documents
  add constraint documents_processing_mode_check
    check (processing_mode in (
      'extraction_only','structured','ai_structured','chandra','byok_vision'
    ));
```

`DocumentStatus` and `ProcessingMode` in `lib/documents/types.ts` get the matching string-literal additions.

## 5. Security model (req 11/12, expanded)

- **Key lifetime.** The BYOK key arrives inside `LlmProviderConfig`, lives in memory for one server-action invocation, and is captured into the `OpenAI` SDK client closure. It is never written to `console`, never sent to Supabase, never returned to the client, never serialized into `chandra_jobs` / `document_pages` / any audit row.
- **No platform fallback.** The vision action checks `config.source === "byok"` and `config.provider === "openai"` before constructing any HTTP client. If the BYOK key is missing or the source is "platform", the action errors out. It does NOT read `process.env.OPENAI_API_KEY`. (Req 12.)
- **Error redaction.** `toClientLlmError` already strips `LlmProviderError.cause` before crossing the action boundary, so an SDK error containing a request signature can't leak to the client.
- **Client-side.** The `aiSettings` state in `DocumentClient.tsx` is plain `useState`. Spec adds no `localStorage` / `sessionStorage` / cookie / `document.cookie` / Supabase write. (Req 11.)

## 6. Error handling matrix

| Failure | User-visible result | DB state |
|---------|---------------------|----------|
| Provider lacks vision (e.g. DeepSeek) | Req-9 copy, button disabled. Action never invoked. | unchanged |
| Source ≠ "byok" or apiKey empty | "BYOK OpenAI key required for vision." | unchanged |
| `page_count > 10` | "This PDF has N pages; BYOK Vision is capped at 10 pages per job on the alpha." | unchanged |
| Storage download fails | `vision_failed`, `error: <msg>`, scan still viewable | doc updated, pages untouched |
| OpenAI 401 / 403 | `invalid_key` message via `classifyError` | doc updated, pages untouched |
| OpenAI 429 | `rate_limit` message | doc updated, pages untouched |
| OpenAI 404 / "model not found" | `unsupported_model` message | doc updated, pages untouched |
| Model returns non-JSON | "BYOK Vision returned malformed output. Try again." | doc updated, pages untouched |
| Model returns empty pages | "BYOK Vision returned no blocks." | doc updated, pages untouched |
| `document_pages` insert fails after delete | Surface insert error, prompt re-run | doc `vision_failed` with the insert-error message |

## 7. Testing & verification

The repo has no test runner today. Verification gates:

1. `npm run build` — clean. (Req 14.)
2. Manual reasoning + smoke pass:
   - Pick DeepSeek BYOK in AI Settings → open a `needs_ocr` doc → button is disabled with the exact req-9 copy.
   - Pick OpenAI BYOK with `gpt-4o-mini` → button enables → confirm modal shows page-count and cost warning.
   - On a known-good 1-page scanned PDF: success path produces sections in the reading view; status pill reads `vision_ready` / mode `BYOK Vision (beta)`.
   - On a known-bad key: button error, document still shows scan + "View original scan" works.

## 8. Out of scope / future hooks

- Per-page or multi-call rasterized path (deferred behind the provider interface — a future `RasterizedVisionProvider` slots in without touching consumers).
- Platform-vision mode (would slot into the action behind an explicit `source: "platform"` branch with a quota peek/consume).
- Audit table `byok_vision_jobs` (mirrors `chandra_jobs`) — deferred unless observability is needed.
- Streaming progress / cancel.
- Other vision providers (Anthropic, Google) — gated on adding `supportsImageInput` for their models.

## 9. Open judgment calls (recorded)

These are decisions I'm making explicit so future maintainers (or a reviewer) can spot them:

- **Widened table block** (`markdownTable`, `jsonTable` optional) rather than stuffing them into `rawText`. Lossless storage for req 7; keeps the reading-view renderer free to upgrade later.
- **Single API call** with the whole ≤10pg PDF, asking the model to tag blocks with page numbers. Simpler and cheaper than per-page fanout; revisitable behind the provider interface if quality is poor on long PDFs.
- **No `byok_vision_jobs` audit table in v1.** All state lives on `documents.status` + `documents.error`. Reconsidered if support needs richer debugging.
