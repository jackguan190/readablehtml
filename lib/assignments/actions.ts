"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { analyzeAssignmentBrief } from "@/lib/assignments/analyzer";
import { parseRequirementDecisionInput } from "@/lib/assignments/action-input";
import { parseCreateAssignmentInput } from "@/lib/assignments/input";
import { getAssignmentWorkspace } from "@/lib/assignments/queries";
import {
  completeAssignmentAnalysis,
  createAssignmentSetup,
  failAssignmentAnalysis,
  reviewRequirement,
  startAssignmentAnalysis,
} from "@/lib/assignments/store";
import { buildProvider, toClientLlmError } from "@/lib/llm/provider";
import type { LlmProviderConfig, LlmProviderKind } from "@/lib/llm/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  consumeQuota,
  getUsageSnapshot,
  quotaExceededMessage,
} from "@/lib/usage/quota";

export interface CreateAssignmentFormState {
  formError: string | null;
  fieldErrors: Record<string, string>;
}

export type AssignmentActionResult<T> =
  | { ok: true; data: T }
  | { error: string; quotaExceeded?: boolean };

async function requireActionUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function requirementsPath(assignmentId: string): string {
  return `/assignments/${assignmentId}/requirements`;
}

export async function createAssignmentAction(
  _previousState: CreateAssignmentFormState,
  formData: FormData,
): Promise<CreateAssignmentFormState> {
  const { supabase, user } = await requireActionUser();
  if (!user) redirect("/login");

  const parsed = parseCreateAssignmentInput(formData);
  if (!parsed.ok) {
    return { formError: null, fieldErrors: parsed.fieldErrors };
  }

  const saved = await createAssignmentSetup(supabase, user.id, parsed.value);
  if (!saved.ok) {
    return { formError: saved.message, fieldErrors: {} };
  }

  revalidatePath("/assignments");
  redirect(requirementsPath(saved.data.assignmentId));
}

export async function analyzeAssignmentAction(
  assignmentId: string,
  providerConfig?: LlmProviderConfig,
): Promise<
  AssignmentActionResult<{
    providerUsed: LlmProviderKind;
    modelUsed: string;
    itemsCreated: number;
  }>
> {
  const normalizedAssignmentId = assignmentId.trim();
  if (normalizedAssignmentId === "") {
    return { error: "Assignment was not found." };
  }

  const { supabase, user } = await requireActionUser();
  if (!user) return { error: "Not authenticated." };

  const workspace = await getAssignmentWorkspace(
    supabase,
    user.id,
    normalizedAssignmentId,
  );
  if (!workspace) return { error: "Assignment was not found." };

  const config: LlmProviderConfig = providerConfig ?? { source: "platform" };
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

  const started = await startAssignmentAnalysis(
    supabase,
    user.id,
    workspace.assignment.id,
  );
  if (!started.ok) return { error: started.message };

  const jobId = started.data.id;
  const userId = user.id;
  const assignmentIdForJob = workspace.assignment.id;
  const briefId = workspace.brief.id;
  const briefText = workspace.brief.text;

  async function markFailed(message: string): Promise<void> {
    await failAssignmentAnalysis(
      supabase,
      userId,
      assignmentIdForJob,
      jobId,
      message,
    );
  }

  try {
    const provider = buildProvider(config);
    const analysis = await analyzeAssignmentBrief({
      briefText,
      provider,
    });

    if (!analysis.ok) {
      await markFailed(analysis.message);
      return {
        error:
          "Assignment analysis could not be completed. Please try again.",
      };
    }

    if (!isByok) {
      const consumed = await consumeQuota("ai_action");
      if ("error" in consumed) {
        const message =
          consumed.error === "quota_exceeded"
            ? quotaExceededMessage("ai_action")
            : consumed.error;
        await markFailed(message);
        return {
          error: message,
          quotaExceeded: consumed.error === "quota_exceeded",
        };
      }
    }

    const completed = await completeAssignmentAnalysis(
      supabase,
      userId,
      assignmentIdForJob,
      jobId,
      briefId,
      analysis.items,
      analysis.providerUsed,
      analysis.modelUsed,
    );
    if (!completed.ok) {
      await markFailed(completed.message);
      return {
        error:
          "Assignment analysis could not be saved. Please try again.",
      };
    }

    revalidatePath(requirementsPath(assignmentIdForJob));
    return {
      ok: true,
      data: {
        providerUsed: analysis.providerUsed as LlmProviderKind,
        modelUsed: analysis.modelUsed,
        itemsCreated: analysis.items.length,
      },
    };
  } catch (error) {
    const { message } = toClientLlmError(error);
    await markFailed(message);
    return {
      error: "Assignment analysis could not be completed. Please try again.",
    };
  }
}

export async function reviewRequirementAction(
  formData: FormData,
): Promise<AssignmentActionResult<{ requirementId: string }>> {
  const parsed = parseRequirementDecisionInput(formData);
  if (!parsed.ok) return { error: parsed.message };

  const { supabase, user } = await requireActionUser();
  if (!user) return { error: "Not authenticated." };

  const result = await reviewRequirement(supabase, user.id, parsed.value);
  if (!result.ok) return { error: result.message };

  revalidatePath(requirementsPath(parsed.value.assignmentId));
  return { ok: true, data: { requirementId: result.data.id } };
}
