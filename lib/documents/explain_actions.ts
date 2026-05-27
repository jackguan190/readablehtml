"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildProvider, toClientLlmError } from "@/lib/llm/provider";
import type {
  LlmErrorCode,
  LlmProviderConfig,
  LlmProviderKind,
} from "@/lib/llm/types";
import {
  consumeQuota,
  getUsageSnapshot,
  quotaExceededMessage,
} from "@/lib/usage/quota";

export interface ExplainParagraphInput {
  documentId: string;
  paragraph: string;
  context?: string;
  providerConfig?: LlmProviderConfig;
}

export type ExplainParagraphResult =
  | {
      ok: true;
      data: {
        explanation: string;
        providerUsed: LlmProviderKind;
        modelUsed: string;
      };
    }
  | { error: string; code?: LlmErrorCode; quotaExceeded?: boolean };

/**
 * Explain a single paragraph using the configured LLM provider.
 *
 * Flow (mirrors restructureWithAI's peek-then-consume pattern):
 *   1. Auth + ownership check on the parent document.
 *   2. If platform (not BYOK): peek user_usage.ai_actions; fail fast if at cap.
 *   3. Call provider.explainParagraph().
 *   4. If platform: consume one ai_action slot.
 *
 * BYOK calls never touch user_usage — neither peek nor consume.
 *
 * Read-only on the database — no document_pages mutation, no revalidatePath.
 *
 * Security:
 *   - Caller's apiKey lives inside providerConfig only for the duration of this
 *     call (server-action invocation scope). Never logged, never persisted.
 *   - LlmProviderError.cause is stripped via toClientLlmError before return.
 */
export async function explainParagraphAction(
  input: ExplainParagraphInput,
): Promise<ExplainParagraphResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, user_id")
    .eq("id", input.documentId)
    .single();
  if (docErr || !doc) return { error: "Document not found." };
  if (doc.user_id !== user.id) return { error: "Not authorized." };

  const config: LlmProviderConfig =
    input.providerConfig ?? { source: "platform" };
  const isByok = config.source === "byok";

  if (!isByok) {
    const snapshot = await getUsageSnapshot();
    if (snapshot && snapshot.aiActions >= snapshot.limits.ai) {
      return {
        error: quotaExceededMessage("ai_action"),
        quotaExceeded: true,
      };
    }
  }

  try {
    const provider = buildProvider(config);
    const result = await provider.explainParagraph({
      paragraph: input.paragraph,
      context: input.context,
    });

    if (!isByok) {
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
    }

    return {
      ok: true,
      data: {
        explanation: result.explanation,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
      },
    };
  } catch (err) {
    const { code, message } = toClientLlmError(err);
    return { error: message, code };
  }
}
