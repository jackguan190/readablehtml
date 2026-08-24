import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { NewRequirementDraft } from "./analyzer";
import type { CreateAssignmentInput } from "./input";
import {
  completeAssignmentAnalysis,
  createAssignmentSetup,
  reviewRequirement,
  startAssignmentAnalysis,
} from "./store";

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

describe("startAssignmentAnalysis", () => {
  it("maps an active analysis unique-index race to conflict", async () => {
    const supabase = {
      rpc: async () => ({
        data: null,
        error: { code: "23505", message: "duplicate key" },
      }),
    } as unknown as SupabaseClient;

    await expect(
      startAssignmentAnalysis(supabase, "user-1", "assignment-1"),
    ).resolves.toEqual({
      ok: false,
      code: "conflict",
      message: "Assignment analysis is already running.",
    });
  });
});

describe("completeAssignmentAnalysis", () => {
  function briefQuery(rawText: string) {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      maybeSingle: async () => ({
        data: { id: "brief-1", raw_text: rawText },
        error: null,
      }),
    };
    return { builder, filters };
  }

  it("rechecks source slices before completing the job", async () => {
    const brief = briefQuery("Write about memory.");
    let rpcCalled = false;
    const supabase = {
      from: () => brief.builder,
      rpc: async () => {
        rpcCalled = true;
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient;

    const items: NewRequirementDraft[] = [
      {
        kind: "central_question",
        text: "Write about memory.",
        reasoningClass: "required",
        support: { quote: "memory", start: 0, end: 6 },
        orderIndex: 0,
      },
    ];

    await expect(
      completeAssignmentAnalysis(
        supabase,
        "user-1",
        "assignment-1",
        "job-1",
        "brief-1",
        items,
        "openai",
        "gpt-test",
      ),
    ).resolves.toMatchObject({
      ok: false,
      message: "Analysis source support no longer matches the assignment brief.",
    });
    expect(rpcCalled).toBe(false);
  });

  it("serializes verified support into the atomic completion RPC", async () => {
    const brief = briefQuery("Write about memory.");
    let received: Record<string, unknown> | undefined;
    const supabase = {
      from: () => brief.builder,
      rpc: async (_name: string, args: Record<string, unknown>) => {
        received = args;
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient;

    const items: NewRequirementDraft[] = [
      {
        kind: "central_question",
        text: "Write about memory.",
        reasoningClass: "required",
        support: { quote: "memory", start: 12, end: 18 },
        orderIndex: 0,
      },
      {
        kind: "ambiguity",
        text: "Evidence type is unclear.",
        reasoningClass: "inference",
        support: null,
        orderIndex: 1,
      },
    ];

    await expect(
      completeAssignmentAnalysis(
        supabase,
        "user-1",
        "assignment-1",
        "job-1",
        "brief-1",
        items,
        "openai",
        "gpt-test",
      ),
    ).resolves.toEqual({ ok: true, data: true });
    expect(brief.filters).toEqual([
      ["id", "brief-1"],
      ["assignment_id", "assignment-1"],
      ["user_id", "user-1"],
      ["kind", "assignment_brief"],
    ]);
    expect(received).toEqual({
      p_assignment_id: "assignment-1",
      p_job_id: "job-1",
      p_brief_material_id: "brief-1",
      p_items: [
        {
          kind: "central_question",
          text: "Write about memory.",
          reasoningClass: "required",
          sourceQuote: "memory",
          sourceStart: 12,
          sourceEnd: 18,
          orderIndex: 0,
        },
        {
          kind: "ambiguity",
          text: "Evidence type is unclear.",
          reasoningClass: "inference",
          sourceQuote: null,
          sourceStart: null,
          sourceEnd: null,
          orderIndex: 1,
        },
      ],
      p_provider: "openai",
      p_model: "gpt-test",
    });
  });
});

describe("reviewRequirement", () => {
  it("updates review status without changing source support when editing text", async () => {
    const timestamp = "2026-08-24T00:00:00.000Z";
    const current = {
      id: "requirement-1",
      user_id: "user-1",
      assignment_id: "assignment-1",
      kind: "central_question",
      text: "Original text.",
      reasoning_class: "required",
      review_status: "proposed",
      origin: "ai",
      student_edited: false,
      source_material_id: "brief-1",
      source_quote: "Original",
      source_start: 0,
      source_end: 8,
      order_index: 0,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const updated = {
      ...current,
      text: "Clearer text.",
      review_status: "confirmed",
      student_edited: true,
    };
    const patches: unknown[] = [];
    let phase: "read" | "update" = "read";
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: current, error: null }),
      update: (patch: unknown) => {
        phase = "update";
        patches.push(patch);
        return builder;
      },
      single: async () => ({
        data: phase === "update" ? updated : current,
        error: null,
      }),
    };
    const supabase = {
      from: () => builder,
    } as unknown as SupabaseClient;

    await expect(
      reviewRequirement(supabase, "user-1", {
        assignmentId: "assignment-1",
        requirementId: "requirement-1",
        decision: "edit_and_confirm",
        editedText: "Clearer text.",
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        id: "requirement-1",
        text: "Clearer text.",
        reviewStatus: "confirmed",
        studentEdited: true,
        support: {
          materialId: "brief-1",
          quote: "Original",
          start: 0,
          end: 8,
        },
      },
    });
    expect(patches).toEqual([
      {
        text: "Clearer text.",
        review_status: "confirmed",
        student_edited: true,
      },
    ]);
  });
});
