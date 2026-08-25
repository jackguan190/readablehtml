import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getAssignmentWorkspace } from "./queries";

const timestamp = "2026-08-24T00:00:00.000Z";

function queryResult(data: unknown) {
  const filters: Array<[string, unknown]> = [];
  const result = { data, error: null };
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => result,
    then: <T>(resolve: (value: typeof result) => T) => Promise.resolve(result).then(resolve),
  };
  return { builder, filters };
}

describe("getAssignmentWorkspace", () => {
  it("returns only a complete workspace scoped to the supplied user", async () => {
    const assignment = queryResult({
      id: "assignment-1",
      user_id: "user-1",
      course_id: "course-1",
      title: "Essay One",
      due_on: null,
      stage: "setup",
      understanding_status: "not_started",
      understanding_error: null,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const course = queryResult({
      id: "course-1",
      user_id: "user-1",
      name: "History",
      term: null,
      instructor_name: null,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const brief = queryResult({
      id: "brief-1",
      user_id: "user-1",
      course_id: "course-1",
      assignment_id: "assignment-1",
      kind: "assignment_brief",
      format: "text",
      raw_text: "Analyze memory.",
      created_at: timestamp,
    });
    const requirements = queryResult([]);
    const job = queryResult(null);
    const calls = [assignment, course, brief, requirements, job];
    const supabase = {
      from: () => calls.shift()!.builder,
    } as unknown as SupabaseClient;

    await expect(
      getAssignmentWorkspace(supabase, "user-1", "assignment-1"),
    ).resolves.toMatchObject({
      course: { id: "course-1", userId: "user-1" },
      assignment: { id: "assignment-1", courseId: "course-1" },
      brief: { id: "brief-1", assignmentId: "assignment-1" },
      requirements: [],
      latestAnalysisJob: null,
    });

    for (const query of [assignment, course, brief, requirements, job]) {
      expect(query.filters).toContainEqual(["user_id", "user-1"]);
    }
  });

  it("returns null when the assignment is missing or inaccessible", async () => {
    const assignment = queryResult(null);
    const supabase = {
      from: () => assignment.builder,
    } as unknown as SupabaseClient;

    await expect(
      getAssignmentWorkspace(supabase, "user-1", "assignment-1"),
    ).resolves.toBeNull();
  });
});
