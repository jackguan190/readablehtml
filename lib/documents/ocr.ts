"use server";

/**
 * OCR architecture stub.
 *
 * Status: **not implemented**. This module exists so the rest of the
 * codebase (UI, types, quota, RLS) can be wired against a stable surface
 * before a real OCR provider (Chandra, Tesseract, AWS Textract, etc.) is
 * integrated. Today every call returns a "not yet implemented" error.
 *
 * Why a stub now?
 *   - The `needs_ocr` flow currently shows a dead-end ("OCR is required")
 *     panel. The "Run OCR (beta)" button needs SOMETHING to call.
 *   - Schema changes (new status enum values, ocr_jobs table, ocr_job
 *     quota kind) ship with this stub so we don't need a coordinated
 *     migration + code release when OCR actually arrives.
 *   - Future-Claude (or future-anyone) can swap `runOcrForDocument`'s body
 *     for a real provider integration without rewiring callers.
 *
 * Future implementation contract (when Chandra is added):
 *   1. Peek `consume_quota("ocr_job")` to fail fast on cap.
 *   2. Download the PDF from Storage.
 *   3. Set documents.status = "ocr_queued", insert ocr_jobs row.
 *   4. Set documents.status = "ocr_processing", call provider.
 *   5. On success: write extracted text into document_pages (the existing
 *      structuring layer can consume the result via the same RawPage[]
 *      shape extraction.ts produces); set documents.status = "ocr_ready"
 *      (or just "ready"); set ocr_jobs row to "succeeded".
 *   6. On failure: documents.status = "ocr_failed"; ocr_jobs row to
 *      "failed" with `error`.
 *   7. Consume the OCR quota ONLY after success (same pattern as
 *      restructureWithAI — see [[feedback-mvp-first-fallback]]).
 *
 * The provider boundary is intentionally narrow so the rest of the system
 * doesn't care which OCR service runs.
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ALPHA_LIMITS, quotaExceededMessage } from "@/lib/usage/quota";

export type OcrProvider = "chandra" | "tesseract" | "textract";

/** Per-document page cap. Enforced at the action layer. */
export const MAX_OCR_PAGES_PER_DOC: number = ALPHA_LIMITS.ocrPagesPerDoc;

/** Providers we plan to support. None are wired yet. */
export const OCR_PROVIDERS: ReadonlyArray<OcrProvider> = [
  "chandra",
  "tesseract",
  "textract",
];

export interface OcrJobRow {
  id: string;
  document_id: string;
  user_id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  provider: OcrProvider | null;
  page_count: number | null;
  pages_done: number;
  attempts: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  created_at: string;
}

type Result<T> = { error: string } | { ok: true; data: T };

async function requireUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/**
 * STUB: Kick off an OCR job for `documentId`.
 *
 * In the alpha this always returns an error — there is no OCR provider
 * configured and `consume_quota("ocr_job")` will refuse anyway (limit 0).
 * Once a provider is wired up:
 *   - bump `ALPHA_LIMITS.ocrJobs` and the matching SQL function limit
 *   - fill in this function body per the contract documented above
 *   - flip the UI button from disabled to active in `DocumentClient`
 */
export async function runOcrForDocument(
  documentId: string,
): Promise<Result<{ jobId: string }>> {
  const { supabase, user } = await requireUser();

  // Validate the document exists, belongs to the user, and is in a state
  // where OCR is meaningful. This validation is real even though the
  // pipeline body is stubbed — it lets us return useful errors today.
  const { data: doc, error: fetchErr } = await supabase
    .from("documents")
    .select("id, user_id, status, page_count")
    .eq("id", documentId)
    .single();
  if (fetchErr || !doc) return { error: "Document not found." };
  if (doc.user_id !== user.id) return { error: "Not authorized." };
  if (doc.status !== "needs_ocr" && doc.status !== "ocr_failed") {
    return {
      error: `OCR only applies to documents in 'needs_ocr' state (this one is '${doc.status}').`,
    };
  }
  if (
    typeof doc.page_count === "number" &&
    doc.page_count > MAX_OCR_PAGES_PER_DOC
  ) {
    return {
      error: `This PDF has ${doc.page_count} pages, but the alpha caps OCR at ${MAX_OCR_PAGES_PER_DOC} pages per document.`,
    };
  }

  // Hard stop: provider not configured. We never even attempt to consume
  // quota — clearer error message for the user, and avoids burning the
  // ocr_job slot on a no-op (though limit is 0 anyway).
  return {
    error: quotaExceededMessage("ocr_job"),
  };
}
