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
});
