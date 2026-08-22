import { describe, expect, it } from "vitest";
import {
  parseAssignmentUnderstandingV1,
  assignmentAnalysisProposalV1Schema,
} from "./index";
import { assignmentUnderstandingFixture } from "./fixtures";

describe("AssignmentUnderstandingV1", () => {
  it("accepts a source-backed required item and an explicit inference", () => {
    expect(parseAssignmentUnderstandingV1(structuredClone(assignmentUnderstandingFixture)).ok)
      .toBe(true);
  });

  it("rejects a Required item without source support", () => {
    const value = structuredClone(assignmentUnderstandingFixture) as any;
    value.items[0].support = null;
    expect(parseAssignmentUnderstandingV1(value).ok).toBe(false);
  });

  it("rejects source offsets that do not select the stored quote", () => {
    const value = structuredClone(assignmentUnderstandingFixture) as any;
    value.items[0].support.start = 0;
    expect(parseAssignmentUnderstandingV1(value).ok).toBe(false);
  });

  it("rejects a source material other than the owning brief", () => {
    const value = structuredClone(assignmentUnderstandingFixture) as any;
    value.items[0].support.materialId = "other-material";
    expect(parseAssignmentUnderstandingV1(value).ok).toBe(false);
  });

  it("rejects unknown model-output keys", () => {
    const result = assignmentAnalysisProposalV1Schema.safeParse({
      schemaVersion: 1,
      items: [],
      assumedRubric: ["argument quality"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an inferred rubric criterion even when it has source support", () => {
    const value = structuredClone(assignmentUnderstandingFixture) as any;
    value.items[0].kind = "rubric_criterion";
    value.items[0].reasoningClass = "inference";
    expect(parseAssignmentUnderstandingV1(value).ok).toBe(false);
  });

  it("accepts an explicit source-backed rubric criterion without a separate rubric", () => {
    const value = structuredClone(assignmentUnderstandingFixture) as any;
    value.items[0].kind = "rubric_criterion";
    expect(parseAssignmentUnderstandingV1(value).ok).toBe(true);
  });

  it("rejects an untrusted rubric criterion without a support quote", () => {
    const result = assignmentAnalysisProposalV1Schema.safeParse({
      schemaVersion: 1,
      items: [
        {
          kind: "rubric_criterion",
          text: "Make an argument.",
          reasoningClass: "required",
          supportQuote: null,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects support ending beyond the assignment brief before comparing the quote", () => {
    const value = structuredClone(assignmentUnderstandingFixture) as any;
    value.items[0].support.end = value.brief.text.length + 1;
    const result = parseAssignmentUnderstandingV1(value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("support end must be within the assignment brief");
    }
  });

  it("rejects a brief belonging to another assignment", () => {
    const value = structuredClone(assignmentUnderstandingFixture) as any;
    value.brief.assignmentId = "other-assignment";
    expect(parseAssignmentUnderstandingV1(value).ok).toBe(false);
  });
});
