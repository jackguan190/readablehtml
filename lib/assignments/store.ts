import type { SupabaseClient } from "@supabase/supabase-js";
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

function databaseFailure(error: DatabaseErrorLike | null): StoreResult<never> {
  if (error?.code === "P0002") {
    return {
      ok: false,
      code: "not_found",
      message: "The selected course was not found.",
    };
  }
  if (error?.code === "42501") {
    return {
      ok: false,
      code: "not_authorized",
      message: "You are not authorized to create this assignment.",
    };
  }
  if (error?.code === "23505") {
    return {
      ok: false,
      code: "conflict",
      message: "This assignment setup conflicts with existing data.",
    };
  }
  return {
    ok: false,
    code: "database",
    message: "Could not save assignment setup. Please try again.",
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
