import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assignmentRequirementV1Schema,
  type AssignmentRequirementV1,
} from "../contracts/nebu/v1";
import type { NewRequirementDraft } from "./analyzer";
import type { RequirementDecisionInput } from "./action-input";
import type { CreateAssignmentInput } from "./input";

export type StoreResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: "not_found" | "not_authorized" | "conflict" | "database";
      message: string;
    };

export interface AssignmentSetupIds {
  assignmentId: string;
  courseId: string;
  briefMaterialId: string;
}

interface DatabaseErrorLike {
  code?: string;
}

type Row = Record<string, unknown>;

interface DatabaseFailureMessages {
  notFound: string;
  notAuthorized: string;
  conflict: string;
  database: string;
}

const SETUP_FAILURE_MESSAGES: DatabaseFailureMessages = {
  notFound: "The selected course was not found.",
  notAuthorized: "You are not authorized to create this assignment.",
  conflict: "This assignment setup conflicts with existing data.",
  database: "Could not save assignment setup. Please try again.",
};

const ANALYSIS_FAILURE_MESSAGES: DatabaseFailureMessages = {
  notFound: "Assignment analysis was not found.",
  notAuthorized: "You are not authorized to analyze this assignment.",
  conflict: "Assignment analysis is already running.",
  database: "Could not save assignment analysis. Please try again.",
};

const REQUIREMENT_FAILURE_MESSAGES: DatabaseFailureMessages = {
  notFound: "Assignment requirement was not found.",
  notAuthorized: "You are not authorized to review this requirement.",
  conflict: "This requirement review conflicts with existing data.",
  database: "Could not save requirement review. Please try again.",
};

function databaseFailure(
  error: DatabaseErrorLike | null,
  messages: DatabaseFailureMessages = SETUP_FAILURE_MESSAGES,
): StoreResult<never> {
  if (error?.code === "P0002") {
    return {
      ok: false,
      code: "not_found",
      message: messages.notFound,
    };
  }
  if (error?.code === "42501") {
    return {
      ok: false,
      code: "not_authorized",
      message: messages.notAuthorized,
    };
  }
  if (error?.code === "23505") {
    return {
      ok: false,
      code: "conflict",
      message: messages.conflict,
    };
  }
  return {
    ok: false,
    code: "database",
    message: messages.database,
  };
}

function setupIds(data: unknown): AssignmentSetupIds | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (
    typeof row !== "object" ||
    row === null ||
    Array.isArray(row) ||
    typeof row.assignment_id !== "string" ||
    typeof row.course_id !== "string" ||
    typeof row.brief_material_id !== "string"
  ) {
    return null;
  }

  return {
    assignmentId: row.assignment_id,
    courseId: row.course_id,
    briefMaterialId: row.brief_material_id,
  };
}

function jobId(data: unknown): { id: string } | null {
  if (typeof data === "string") return { id: data };
  const row = Array.isArray(data) ? data[0] : data;
  if (
    typeof row === "object" &&
    row !== null &&
    !Array.isArray(row) &&
    typeof (row as Row).id === "string"
  ) {
    return { id: (row as Row).id as string };
  }
  return null;
}

function mapRequirement(row: unknown): AssignmentRequirementV1 | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return null;
  }
  const value = row as Row;
  const hasSource = value.source_material_id !== null;
  const parsed = assignmentRequirementV1Schema.safeParse({
    schemaVersion: 1,
    id: value.id,
    assignmentId: value.assignment_id,
    kind: value.kind,
    text: value.text,
    reasoningClass: value.reasoning_class,
    reviewStatus: value.review_status,
    origin: value.origin,
    studentEdited: value.student_edited,
    support: hasSource
      ? {
          materialId: value.source_material_id,
          quote: value.source_quote,
          start: value.source_start,
          end: value.source_end,
        }
      : null,
    orderIndex: value.order_index,
  });
  return parsed.success ? parsed.data : null;
}

async function getBriefText(
  supabase: SupabaseClient,
  userId: string,
  assignmentId: string,
  briefId: string,
): Promise<StoreResult<string>> {
  const { data, error } = await supabase
    .from("materials")
    .select("id, raw_text")
    .eq("id", briefId)
    .eq("assignment_id", assignmentId)
    .eq("user_id", userId)
    .eq("kind", "assignment_brief")
    .maybeSingle();

  if (error) return databaseFailure(error);
  if (
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data) ||
    typeof (data as Row).raw_text !== "string"
  ) {
    return {
      ok: false,
      code: "not_found",
      message: "Assignment brief was not found.",
    };
  }

  return { ok: true, data: (data as Row).raw_text as string };
}

function serializeAnalysisItems(
  briefText: string,
  items: NewRequirementDraft[],
): StoreResult<
  Array<{
    kind: NewRequirementDraft["kind"];
    text: string;
    reasoningClass: NewRequirementDraft["reasoningClass"];
    sourceQuote: string | null;
    sourceStart: number | null;
    sourceEnd: number | null;
    orderIndex: number;
  }>
> {
  const serialized = [];

  for (const item of items) {
    if (
      item.support !== null &&
      briefText.slice(item.support.start, item.support.end) !==
        item.support.quote
    ) {
      return {
        ok: false,
        code: "database",
        message: "Analysis source support no longer matches the assignment brief.",
      };
    }

    if (item.reasoningClass === "required") {
      if (item.support === null) {
        return {
          ok: false,
          code: "database",
          message: "Required analysis items need source support.",
        };
      }
    }

    serialized.push({
      kind: item.kind,
      text: item.text,
      reasoningClass: item.reasoningClass,
      sourceQuote: item.support?.quote ?? null,
      sourceStart: item.support?.start ?? null,
      sourceEnd: item.support?.end ?? null,
      orderIndex: item.orderIndex,
    });
  }

  return { ok: true, data: serialized };
}

export async function createAssignmentSetup(
  supabase: SupabaseClient,
  userId: string,
  input: CreateAssignmentInput,
): Promise<StoreResult<AssignmentSetupIds>> {
  if (userId.trim() === "") {
    return {
      ok: false,
      code: "not_authorized",
      message: "You are not authorized to create this assignment.",
    };
  }

  const { data, error } = await supabase.rpc("create_assignment_setup", {
    p_course_id: input.courseMode === "existing" ? input.courseId : null,
    p_course_name: input.courseMode === "new" ? input.courseName : null,
    p_term: input.courseMode === "new" ? input.term : null,
    p_instructor_name: input.courseMode === "new" ? input.instructorName : null,
    p_assignment_title: input.assignmentTitle,
    p_due_on: input.dueOn,
    p_brief_text: input.briefText,
  });

  if (error) return databaseFailure(error);

  const ids = setupIds(data);
  if (!ids) return databaseFailure(null);

  return { ok: true, data: ids };
}

export async function startAssignmentAnalysis(
  supabase: SupabaseClient,
  userId: string,
  assignmentId: string,
): Promise<StoreResult<{ id: string }>> {
  if (userId.trim() === "") {
    return {
      ok: false,
      code: "not_authorized",
      message: "You are not authorized to analyze this assignment.",
    };
  }

  const { data, error } = await supabase.rpc("start_assignment_analysis", {
    p_assignment_id: assignmentId,
  });
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        code: "conflict",
        message: "Assignment analysis is already running.",
      };
    }
    return databaseFailure(error, ANALYSIS_FAILURE_MESSAGES);
  }

  const id = jobId(data);
  if (!id) return databaseFailure(null, ANALYSIS_FAILURE_MESSAGES);
  return { ok: true, data: id };
}

export async function completeAssignmentAnalysis(
  supabase: SupabaseClient,
  userId: string,
  assignmentId: string,
  jobIdValue: string,
  briefId: string,
  items: NewRequirementDraft[],
  provider: string,
  model: string,
): Promise<StoreResult<true>> {
  const brief = await getBriefText(supabase, userId, assignmentId, briefId);
  if (!brief.ok) return brief;

  const serialized = serializeAnalysisItems(brief.data, items);
  if (!serialized.ok) return serialized;

  const { error } = await supabase.rpc("complete_assignment_analysis", {
    p_assignment_id: assignmentId,
    p_job_id: jobIdValue,
    p_brief_material_id: briefId,
    p_items: serialized.data,
    p_provider: provider,
    p_model: model,
  });

  if (error) return databaseFailure(error, ANALYSIS_FAILURE_MESSAGES);
  return { ok: true, data: true };
}

export async function failAssignmentAnalysis(
  supabase: SupabaseClient,
  userId: string,
  assignmentId: string,
  jobIdValue: string,
  message: string,
): Promise<StoreResult<true>> {
  if (userId.trim() === "") {
    return {
      ok: false,
      code: "not_authorized",
      message: "You are not authorized to analyze this assignment.",
    };
  }

  const { error } = await supabase.rpc("fail_assignment_analysis", {
    p_assignment_id: assignmentId,
    p_job_id: jobIdValue,
    p_message: message,
  });

  if (error) return databaseFailure(error, ANALYSIS_FAILURE_MESSAGES);
  return { ok: true, data: true };
}

export async function reviewRequirement(
  supabase: SupabaseClient,
  userId: string,
  input: RequirementDecisionInput,
): Promise<StoreResult<AssignmentRequirementV1>> {
  const { data: current, error: currentError } = await supabase
    .from("assignment_requirements")
    .select("*")
    .eq("id", input.requirementId)
    .eq("assignment_id", input.assignmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (currentError) {
    return databaseFailure(currentError, REQUIREMENT_FAILURE_MESSAGES);
  }
  if (!current) {
    return {
      ok: false,
      code: "not_found",
      message: "Assignment requirement was not found.",
    };
  }

  const patch =
    input.decision === "confirm"
      ? { review_status: "confirmed", student_edited: false }
      : input.decision === "edit_and_confirm"
        ? {
            text: input.editedText,
            review_status: "confirmed",
            student_edited: true,
          }
        : { review_status: "rejected" };

  const { data, error } = await supabase
    .from("assignment_requirements")
    .update(patch)
    .eq("id", input.requirementId)
    .eq("assignment_id", input.assignmentId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) return databaseFailure(error, REQUIREMENT_FAILURE_MESSAGES);

  const requirement = mapRequirement(data);
  if (!requirement) {
    return databaseFailure(null, REQUIREMENT_FAILURE_MESSAGES);
  }
  return { ok: true, data: requirement };
}
