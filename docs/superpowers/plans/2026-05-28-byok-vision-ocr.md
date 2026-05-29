# BYOK Vision/OCR beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a BYOK Vision/OCR beta that lets users process `needs_ocr` (scanned/image-based) PDFs with their own OpenAI vision key, persisting the result into the existing `document_pages` JSONB structure without touching the unpdf or Chandra pipelines.

**Architecture:** A new vision path parallel to the existing Chandra OCR pipeline, reusing its block contract end-to-end. The PDF goes directly to the user's OpenAI vision model (`gpt-4o-mini` / `gpt-4o`) as a base64 `file` content part in a single chat-completions call. The model returns strict JSON blocks (heading / paragraph / table / figure / footnote / metadata) which a thin mapper turns into `StructuredSectionInput[]` via the existing `chandraToSections` shape. Capability is gated at two layers: the UI disables the button when the selected model doesn't declare `supportsImageInput`, and the server action rejects non-BYOK / non-vision configs before constructing any HTTP client.

**Tech Stack:** Next.js 14, TypeScript, Supabase (PostgreSQL + Storage + RLS), `openai` SDK v6 (chat.completions with `file` content parts).

**Spec:** `docs/superpowers/specs/2026-05-28-byok-vision-ocr-design.md`.

**Testing note:** This repo has no automated test runner (no Jest, Vitest, Playwright). The spec's verification gate is `npm run build` clean + manual smoke. Every task in this plan therefore ends with a typecheck/build verification step instead of a test-runner step; the final task adds an explicit manual-smoke checklist. Do **not** introduce a test framework as part of this work — it's out of spec.

**Frequent commits:** every task ends with its own commit on the `byok-vision-ocr` branch.

---

## File Structure

**Create:**
- `supabase/migrations/0009_byok_vision.sql` — extends `documents.status` and `documents.processing_mode` CHECK constraints with the four `vision_*` values and `byok_vision`.
- `lib/documents/vision-provider.ts` — `VisionProvider` interface, `OpenAiVisionProvider`, `VisionResult` (reuses `ChandraBlock`/`ChandraPage` shape), `parseVisionJson` validator, and the strict-JSON system prompt.
- `lib/documents/vision-mapper.ts` — `visionToSections(result)`: wraps `chandraToSections` and copies `markdownTable` / `jsonTable` onto table paragraphs (lossless req-7 storage).

**Modify:**
- `lib/llm/types.ts` — add `supportsImageInput` to `LLM_DEFAULTS`, export `providerSupportsVision(config)`.
- `lib/llm/provider.ts` — export the existing private `classifyError` so the vision provider can reuse it.
- `lib/content.ts` — widen `Paragraph` table block with optional `markdownTable` and `jsonTable`.
- `lib/documents/types.ts` — same widening on `SerializedParagraph`; extend `DocumentStatus` with `vision_*`; extend `ProcessingMode` with `byok_vision`.
- `lib/documents/chandra-mapper.ts` — forward `markdownTable` and `jsonTable` from `ChandraBlock` to the emitted table paragraph when present.
- `lib/documents/actions.ts` — add `processScannedPdfWithVision(documentId, providerConfig)` mirroring `runChandraForDocument` but BYOK-only and quota-free.
- `app/documents/[id]/DocumentClient.tsx` — extend `describeMode` with `vision_*` statuses; add "Process with BYOK Vision beta" button on the `needs_ocr` panel with capability gate, cost-warning confirm, and `vision_failed` re-render keeping "View original scan".

---

## Task 1: Add vision capability flag and `providerSupportsVision()` helper

**Files:**
- Modify: `lib/llm/types.ts`

- [ ] **Step 1: Open `lib/llm/types.ts` and replace the `LLM_DEFAULTS` block plus add the helper**

Find this block at the bottom of the file:

```ts
/** Defaults — referenced by both the provider impl and the AI Settings UI. */
export const LLM_DEFAULTS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o"] as const,
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"] as const,
  },
} as const;
```

Replace with:

```ts
/**
 * Per-model capabilities. `supportsImageInput` is the single source of
 * truth for whether a model can ingest a PDF / image as a content part
 * (used by the BYOK Vision/OCR beta to gate the "Process with BYOK Vision"
 * button and the server-side capability check).
 */
export interface ModelCapabilities {
  supportsImageInput: boolean;
}

/** Defaults — referenced by both the provider impl and the AI Settings UI. */
export const LLM_DEFAULTS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o"] as const,
    capabilities: {
      "gpt-4o-mini": { supportsImageInput: true },
      "gpt-4o": { supportsImageInput: true },
    } satisfies Record<string, ModelCapabilities>,
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"] as const,
    capabilities: {
      "deepseek-v4-flash": { supportsImageInput: false },
      "deepseek-v4-pro": { supportsImageInput: false },
    } satisfies Record<string, ModelCapabilities>,
  },
} as const;

/**
 * Returns true when the configured provider+model can accept image / PDF
 * input. Used to gate the BYOK Vision UI button and to enforce req 8/9
 * at the action boundary. Unknown models default to false (closed by
 * default — safer for "don't pretend DeepSeek supports images").
 */
export function providerSupportsVision(config: LlmProviderConfig): boolean {
  const providerKey: LlmProviderKind =
    config.source === "platform" ? "openai" : config.provider;
  const defaults = LLM_DEFAULTS[providerKey];
  const model =
    config.model ??
    (config.source === "byok"
      ? defaults.defaultModel
      : LLM_DEFAULTS.openai.defaultModel);
  const caps = (defaults.capabilities as Record<string, ModelCapabilities>)[
    model
  ];
  return caps?.supportsImageInput === true;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/readablehtml && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/readablehtml
git add lib/llm/types.ts
git commit -m "feat(llm): add supportsImageInput capability + providerSupportsVision()"
```

---

## Task 2: Widen the table block type with `markdownTable` and `jsonTable`

**Files:**
- Modify: `lib/content.ts`
- Modify: `lib/documents/types.ts`

- [ ] **Step 1: Add the two optional fields to `Paragraph` in `lib/content.ts`**

Find this section in the `Paragraph` type (look for the `htmlTable` comment block):

```ts
  /** Future: HTML table reconstruction. Null until a layout extractor lands. */
  htmlTable?: string | null;
  /** True when the storage bucket has the original PDF, so "View original scan" works. */
  originalScanAvailable?: boolean;
};
```

Replace with:

```ts
  /** Future: HTML table reconstruction. Null until a layout extractor lands. */
  htmlTable?: string | null;
  /** GitHub-flavored markdown reconstruction. Preserved when the vision/Chandra provider returns one. */
  markdownTable?: string;
  /** Structured JSON reconstruction ({ header, rows } or similar). Preserved lossless from the provider; opaque to the renderer for now. */
  jsonTable?: unknown;
  /** True when the storage bucket has the original PDF, so "View original scan" works. */
  originalScanAvailable?: boolean;
};
```

- [ ] **Step 2: Mirror the widening in `lib/documents/types.ts`**

Find this section in `SerializedParagraph`:

```ts
  htmlTable?: string | null;
  originalScanAvailable?: boolean;
}
```

Replace with:

```ts
  htmlTable?: string | null;
  markdownTable?: string;
  jsonTable?: unknown;
  originalScanAvailable?: boolean;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd ~/readablehtml && npx tsc --noEmit
```

Expected: no errors. Existing consumers of `Paragraph`/`SerializedParagraph` are unaffected — all new fields are optional.

- [ ] **Step 4: Commit**

```bash
cd ~/readablehtml
git add lib/content.ts lib/documents/types.ts
git commit -m "feat(content): widen table block with markdownTable + jsonTable"
```

---

## Task 3: Add `vision_*` statuses and `byok_vision` processing_mode to TS unions

**Files:**
- Modify: `lib/documents/types.ts`

- [ ] **Step 1: Extend `DocumentStatus`**

Find:

```ts
export type DocumentStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "ready"
  | "failed"
  | "needs_ocr"
  // OCR pipeline stub — not active in alpha; superseded by chandra_* below
  | "ocr_queued"
  | "ocr_processing"
  | "ocr_ready"
  | "ocr_failed"
  // Chandra (layout-aware OCR) pipeline — provider stub today, surface ready
  | "chandra_queued"
  | "chandra_processing"
  | "chandra_ready"
  | "chandra_failed";
```

Replace with:

```ts
export type DocumentStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "ready"
  | "failed"
  | "needs_ocr"
  // OCR pipeline stub — not active in alpha; superseded by chandra_* below
  | "ocr_queued"
  | "ocr_processing"
  | "ocr_ready"
  | "ocr_failed"
  // Chandra (layout-aware OCR) pipeline — provider stub today, surface ready
  | "chandra_queued"
  | "chandra_processing"
  | "chandra_ready"
  | "chandra_failed"
  // BYOK Vision/OCR beta — user-triggered OpenAI vision processing of scanned PDFs.
  | "vision_queued"
  | "vision_processing"
  | "vision_ready"
  | "vision_failed";
```

- [ ] **Step 2: Extend `ProcessingMode`**

Find:

```ts
export type ProcessingMode =
  | "extraction_only"
  | "structured"
  | "ai_structured"
  | "chandra";
```

Replace with:

```ts
export type ProcessingMode =
  | "extraction_only"
  | "structured"
  | "ai_structured"
  | "chandra"
  | "byok_vision";
```

- [ ] **Step 3: Typecheck**

```bash
cd ~/readablehtml && npx tsc --noEmit
```

Expected: errors in `app/documents/[id]/DocumentClient.tsx` for the `describeMode` switch (it has no case for the new statuses). Note them — Task 8 fixes them. If no other errors appear, proceed.

- [ ] **Step 4: Commit**

```bash
cd ~/readablehtml
git add lib/documents/types.ts
git commit -m "feat(types): add vision_* statuses and byok_vision processing_mode"
```

---

## Task 4: Database migration `0009_byok_vision.sql`

**Files:**
- Create: `supabase/migrations/0009_byok_vision.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_byok_vision.sql` with:

```sql
-- ReadableHTML — BYOK Vision/OCR beta
-- Adds vision_* document statuses and 'byok_vision' processing_mode value.
-- No new tables. State tracked entirely on the documents row, matching the
-- 'lightweight v1' decision in the design spec (no vision_jobs audit table
-- for the alpha — reconsider when observability is needed).

-- 1. documents.status — add vision_* lifecycle values.
alter table public.documents
  drop constraint if exists documents_status_check;

alter table public.documents
  add constraint documents_status_check
    check (status in (
      'uploaded',
      'queued',
      'processing',
      'ready',
      'failed',
      'needs_ocr',
      'ocr_queued',
      'ocr_processing',
      'ocr_ready',
      'ocr_failed',
      'chandra_queued',
      'chandra_processing',
      'chandra_ready',
      'chandra_failed',
      'vision_queued',
      'vision_processing',
      'vision_ready',
      'vision_failed'
    ));

-- 2. documents.processing_mode — add 'byok_vision' so the UI mode pill can
--    show "BYOK Vision (beta)" distinctly from Chandra and AI structuring.
alter table public.documents
  drop constraint if exists documents_processing_mode_check;

alter table public.documents
  add constraint documents_processing_mode_check
    check (processing_mode in (
      'extraction_only',
      'structured',
      'ai_structured',
      'chandra',
      'byok_vision'
    ));
```

- [ ] **Step 2: Quick sanity check that file lints as SQL**

```bash
cd ~/readablehtml && cat supabase/migrations/0009_byok_vision.sql | head -5
```

Expected: prints the first 5 lines of the migration.

- [ ] **Step 3: Commit**

```bash
cd ~/readablehtml
git add supabase/migrations/0009_byok_vision.sql
git commit -m "feat(db): migration 0009 — vision_* statuses and byok_vision mode"
```

> **Operator note (not executed by this plan):** the migration must be applied to the Supabase project (e.g. `supabase db push` or via the dashboard) before the new action will succeed at status transitions.

---

## Task 5: Forward `markdownTable` / `jsonTable` through `chandra-mapper`

This keeps the existing Chandra path lossless once the underlying `ChandraBlock` already carries those fields, and unifies behavior with the vision mapper.

**Files:**
- Modify: `lib/documents/chandra-mapper.ts`

- [ ] **Step 1: Replace the `case "table":` block**

Find:

```ts
    case "table": {
      const caption = (block.caption ?? "").trim() || `Table on page ${block.page}`;
      const htmlTable = block.htmlTable?.trim() || null;
      return {
        id,
        page: block.page,
        inline: [{ type: "text", text: caption }],
        blockType: "table",
        caption,
        htmlTable,
        confidence: htmlTable ? "extracted_rows" : "detected_caption_only",
        originalScanAvailable: true,
        rawText: block.text ?? block.markdownTable ?? caption,
      };
    }
```

Replace with:

```ts
    case "table": {
      const caption = (block.caption ?? "").trim() || `Table on page ${block.page}`;
      const htmlTable = block.htmlTable?.trim() || null;
      const markdownTable = block.markdownTable?.trim() || undefined;
      const jsonTable = block.jsonTable ?? undefined;
      const hasStructure = !!(htmlTable || markdownTable || jsonTable);
      return {
        id,
        page: block.page,
        inline: [{ type: "text", text: caption }],
        blockType: "table",
        caption,
        htmlTable,
        markdownTable,
        jsonTable,
        confidence: hasStructure ? "extracted_rows" : "detected_caption_only",
        originalScanAvailable: true,
        rawText: block.text ?? block.markdownTable ?? caption,
      };
    }
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/readablehtml && npx tsc --noEmit
```

Expected: same errors as Task 3 (`DocumentClient.tsx` switch coverage) and no new errors.

- [ ] **Step 3: Commit**

```bash
cd ~/readablehtml
git add lib/documents/chandra-mapper.ts
git commit -m "feat(chandra): forward markdownTable + jsonTable on table blocks"
```

---

## Task 6: Export `classifyError` from the LLM provider for reuse

**Files:**
- Modify: `lib/llm/provider.ts`

- [ ] **Step 1: Add `export` to the existing `classifyError` declaration**

Find:

```ts
/** Translate an SDK error into a structured LlmProviderError. */
function classifyError(provider: LlmProviderKind, err: unknown): LlmProviderError {
```

Replace with:

```ts
/** Translate an SDK error into a structured LlmProviderError. */
export function classifyError(provider: LlmProviderKind, err: unknown): LlmProviderError {
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/readablehtml && npx tsc --noEmit
```

Expected: same errors as Task 3 and no new errors.

- [ ] **Step 3: Commit**

```bash
cd ~/readablehtml
git add lib/llm/provider.ts
git commit -m "refactor(llm): export classifyError for reuse in vision provider"
```

---

## Task 7: `VisionProvider` + `OpenAiVisionProvider`

**Files:**
- Create: `lib/documents/vision-provider.ts`

- [ ] **Step 1: Write `lib/documents/vision-provider.ts`**

```ts
import "server-only";

import OpenAI from "openai";
import { classifyError, LlmProviderError } from "@/lib/llm/provider";
import type { ChandraBlock, ChandraPage } from "./chandra-provider";

/**
 * BYOK Vision provider — sends the whole (≤10 page) PDF to the user's
 * OpenAI vision model as a base64 `file` content part and parses the
 * strict-JSON response into the same block shape that Chandra emits, so
 * the downstream mapper / persistence / reading view stays identical.
 *
 * Security:
 *   - The BYOK key is captured into the OpenAI SDK closure for the
 *     duration of one `convertPdf` call. It is never logged, never
 *     persisted, never returned to the client. The action layer enforces
 *     that this provider is only invoked with `source: "byok"` configs
 *     (req 12).
 *   - Network errors are translated via the shared `classifyError`
 *     helper from `lib/llm/provider.ts` so the UI sees consistent
 *     invalid_key / rate_limit / unsupported_model / provider_unavailable
 *     messages.
 */

export interface VisionResult {
  pages: ChandraPage[]; // reuses { page, blocks: ChandraBlock[] }
  pageCount: number;
  provider: "byok_vision";
  modelUsed: string;
  /** Kept in memory only — NOT persisted in v1. */
  rawApiResponse?: unknown;
}

export interface VisionConvertOptions {
  documentId: string;
  apiKey: string;
  model: string;
  pageCount: number;
}

export interface VisionProvider {
  isConfigured(): boolean;
  convertPdf(buf: Uint8Array, opts: VisionConvertOptions): Promise<VisionResult>;
}

const SYSTEM_PROMPT = `You convert scanned/image-based PDFs into structured JSON blocks for a reading app.

For every visible page, list every text block in reading order, classified into one of six types:
- heading
- paragraph
- table
- figure
- footnote
- metadata

Return STRICTLY this JSON shape (no prose, no markdown fences):

{
  "pages": [
    {
      "page": <1-indexed integer>,
      "blocks": [
        {
          "blockType": "heading" | "paragraph" | "table" | "figure" | "footnote" | "metadata",
          "text": <string, for heading | paragraph | footnote | metadata>,
          "level": <1..6, for heading only>,
          "caption": <string, for table | figure>,
          "htmlTable": <"<table>...</table>" HTML, for table>,
          "markdownTable": <GitHub-flavored markdown table, for table>,
          "jsonTable": { "header": [string], "rows": [[string]] },
          "figureDescription": <string, for figure>
        }
      ]
    }
  ]
}

Rules:
- Preserve reading order on each page.
- For tables, include AT LEAST ONE of htmlTable / markdownTable / jsonTable; provide multiple when feasible.
- Use "metadata" for running headers/footers/page numbers/author lines.
- Use "footnote" for footnote text at the bottom of a page.
- Do not invent content not visible on the page.
- Do not summarize.
- Use plain text in "text" fields (no HTML, no markdown).`;

const VALID_BLOCK_TYPES = new Set<ChandraBlock["blockType"]>([
  "heading",
  "paragraph",
  "table",
  "figure",
  "footnote",
  "metadata",
]);

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Coerce the model's JSON output into a `VisionResult`. Throws an
 * LlmProviderError on schema failures. Permissive about extra fields,
 * strict about block types and the top-level shape.
 */
export function parseVisionJson(
  raw: unknown,
  pageCount: number,
  modelUsed: string,
): VisionResult {
  if (!raw || typeof raw !== "object") {
    throw new LlmProviderError(
      "openai",
      "unknown",
      "BYOK Vision returned non-object JSON.",
    );
  }
  const pagesRaw = (raw as { pages?: unknown }).pages;
  if (!Array.isArray(pagesRaw)) {
    throw new LlmProviderError(
      "openai",
      "unknown",
      'BYOK Vision JSON missing "pages" array.',
    );
  }
  const pages: ChandraPage[] = [];
  for (const p of pagesRaw) {
    if (!p || typeof p !== "object") continue;
    const pageNum = asNumber((p as { page?: unknown }).page) ?? pages.length + 1;
    const blocksRaw = (p as { blocks?: unknown }).blocks;
    const blocks: ChandraBlock[] = [];
    if (Array.isArray(blocksRaw)) {
      for (const b of blocksRaw) {
        if (!b || typeof b !== "object") continue;
        const t = asString((b as { blockType?: unknown }).blockType);
        if (!t || !VALID_BLOCK_TYPES.has(t as ChandraBlock["blockType"])) continue;
        const block: ChandraBlock = {
          blockType: t as ChandraBlock["blockType"],
          page: pageNum,
        };
        const text = asString((b as { text?: unknown }).text);
        if (text !== undefined) block.text = text;
        const caption = asString((b as { caption?: unknown }).caption);
        if (caption !== undefined) block.caption = caption;
        const level = asNumber((b as { level?: unknown }).level);
        if (level !== undefined) block.level = level;
        const htmlTable = asString((b as { htmlTable?: unknown }).htmlTable);
        if (htmlTable !== undefined) block.htmlTable = htmlTable;
        const markdownTable = asString(
          (b as { markdownTable?: unknown }).markdownTable,
        );
        if (markdownTable !== undefined) block.markdownTable = markdownTable;
        const jsonTable = (b as { jsonTable?: unknown }).jsonTable;
        if (jsonTable !== undefined) block.jsonTable = jsonTable;
        const figureDescription = asString(
          (b as { figureDescription?: unknown }).figureDescription,
        );
        if (figureDescription !== undefined)
          block.figureDescription = figureDescription;
        blocks.push(block);
      }
    }
    pages.push({ page: pageNum, blocks });
  }
  if (pages.length === 0) {
    throw new LlmProviderError(
      "openai",
      "unknown",
      "BYOK Vision returned no usable pages.",
    );
  }
  return {
    pages,
    pageCount,
    provider: "byok_vision",
    modelUsed,
    rawApiResponse: raw,
  };
}

export class OpenAiVisionProvider implements VisionProvider {
  isConfigured(): boolean {
    return true; // BYOK is configured by the caller per-invocation.
  }

  async convertPdf(
    buf: Uint8Array,
    opts: VisionConvertOptions,
  ): Promise<VisionResult> {
    const client = new OpenAI({ apiKey: opts.apiKey });
    const b64 = Buffer.from(buf).toString("base64");
    let completion;
    try {
      completion = await client.chat.completions.create({
        model: opts.model,
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            // The `file` content part is supported on gpt-4o family for
            // PDF input. The SDK's typed content-parts union may lag a
            // hair behind the runtime API, so cast to satisfy types
            // without changing runtime payload shape.
            content: [
              {
                type: "file",
                file: {
                  filename: `${opts.documentId}.pdf`,
                  file_data: `data:application/pdf;base64,${b64}`,
                },
              },
              {
                type: "text",
                text: `This scanned PDF has ${opts.pageCount} page(s). Return strict JSON per the system instructions, covering every page.`,
              },
            ] as unknown as OpenAI.Chat.Completions.ChatCompletionContentPart[],
          },
        ],
      });
    } catch (err) {
      throw classifyError("openai", err);
    }
    const content = completion.choices[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new LlmProviderError(
        "openai",
        "unknown",
        "BYOK Vision returned non-JSON output.",
      );
    }
    return parseVisionJson(parsed, opts.pageCount, opts.model);
  }
}

/** Constructor helper for the action layer. */
export function getOpenAiVisionProvider(): VisionProvider {
  return new OpenAiVisionProvider();
}
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/readablehtml && npx tsc --noEmit
```

Expected: same `DocumentClient.tsx` switch errors from Task 3, and no new errors.

- [ ] **Step 3: Commit**

```bash
cd ~/readablehtml
git add lib/documents/vision-provider.ts
git commit -m "feat(vision): add OpenAI BYOK vision provider with JSON validator"
```

---

## Task 8: `visionToSections` mapper

**Files:**
- Create: `lib/documents/vision-mapper.ts`

- [ ] **Step 1: Write the mapper**

```ts
import "server-only";

import { chandraToSections } from "./chandra-mapper";
import type { ChandraResult } from "./chandra-provider";
import type { StructuredSectionInput } from "./structuring";
import type { VisionResult } from "./vision-provider";

/**
 * Convert a `VisionResult` into `StructuredSectionInput[]`. Reuses
 * `chandraToSections` for the heading→section pass (the block contract
 * is identical), then leans on the existing `chandra-mapper` table-block
 * logic (which Task 5 widened to forward `markdownTable` + `jsonTable`
 * losslessly per req 7).
 *
 * This file exists as its own indirection so a future change to vision
 * handling (e.g. confidence labeling) doesn't bleed back into the
 * Chandra mapper.
 */
export function visionToSections(
  result: VisionResult,
): StructuredSectionInput[] {
  // ChandraResult and VisionResult differ only in `provider` tag; the
  // `pages`/`blocks` shape is identical, so a shallow re-tag is enough.
  const asChandra: ChandraResult = {
    pages: result.pages,
    pageCount: result.pageCount,
    provider: "chandra",
    rawApiResponse: result.rawApiResponse,
  };
  return chandraToSections(asChandra);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/readablehtml && npx tsc --noEmit
```

Expected: same `DocumentClient.tsx` switch errors from Task 3, no new errors.

- [ ] **Step 3: Commit**

```bash
cd ~/readablehtml
git add lib/documents/vision-mapper.ts
git commit -m "feat(vision): add visionToSections mapper"
```

---

## Task 9: Server action `processScannedPdfWithVision`

**Files:**
- Modify: `lib/documents/actions.ts`

- [ ] **Step 1: Add the imports**

Find the imports block near the top of `lib/documents/actions.ts`. Add these alongside the existing Chandra imports:

```ts
import { LLM_DEFAULTS, providerSupportsVision } from "@/lib/llm/types";
import type { LlmErrorCode, LlmProviderConfig } from "@/lib/llm/types";
import { toClientLlmError } from "@/lib/llm/provider";
import { getOpenAiVisionProvider } from "./vision-provider";
import { visionToSections } from "./vision-mapper";
```

(If any of these are already imported, merge into the existing import line rather than duplicating.)

- [ ] **Step 2: Append the new action after the existing `toInsertRow` helper**

Find the end of the `toInsertRow` function in `lib/documents/actions.ts` (around line 720+). Insert the following before the next `export async function` (e.g. `restructureDocument`):

```ts
/**
 * BYOK Vision/OCR beta — process a `needs_ocr` (scanned/image) PDF with
 * the user's own OpenAI vision key. Mirrors `runChandraForDocument`'s
 * fail-safe ordering but is BYOK-only (never reads the platform key) and
 * does NOT touch `user_usage` (BYOK never burns platform quota — matches
 * `explainParagraphAction`'s pattern).
 *
 * Two-layer enforcement of req 8/9 + req 12:
 *   - The UI button is disabled when `providerSupportsVision(config)` is
 *     false (see DocumentClient.tsx). The action ALSO checks here so a
 *     hand-crafted request can't bypass the UI gate.
 *   - The action checks `source === "byok"` and `provider === "openai"`
 *     before constructing any HTTP client. Platform-mode requests are
 *     rejected with a clear error.
 *
 * On any failure, `document_pages` is left untouched and the doc returns
 * to a state where "View original scan" still works (req 13).
 */
export async function processScannedPdfWithVision(
  documentId: string,
  providerConfig: LlmProviderConfig,
): Promise<
  Result<{
    status: "vision_ready";
    mode: "byok_vision";
    pageCount: number;
  }> & { code?: LlmErrorCode }
> {
  const { supabase, user } = await requireUser();

  const { data: doc, error: fetchErr } = await supabase
    .from("documents")
    .select("id, user_id, storage_path, status, page_count")
    .eq("id", documentId)
    .single();
  if (fetchErr || !doc) return { error: "Document not found." };
  if (doc.user_id !== user.id) return { error: "Not authorized." };

  // Req 8/9: capability check — server-side mirror of the UI gate.
  if (!providerSupportsVision(providerConfig)) {
    return {
      error:
        "This provider can explain extracted text, but cannot process scanned PDFs.",
    };
  }

  // Req 12: BYOK only. Never read process.env.OPENAI_API_KEY here.
  if (providerConfig.source !== "byok") {
    return {
      error:
        "BYOK Vision requires a bring-your-own-key OpenAI configuration. Platform mode is not supported for scanned PDFs in the beta.",
    };
  }
  if (providerConfig.provider !== "openai") {
    return {
      error: "BYOK Vision currently supports only OpenAI keys.",
    };
  }
  const apiKey = (providerConfig.apiKey ?? "").trim();
  if (apiKey.length === 0) {
    return { error: "BYOK Vision requires a non-empty OpenAI API key." };
  }

  // Req 10a: hard 10-page cap. Refuse if page_count is unknown rather
  // than silently allowing — clearer error than burning a vision call.
  const pageCount = doc.page_count;
  if (pageCount === null || pageCount === undefined) {
    return {
      error:
        "Page count is unknown for this PDF. Re-upload and try again before running BYOK Vision.",
    };
  }
  const HARD_PAGE_CAP = 10;
  if (pageCount > HARD_PAGE_CAP) {
    return {
      error: `This PDF has ${pageCount} pages; BYOK Vision is capped at ${HARD_PAGE_CAP} pages per job on the alpha.`,
    };
  }

  const model =
    providerConfig.model ?? LLM_DEFAULTS.openai.defaultModel;

  // Transition: status → vision_queued. Existing document_pages stay
  // intact through this and the next two steps (req 13).
  await supabase
    .from("documents")
    .update({ status: "vision_queued", error: null })
    .eq("id", documentId);

  // Re-download the PDF.
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(doc.storage_path);
  if (dlErr || !fileBlob) {
    const msg = dlErr?.message ?? "Could not re-read uploaded PDF.";
    await supabase
      .from("documents")
      .update({ status: "vision_failed", error: msg })
      .eq("id", documentId);
    revalidatePath(`/documents/${documentId}`);
    return { error: msg };
  }

  await supabase
    .from("documents")
    .update({ status: "vision_processing" })
    .eq("id", documentId);

  const buf = new Uint8Array(await fileBlob.arrayBuffer());
  const provider = getOpenAiVisionProvider();
  let result;
  try {
    result = await provider.convertPdf(buf, {
      documentId,
      apiKey,
      model,
      pageCount,
    });
  } catch (err) {
    const { code, message } = toClientLlmError(err);
    await supabase
      .from("documents")
      .update({ status: "vision_failed", error: message })
      .eq("id", documentId);
    revalidatePath(`/documents/${documentId}`);
    return { error: `BYOK Vision failed: ${message}`, code };
  }

  // Map + replace document_pages (the only destructive step). If the
  // insert fails after the delete, surface a clear "succeeded but
  // couldn't save — try again" error, matching the Chandra pattern.
  const sections = visionToSections(result);
  await supabase
    .from("document_pages")
    .delete()
    .eq("document_id", documentId);
  const rows = sections.map(toInsertRow.bind(null, documentId));
  if (rows.length > 0) {
    const { error: insertErr } = await supabase
      .from("document_pages")
      .insert(rows);
    if (insertErr) {
      await supabase
        .from("documents")
        .update({
          status: "vision_failed",
          error: `BYOK Vision succeeded but document_pages insert failed: ${insertErr.message}`,
        })
        .eq("id", documentId);
      revalidatePath(`/documents/${documentId}`);
      return {
        error: `BYOK Vision succeeded but couldn't save the result: ${insertErr.message}. Try re-running.`,
      };
    }
  }

  await supabase
    .from("documents")
    .update({
      status: "vision_ready",
      processing_mode: "byok_vision",
      page_count: result.pageCount || pageCount,
      error: null,
    })
    .eq("id", documentId);

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/dashboard");

  return {
    ok: true,
    data: {
      status: "vision_ready",
      mode: "byok_vision",
      pageCount: result.pageCount,
    },
  };
}
```

- [ ] **Step 3: Typecheck**

```bash
cd ~/readablehtml && npx tsc --noEmit
```

Expected: still the `DocumentClient.tsx` switch errors from Task 3, no new errors.

- [ ] **Step 4: Commit**

```bash
cd ~/readablehtml
git add lib/documents/actions.ts
git commit -m "feat(actions): add processScannedPdfWithVision server action"
```

---

## Task 10: UI — `needs_ocr` panel button + status pill coverage

**Files:**
- Modify: `app/documents/[id]/DocumentClient.tsx`

- [ ] **Step 1: Add imports for the new action and the capability helper**

Find the existing imports at the top of `app/documents/[id]/DocumentClient.tsx`. Locate the line:

```ts
  runChandraForDocument,
```

In the same import block from `@/lib/documents/actions`, add `processScannedPdfWithVision` so the block looks like:

```ts
  runChandraForDocument,
  processScannedPdfWithVision,
```

And add to the existing `@/lib/llm/types` import line so it includes `providerSupportsVision` (if `@/lib/llm/types` isn't imported yet, add the line):

```ts
import { providerSupportsVision } from "@/lib/llm/types";
```

No new icon imports needed. `Sparkles` and `Loader2` (used by the BYOK Vision button in step 5) are already imported in this file — `Sparkles` is the "Restructure with AI" button icon, `Loader2` is the spinner used by the Chandra button.

- [ ] **Step 2: Extend `describeMode` with the four `vision_*` cases**

Find the `describeMode` switch (around line 75–172). Locate the `case "chandra_failed":` block (ends with `Icon: CircleAlert,` and a closing `};`) and immediately after its `};` (before the `default:` case at ~line 165), insert:

```ts
    case "vision_queued":
      return {
        label: "Vision queued",
        tone: "text-violet-700",
        modeLabel: "BYOK Vision (beta)",
        Icon: FileText,
      };
    case "vision_processing":
      return {
        label: "Vision running",
        tone: "text-violet-700",
        modeLabel: "BYOK Vision (beta)",
        Icon: Loader2,
      };
    case "vision_ready":
      return {
        label: "Vision ready",
        tone: "text-emerald-700",
        modeLabel: "BYOK Vision (beta)",
        Icon: CircleCheckBig,
      };
    case "vision_failed":
      return {
        label: "Vision failed",
        tone: "text-red-700",
        modeLabel: "BYOK Vision error",
        Icon: CircleAlert,
      };
```

The shape `{ label, tone, modeLabel, Icon }` matches every other case in `describeMode`. `FileText`, `Loader2`, `CircleCheckBig`, and `CircleAlert` are already imported at the top of the file (they're used by the existing OCR/Chandra cases) — no new icon imports needed.

- [ ] **Step 3: Add a `useTransition` hook for the vision run**

Find the existing line:

```ts
  const [chandraRunning, startChandra] = useTransition();
```

Add directly below it:

```ts
  const [visionRunning, startVision] = useTransition();
```

- [ ] **Step 4: Add the `handleRunVision` handler**

Find `function handleRunChandra() {` and the matching closing brace. Add **after** that function:

```ts
  function handleRunVision() {
    if (
      !providerSupportsVision(aiSettings.config) ||
      aiSettings.config.source !== "byok" ||
      aiSettings.config.provider !== "openai"
    ) {
      setRestructureError(
        "This provider can explain extracted text, but cannot process scanned PDFs.",
      );
      return;
    }
    const cap = 10;
    const pages = document.page_count ?? "an unknown number of";
    const ok = window.confirm(
      `Process this scanned PDF with your BYOK OpenAI key?\n\n` +
        `Up to ${pages} page(s) (cap: ${cap}) will be sent directly to OpenAI from your account — you will be billed by OpenAI for the request.\n\n` +
        `The result will replace the current document_pages. Existing pages remain intact if processing fails.`,
    );
    if (!ok) return;
    setRestructureError(null);
    startVision(async () => {
      const res = await processScannedPdfWithVision(
        document.id,
        aiSettings.config,
      );
      if ("error" in res) {
        setRestructureError(res.error);
        return;
      }
      setRestructureError(
        `BYOK Vision completed: ${res.data.pageCount} page(s) processed.`,
      );
    });
  }
```

> The `setRestructureError` setter is the existing one already used by `handleRunChandra` for status messages. We reuse it intentionally so the user sees inline feedback in the same place.

- [ ] **Step 5: Add the BYOK Vision button on the `needs_ocr` panel**

Find the existing block (around line 630):

```tsx
                <button
                  type="button"
                  onClick={handleRunChandra}
                  disabled={chandraRunning}
                  title="Run Chandra (layout-aware OCR) on this scanned PDF (1 Chandra job)"
                  ...
                  {chandraRunning
                    ? "Chandra running…"
                    : "Run OCR with Chandra"}
                  <span className="text-2xs uppercase tracking-eyebrow text-amber-700/80 ml-1">
                    beta
                  </span>
                </button>
```

Directly **after** that button's closing `</button>` (before any sibling element like `{restructureError && (`), insert the BYOK Vision button:

```tsx
                {(() => {
                  const visionCapable =
                    providerSupportsVision(aiSettings.config) &&
                    aiSettings.config.source === "byok" &&
                    aiSettings.config.provider === "openai";
                  const disabled = visionRunning || !visionCapable;
                  const title = visionCapable
                    ? "Process this scanned PDF with your BYOK OpenAI vision key (max 10 pages; you are billed by OpenAI)"
                    : "This provider can explain extracted text, but cannot process scanned PDFs.";
                  return (
                    <button
                      type="button"
                      onClick={handleRunVision}
                      disabled={disabled}
                      title={title}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-violet-300 bg-violet-50 text-[12px] font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors no-tap-highlight"
                    >
                      {visionRunning ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {visionRunning
                        ? "BYOK Vision running…"
                        : "Process with BYOK Vision"}
                      <span className="text-2xs uppercase tracking-eyebrow text-violet-700/80 ml-1">
                        beta
                      </span>
                    </button>
                  );
                })()}
                {!providerSupportsVision(aiSettings.config) && (
                  <p className="max-w-[40ch] text-[11.5px] text-ink-muted mt-1">
                    This provider can explain extracted text, but cannot
                    process scanned PDFs. Switch to an OpenAI BYOK model
                    (gpt-4o-mini or gpt-4o) in <strong>AI Settings</strong>.
                  </p>
                )}
```

- [ ] **Step 6: Ensure the `restructuring` aggregate reflects vision state**

Find the existing line:

```ts
  const restructuring = restructuringAi || restructuringPlain || chandraRunning;
```

Replace with:

```ts
  const restructuring =
    restructuringAi || restructuringPlain || chandraRunning || visionRunning;
```

- [ ] **Step 7: Typecheck**

```bash
cd ~/readablehtml && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd ~/readablehtml
git add app/documents/\[id\]/DocumentClient.tsx
git commit -m "feat(ui): add BYOK Vision button to needs_ocr panel + status pills"
```

---

## Task 11: Final `npm run build` and manual smoke checklist

**Files:** (no edits)

- [ ] **Step 1: Run the production build (req 14)**

```bash
cd ~/readablehtml && npm run build
```

Expected: build completes with no TypeScript errors and no ESLint errors. If `next` warns about dynamic Server Action routes for the new action, that's expected behavior.

- [ ] **Step 2: Run the manual-smoke checklist**

Walk through each scenario in a running dev server (`npm run dev`) against a Supabase project where migration 0009 has been applied. Confirm:

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Open AI Settings, pick **DeepSeek BYOK**, open a `needs_ocr` doc. | "Process with BYOK Vision" button is **disabled**, title shows the req-9 copy verbatim, hint paragraph below tells the user to switch to an OpenAI BYOK model. |
| 2 | Open AI Settings, pick **Platform (OpenAI)**, open a `needs_ocr` doc. | Button is **disabled** (Platform mode is not BYOK in v1). |
| 3 | Open AI Settings, pick **OpenAI BYOK** with `gpt-4o-mini` and a valid key, open a 1–2 page `needs_ocr` scanned PDF. | Button is **enabled**. Clicking opens a `window.confirm` dialog naming the page count and the OpenAI billing warning. Cancelling does nothing. |
| 4 | Run scenario 3 to completion with a valid OpenAI key. | Document transitions through `vision_queued` → `vision_processing` → `vision_ready`. Reading view renders the structured output. Mode pill reads "BYOK Vision (beta)". |
| 5 | Repeat with a known-bad OpenAI key. | Document ends at `vision_failed` with the `invalid_key` message. **"View original scan"** is still present on the panel. `document_pages` rows are still empty/hidden (legacy synthetic rows are not surfaced). |
| 6 | Upload an 11+ page scanned PDF, BYOK OpenAI. | Button click returns the 10-page-cap error; no OpenAI call is made; status unchanged. |
| 7 | Open the Network tab during scenario 3. | The OpenAI API key never appears in any request to your own server beyond the single server-action invocation. `localStorage`, `sessionStorage`, and cookies show no entry containing the key (search devtools Application tab). |

- [ ] **Step 3: Commit the (unmodified) plan checkpoint**

If everything passes, the work is done. No further commit is required for the smoke pass itself (no files changed in Task 11). If anything fails, fix and re-run.

---

## Self-review notes (recorded during plan writing)

Spec-vs-plan coverage:

- §1 Goal — Tasks 1, 7, 8, 9, 10 (capability flag, provider, mapper, action, UI).
- §2 Non-goals — explicitly preserved (no test framework, no `byok_vision_jobs`, no Platform-vision path in v1, unpdf and Chandra untouched).
- §3 flow diagram — implemented step-for-step in Task 9 plus UI gate in Task 10.
- §4.1 capability — Task 1.
- §4.2 vision provider — Task 7 (incl. JSON validator, system prompt verbatim, classifyError reuse via Task 6).
- §4.3 vision mapper — Task 8.
- §4.4 action — Task 9 (every step in the table).
- §4.5 type widening — Tasks 2 and 3.
- §4.6 UI — Task 10 (all six sub-steps).
- §4.7 migration — Task 4.
- §5 security — enforced in Task 9 (BYOK-only, no platform fallback) and Task 7 (closure-only key, classifyError redaction). Spec-level "no new persistence" is satisfied because no task introduces `localStorage` / `sessionStorage` / cookie / Supabase writes for the key.
- §6 error matrix — Task 9 covers each row.
- §7 testing — Task 11 mirrors the spec's verification.
- §8 out-of-scope — left unimplemented intentionally.
- §9 judgment calls — implemented as documented: widened table block (Task 2), single API call (Task 7), no jobs table (Task 4).
