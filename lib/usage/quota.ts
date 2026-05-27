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
  /** Legacy monthly OCR-job allowance from the 2026-05-23 stub. Keep at 0. */
  ocrJobs: 0,
  /** Per-document page cap for the legacy OCR stub. */
  ocrPagesPerDoc: 50,
  /** Monthly Chandra-job allowance — testing budget. */
  chandraJobs: 5,
  /** Per-document page cap for Chandra. Enforced in the action layer. */
  chandraPagesPerDoc: 50,
} as const;

export type QuotaKind = "pdf_upload" | "ai_action" | "ocr_job" | "chandra_job";

export interface UsageSnapshot {
  periodStart: string; // YYYY-MM-01
  pdfsUploaded: number;
  aiActions: number;
  chandraJobs: number;
  limits: { pdfs: number; ai: number; chandraJobs: number };
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
  // Try the broad SELECT first; if chandra_jobs column doesn't exist yet
  // (pre-migration-0008 deployment), fall back without it.
  let pdfsUploaded = 0;
  let aiActions = 0;
  let chandraJobs = 0;
  const broad = await supabase
    .from("user_usage")
    .select("pdfs_uploaded, ai_actions, chandra_jobs")
    .eq("user_id", user.id)
    .eq("period_start", period)
    .maybeSingle();
  if (broad.data) {
    pdfsUploaded = broad.data.pdfs_uploaded ?? 0;
    aiActions = broad.data.ai_actions ?? 0;
    chandraJobs = (broad.data as { chandra_jobs?: number }).chandra_jobs ?? 0;
  } else if (broad.error) {
    const basic = await supabase
      .from("user_usage")
      .select("pdfs_uploaded, ai_actions")
      .eq("user_id", user.id)
      .eq("period_start", period)
      .maybeSingle();
    if (basic.data) {
      pdfsUploaded = basic.data.pdfs_uploaded ?? 0;
      aiActions = basic.data.ai_actions ?? 0;
    }
  }

  return {
    periodStart: period,
    pdfsUploaded,
    aiActions,
    chandraJobs,
    limits: {
      pdfs: ALPHA_LIMITS.pdfs,
      ai: ALPHA_LIMITS.ai,
      chandraJobs: ALPHA_LIMITS.chandraJobs,
    },
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
            : kind === "chandra_job"
              ? ALPHA_LIMITS.chandraJobs
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
  if (kind === "chandra_job") {
    const limit: number = ALPHA_LIMITS.chandraJobs;
    return limit === 0
      ? "Chandra is not yet available on the alpha. Layout-aware extraction is coming soon."
      : `Monthly Chandra limit reached (${limit} Chandra jobs/month on the alpha). Try again next month.`;
  }
  // ocr_job (legacy)
  const ocrLimit: number = ALPHA_LIMITS.ocrJobs;
  return ocrLimit === 0
    ? "OCR is not yet available on the alpha. OCR integration is coming soon."
    : `Monthly OCR limit reached (${ocrLimit} OCR jobs/month on the alpha).`;
}
