import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Alpha plan limits. Must match the values in
 * supabase/migrations/0005_user_usage.sql (consume_quota()).
 * The SQL function is authoritative for enforcement; these mirrors exist
 * so the UI can display "X / 10 PDFs used this month."
 */
export const ALPHA_LIMITS = {
  pdfs: 10,
  ai: 20,
  /** Monthly OCR-job allowance. 0 until Chandra (or equivalent) ships. */
  ocrJobs: 0,
  /** Per-document page cap for OCR. Enforced in the action layer. */
  ocrPagesPerDoc: 50,
} as const;

export type QuotaKind = "pdf_upload" | "ai_action" | "ocr_job";

export interface UsageSnapshot {
  periodStart: string; // YYYY-MM-01
  pdfsUploaded: number;
  aiActions: number;
  limits: { pdfs: number; ai: number };
}

export type ConsumeResult =
  | { ok: true; count: number }
  | { error: "quota_exceeded"; limit: number }
  | { error: "not_authenticated" }
  | { error: string };

function currentPeriodStart(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export async function getUsageSnapshot(): Promise<UsageSnapshot | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const period = currentPeriodStart();
  const { data } = await supabase
    .from("user_usage")
    .select("pdfs_uploaded, ai_actions")
    .eq("user_id", user.id)
    .eq("period_start", period)
    .maybeSingle();

  return {
    periodStart: period,
    pdfsUploaded: data?.pdfs_uploaded ?? 0,
    aiActions: data?.ai_actions ?? 0,
    limits: { pdfs: ALPHA_LIMITS.pdfs, ai: ALPHA_LIMITS.ai },
  };
}

/**
 * Atomically check and consume one quota slot for the given kind.
 * Backed by the consume_quota() Postgres function — it's the enforcement seam,
 * not this TS wrapper.
 */
export async function consumeQuota(kind: QuotaKind): Promise<ConsumeResult> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("consume_quota", {
    p_kind: kind,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("quota_exceeded")) {
      const limit =
        kind === "pdf_upload"
          ? ALPHA_LIMITS.pdfs
          : kind === "ai_action"
            ? ALPHA_LIMITS.ai
            : ALPHA_LIMITS.ocrJobs;
      return { error: "quota_exceeded", limit };
    }
    if (msg.includes("not_authenticated")) {
      return { error: "not_authenticated" };
    }
    return { error: msg || "Could not check quota." };
  }

  return { ok: true, count: data as number };
}

export function quotaExceededMessage(kind: QuotaKind): string {
  if (kind === "pdf_upload") {
    return `Monthly upload limit reached (${ALPHA_LIMITS.pdfs} PDFs/month on the alpha). Paid plans are coming soon — for now, delete an existing document or wait for next month.`;
  }
  if (kind === "ai_action") {
    return `Monthly AI limit reached (${ALPHA_LIMITS.ai} AI actions/month on the alpha). Try again next month or wait for paid plans.`;
  }
  // ocr_job
  return ALPHA_LIMITS.ocrJobs === 0
    ? "OCR is not yet available on the alpha. OCR integration is coming soon."
    : `Monthly OCR limit reached (${ALPHA_LIMITS.ocrJobs} OCR jobs/month on the alpha).`;
}
