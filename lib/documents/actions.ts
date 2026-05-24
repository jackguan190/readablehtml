"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractPdfPages } from "./extraction";
import {
  buildHeuristicSections,
  buildPageSections,
  type RawPage,
  type StructuredSectionInput,
} from "./structuring";
import { aiStructure } from "./ai_structuring";
import {
  consumeQuota,
  getUsageSnapshot,
  quotaExceededMessage,
} from "@/lib/usage/quota";

const STORAGE_BUCKET = "documents";

type Result<T> = { error: string } | { ok: true; data: T };

export type ProcessingMode =
  | "extraction_only"
  | "structured"
  | "ai_structured";

async function requireUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}

export async function createDocumentRecord(input: {
  title: string;
  storagePath: string;
  fileSizeBytes: number;
}): Promise<Result<{ id: string }> & { quotaExceeded?: boolean }> {
  const { supabase, user } = await requireUser();

  const quota = await consumeQuota("pdf_upload");
  if ("error" in quota) {
    if (quota.error === "quota_exceeded") {
      return {
        error: quotaExceededMessage("pdf_upload"),
        quotaExceeded: true,
      };
    }
    return { error: quota.error };
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      title: input.title,
      storage_path: input.storagePath,
      file_size_bytes: input.fileSizeBytes,
      status: "uploaded",
      processing_mode: "structured",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create document record." };
  }

  revalidatePath("/dashboard");
  return { ok: true, data: { id: data.id } };
}

export type ProcessingOutcome = "ready" | "needs_ocr" | "failed";

/**
 * Basic processing for text-based PDFs.
 *
 * Mode controls the structuring layer applied after extraction:
 *   - "extraction_only" — one section per page (legacy behavior)
 *   - "structured" — heuristic heading detection + sentence-aware paragraphs (default)
 *   - "ai_structured" — adds OpenAI-driven titles/summaries/key terms; quota-checked;
 *     gracefully falls back to "structured" if the key is missing or the call fails.
 */
export async function runBasicPdfProcessing(
  documentId: string,
  mode: ProcessingMode = "structured",
): Promise<
  Result<{
    status: ProcessingOutcome;
    mode: ProcessingMode;
    firstPageDetection?: string;
  }>
> {
  const { supabase, user } = await requireUser();

  const { data: doc, error: fetchErr } = await supabase
    .from("documents")
    .select("id, user_id, storage_path")
    .eq("id", documentId)
    .single();

  if (fetchErr || !doc) return { error: "Document not found." };
  if (doc.user_id !== user.id) return { error: "Not authorized." };

  const { data: job, error: jobErr } = await supabase
    .from("processing_jobs")
    .insert({ document_id: documentId, status: "queued", attempts: 1 })
    .select("id")
    .single();

  if (jobErr || !job) {
    return { error: jobErr?.message ?? "Could not enqueue processing job." };
  }

  await supabase
    .from("documents")
    .update({ status: "queued" })
    .eq("id", documentId);

  await supabase
    .from("processing_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", job.id);

  await supabase
    .from("documents")
    .update({ status: "processing", error: null })
    .eq("id", documentId);

  // 1. download
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(doc.storage_path);

  if (dlErr || !fileBlob) {
    const msg = dlErr?.message ?? "Could not download uploaded PDF.";
    await markFailed(supabase, documentId, job.id, msg);
    return { error: msg };
  }

  // 2. extract
  const buf = new Uint8Array(await fileBlob.arrayBuffer());
  const outcome = await extractPdfPages(buf);

  if (outcome.kind === "failed") {
    const msg = outcome.error ?? "PDF parsing failed.";
    await markFailed(supabase, documentId, job.id, msg);
    return { error: msg };
  }

  // 3. choose structuring path
  let pagesToInsert: ReturnType<typeof toInsertRow>[];
  let effectiveMode: ProcessingMode = mode;
  let warning: string | null = null;

  if (outcome.kind === "needs_ocr") {
    // Intentionally NO document_pages inserted — synthetic demo content was
    // misleading users into thinking their PDF had been transcribed.
    // Status alone (`needs_ocr`) signals the empty-content state; the
    // DocumentClient renders a dedicated "OCR required" panel instead.
    pagesToInsert = [];
    warning = outcome.warning ?? null;
  } else if (mode === "extraction_only") {
    const sections = buildPageSections(outcome.rawPages);
    pagesToInsert = sections.map(toInsertRow.bind(null, documentId));
  } else if (mode === "ai_structured") {
    const aiOutcome = await tryAiWithQuota(outcome.rawPages);
    if (aiOutcome.kind === "ok") {
      pagesToInsert = aiOutcome.sections.map(toInsertRow.bind(null, documentId));
    } else {
      // graceful fallback
      const heuristic = buildHeuristicSections(outcome.rawPages);
      pagesToInsert = heuristic.sections.map(toInsertRow.bind(null, documentId));
      effectiveMode = "structured";
      warning = aiOutcome.detail ?? null;
    }
  } else {
    const heuristic = buildHeuristicSections(outcome.rawPages);
    pagesToInsert = heuristic.sections.map(toInsertRow.bind(null, documentId));
  }

  if (pagesToInsert.length > 0) {
    const { error: pagesErr } = await supabase
      .from("document_pages")
      .insert(pagesToInsert);

    if (pagesErr) {
      await markFailed(supabase, documentId, job.id, pagesErr.message);
      return { error: pagesErr.message };
    }
  }

  const nextStatus = outcome.kind === "ready" ? "ready" : "needs_ocr";
  await supabase
    .from("documents")
    .update({
      status: nextStatus,
      processing_mode: effectiveMode,
      page_count: outcome.pageCount || pagesToInsert.length,
      error: warning,
    })
    .eq("id", documentId);

  await supabase
    .from("processing_jobs")
    .update({
      status: "succeeded",
      finished_at: new Date().toISOString(),
      error: warning,
    })
    .eq("id", job.id);

  revalidatePath("/dashboard");
  revalidatePath(`/documents/${documentId}`);
  const firstPageDetection =
    outcome.rawPages.find((p) => p.page === 1)?.footnoteDetection ?? "none";
  return {
    ok: true,
    data: { status: nextStatus, mode: effectiveMode, firstPageDetection },
  };
}

/**
 * Re-run structuring for an already-uploaded document using AI.
 *
 * Fail-safe ordering — the document is NOT mutated unless every step succeeds:
 *   1. Peek the AI quota (read-only). Fail fast with `quotaExceeded` if at cap.
 *   2. Re-extract from Storage (idempotent — we don't store raw page text).
 *   3. Call the LLM. If it errors, missing key, or returns malformed JSON,
 *      return a clear message and leave document_pages untouched.
 *   4. Consume one `ai_action` quota slot.
 *   5. Delete + insert document_pages (the only destructive step).
 *
 * Note: existing annotations whose `meta.paragraphId` referenced the old
 * paragraph IDs still display in the NotesPanel by text but won't render
 * as in-body marks after restructuring.
 */
export async function restructureWithAI(
  documentId: string,
): Promise<
  Result<{
    status: ProcessingOutcome;
    mode: ProcessingMode;
    firstPageDetection?: string;
  }> & {
    quotaExceeded?: boolean;
  }
> {
  const { supabase, user } = await requireUser();

  const { data: doc, error: fetchErr } = await supabase
    .from("documents")
    .select("id, user_id, storage_path, status")
    .eq("id", documentId)
    .single();

  if (fetchErr || !doc) return { error: "Document not found." };
  if (doc.user_id !== user.id) return { error: "Not authorized." };
  if (doc.status === "needs_ocr") {
    return {
      error: "AI restructuring is unavailable for scanned PDFs until OCR ships.",
    };
  }

  // 1. peek quota
  const snapshot = await getUsageSnapshot();
  if (snapshot && snapshot.aiActions >= snapshot.limits.ai) {
    return {
      error: quotaExceededMessage("ai_action"),
      quotaExceeded: true,
    };
  }

  // 2. re-extract
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(doc.storage_path);
  if (dlErr || !fileBlob) {
    return { error: dlErr?.message ?? "Could not re-read uploaded PDF." };
  }
  const buf = new Uint8Array(await fileBlob.arrayBuffer());
  const outcome = await extractPdfPages(buf);
  if (outcome.kind !== "ready") {
    return {
      error: outcome.error ?? "PDF is not eligible for AI restructuring.",
    };
  }

  // 3. try AI BEFORE any DB mutation — failures leave the document alone
  const aiOutcome = await aiStructure(outcome.rawPages);
  if (aiOutcome.kind !== "ok") {
    const detail =
      aiOutcome.reason === "no_api_key"
        ? "AI restructuring is unavailable: OPENAI_API_KEY is not configured on the server."
        : aiOutcome.reason === "no_text"
          ? "Document has no extractable text for AI to structure."
          : (aiOutcome.detail ??
              "AI structuring failed. The document is unchanged.");
    return { error: detail };
  }

  // 4. consume quota (now that we know AI succeeded)
  const consumed = await consumeQuota("ai_action");
  if ("error" in consumed) {
    if (consumed.error === "quota_exceeded") {
      return {
        error: quotaExceededMessage("ai_action"),
        quotaExceeded: true,
      };
    }
    return { error: consumed.error };
  }

  // 5. replace document_pages — best-effort
  await supabase.from("document_pages").delete().eq("document_id", documentId);
  const rows = aiOutcome.sections.map(toInsertRow.bind(null, documentId));
  const { error: insertErr } = await supabase
    .from("document_pages")
    .insert(rows);
  if (insertErr) {
    return {
      error: `AI structure was generated but couldn't be saved: ${insertErr.message}. Try re-uploading the document.`,
    };
  }

  await supabase
    .from("documents")
    .update({
      processing_mode: "ai_structured",
      page_count: outcome.pageCount,
      error: null,
      status: "ready",
    })
    .eq("id", documentId);

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/dashboard");

  const firstPageDetection =
    outcome.rawPages.find((p) => p.page === 1)?.footnoteDetection ?? "none";
  return {
    ok: true,
    data: { status: "ready", mode: "ai_structured", firstPageDetection },
  };
}

/**
 * Re-run the heuristic structuring pipeline on an already-uploaded document.
 *
 * Free — does not consume AI quota. Useful for:
 *   - upgrading old documents that were processed with the legacy
 *     extraction_only pipeline (titled "Page 1, Page 2, …")
 *   - re-running structuring after the paragraphizer or heuristic changes
 *   - users without OPENAI_API_KEY who still want better-than-page-per-section
 *
 * Returns `headingsDetected: false` when the heuristic fell back to per-page
 * sections so the UI can show a "No strong headings detected" message.
 */
export async function restructureWithoutAI(
  documentId: string,
): Promise<
  Result<{
    status: ProcessingOutcome;
    mode: ProcessingMode;
    headingsDetected: boolean;
    firstPageDetection?: string;
  }>
> {
  const { supabase, user } = await requireUser();

  const { data: doc, error: fetchErr } = await supabase
    .from("documents")
    .select("id, user_id, storage_path, status")
    .eq("id", documentId)
    .single();

  if (fetchErr || !doc) return { error: "Document not found." };
  if (doc.user_id !== user.id) return { error: "Not authorized." };
  if (doc.status === "needs_ocr") {
    return {
      error: "Restructuring is unavailable for scanned PDFs until OCR ships.",
    };
  }

  // Re-extract — keeps this idempotent and avoids storing raw page text.
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(doc.storage_path);
  if (dlErr || !fileBlob) {
    return { error: dlErr?.message ?? "Could not re-read uploaded PDF." };
  }
  const buf = new Uint8Array(await fileBlob.arrayBuffer());
  const outcome = await extractPdfPages(buf);
  if (outcome.kind !== "ready") {
    return { error: outcome.error ?? "PDF is not eligible for restructuring." };
  }

  const heuristic = buildHeuristicSections(outcome.rawPages);

  // Replace document_pages — best-effort delete + insert.
  await supabase.from("document_pages").delete().eq("document_id", documentId);
  const rows = heuristic.sections.map(toInsertRow.bind(null, documentId));
  const { error: insertErr } = await supabase
    .from("document_pages")
    .insert(rows);
  if (insertErr) {
    return {
      error: `Restructuring produced ${rows.length} sections but couldn't save: ${insertErr.message}. Try re-uploading.`,
    };
  }

  await supabase
    .from("documents")
    .update({
      processing_mode: "structured",
      page_count: outcome.pageCount,
      error: null,
      status: "ready",
    })
    .eq("id", documentId);

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/dashboard");

  const firstPageDetection =
    outcome.rawPages.find((p) => p.page === 1)?.footnoteDetection ?? "none";
  return {
    ok: true,
    data: {
      status: "ready",
      mode: "structured",
      headingsDetected: heuristic.headingsDetected,
      firstPageDetection,
    },
  };
}

interface DocumentPageInsertRow {
  document_id: string;
  section_index: number;
  section_key: string;
  title: string;
  page_start: number;
  page_end: number | null;
  summary: string | null;
  body: StructuredSectionInput["body"];
  key_terms: StructuredSectionInput["key_terms"];
}

function toInsertRow(
  documentId: string,
  s: Omit<StructuredSectionInput, "page_end"> & { page_end?: number | null },
): DocumentPageInsertRow {
  return {
    document_id: documentId,
    section_index: s.section_index,
    section_key: s.section_key,
    title: s.title,
    page_start: s.page_start,
    page_end: s.page_end ?? null,
    summary: s.summary,
    body: s.body,
    key_terms: s.key_terms,
  };
}

/**
 * Same fail-safe pattern as restructureWithAI: peek quota first, only consume
 * after the AI call succeeds. Caller is expected to handle "skipped" by
 * falling back to heuristic structuring (no quota was burned).
 */
async function tryAiWithQuota(rawPages: RawPage[]) {
  const snapshot = await getUsageSnapshot();
  if (snapshot && snapshot.aiActions >= snapshot.limits.ai) {
    return {
      kind: "skipped" as const,
      reason: "quota_exceeded",
      detail: "AI quota exhausted; used heuristic structuring.",
    };
  }
  const result = await aiStructure(rawPages);
  if (result.kind !== "ok") return result;
  // Only consume quota now that we know AI succeeded.
  const consumed = await consumeQuota("ai_action");
  if ("error" in consumed) {
    // Race: someone else consumed the slot. Heuristic fallback.
    return {
      kind: "skipped" as const,
      reason: "quota_exceeded",
      detail: "AI quota was exhausted by a concurrent action; used heuristic structuring.",
    };
  }
  return result;
}

async function markFailed(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  documentId: string,
  jobId: string,
  message: string,
) {
  await supabase
    .from("processing_jobs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: message,
    })
    .eq("id", jobId);
  await supabase
    .from("documents")
    .update({ status: "failed", error: message })
    .eq("id", documentId);
}

export async function deleteDocument(documentId: string): Promise<Result<true>> {
  const { supabase, user } = await requireUser();

  const { data: doc, error: fetchErr } = await supabase
    .from("documents")
    .select("id, user_id, storage_path")
    .eq("id", documentId)
    .single();

  if (fetchErr || !doc) return { error: "Document not found." };
  if (doc.user_id !== user.id) return { error: "Not authorized." };

  if (doc.storage_path) {
    await supabase.storage.from(STORAGE_BUCKET).remove([doc.storage_path]);
  }

  const { error: delErr } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (delErr) return { error: delErr.message };

  revalidatePath("/dashboard");
  return { ok: true, data: true };
}
