import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { CreateAssignmentInput } from "./input";
import { createAssignmentSetup } from "./store";

const existingCourseInput: CreateAssignmentInput = {
  courseMode: "existing",
  courseId: "course-1",
  assignmentTitle: "Essay One",
  briefText: "Analyze memory.",
  dueOn: null,
};

describe("createAssignmentSetup", () => {
  it("maps the setup RPC record into camel-case identifiers", async () => {
    let received: Record<string, unknown> | undefined;
    const supabase = {
      rpc: async (_name: string, args: Record<string, unknown>) => {
        received = args;
        return {
          data: [
            {
              assignment_id: "assignment-1",
              course_id: "course-1",
              brief_material_id: "brief-1",
            },
          ],
          error: null,
        };
      },
    } as unknown as SupabaseClient;

    await expect(
      createAssignmentSetup(supabase, "user-1", existingCourseInput),
    ).resolves.toEqual({
      ok: true,
      data: {
        assignmentId: "assignment-1",
        courseId: "course-1",
        briefMaterialId: "brief-1",
      },
    });
    expect(received).toEqual({
      p_course_id: "course-1",
      p_course_name: null,
      p_term: null,
      p_instructor_name: null,
      p_assignment_title: "Essay One",
      p_due_on: null,
      p_brief_text: "Analyze memory.",
    });
  });

  it("returns a safe not-found message instead of a database error", async () => {
    const supabase = {
      rpc: async () => ({
        data: null,
        error: { code: "P0002", message: "course not found" },
      }),
    } as unknown as SupabaseClient;

    await expect(
      createAssignmentSetup(supabase, "user-1", existingCourseInput),
    ).resolves.toEqual({
      ok: false,
      code: "not_found",
      message: "The selected course was not found.",
    });
  });
});
