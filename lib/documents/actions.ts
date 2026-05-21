"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildSyntheticPages } from "./synthetic";
import { extractPdfPages } from "./extraction";
import { consumeQuota, quotaExceededMessage } from "@/lib/usage/quota";

const STORAGE_BUCKET = "documents";

type Result<T> = { error: string } | { ok: true; data: T };

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

  // Atomic quota check + consume. Runs BEFORE the row insert so we don't
  // create orphan documents for users who are over their monthly cap.
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
 * 1. Download the PDF from Storage.
 * 2. Extract text per page with unpdf.
 * 3. If extraction yields real text → seed document_pages from it, status=ready.
 * 4. If the PDF looks scanned → seed the synthetic mock content as a fallback,
 *    status=needs_ocr (UI shows a warning banner).
 * 5. On hard failure → status=failed with the error string.
 *
 * Real OCR is intentionally out of scope.
 */
export async function runBasicPdfProcessing(
  documentId: string,
): Promise<Result<{ status: ProcessingOutcome }>> {
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

  // 3. branch
  if (outcome.kind === "failed") {
    const msg = outcome.error ?? "PDF parsing failed.";
    await markFailed(supabase, documentId, job.id, msg);
    return { error: msg };
  }

  const pagesToInsert =
    outcome.kind === "ready"
      ? outcome.sections.map((s) => ({
          document_id: documentId,
          section_index: s.section_index,
          section_key: s.section_key,
          title: s.title,
          page_start: s.page_start,
          summary: s.summary,
          body: s.body,
          key_terms: s.key_terms,
        }))
      : buildSyntheticPages(documentId);

  const { error: pagesErr } = await supabase
    .from("document_pages")
    .insert(pagesToInsert);

  if (pagesErr) {
    await markFailed(supabase, documentId, job.id, pagesErr.message);
    return { error: pagesErr.message };
  }

  const nextStatus = outcome.kind === "ready" ? "ready" : "needs_ocr";
  await supabase
    .from("documents")
    .update({
      status: nextStatus,
      page_count: outcome.pageCount || pagesToInsert.length,
      error: outcome.kind === "needs_ocr" ? (outcome.warning ?? null) : null,
    })
    .eq("id", documentId);

  await supabase
    .from("processing_jobs")
    .update({
      status: "succeeded",
      finished_at: new Date().toISOString(),
      error: outcome.kind === "needs_ocr" ? (outcome.warning ?? null) : null,
    })
    .eq("id", job.id);

  revalidatePath("/dashboard");
  revalidatePath(`/documents/${documentId}`);
  return { ok: true, data: { status: nextStatus } };
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
