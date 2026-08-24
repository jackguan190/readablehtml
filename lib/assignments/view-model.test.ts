import { describe, expect, it } from "vitest";
import type { AssignmentRequirementV1 } from "../contracts/nebu/v1";
import { buildRequirementsViewModel, getReasoningLabel } from "./view-model";

function requirement(
  id: string,
  reviewStatus: AssignmentRequirementV1["reviewStatus"],
  reasoningClass: AssignmentRequirementV1["reasoningClass"] = "required",
): AssignmentRequirementV1 {
  return {
    schemaVersion: 1,
    id,
    assignmentId: "assignment-1",
    kind: "constraint",
    text: `Requirement ${id}`,
    reasoningClass,
    reviewStatus,
    origin: "ai",
    studentEdited: false,
    support:
      reasoningClass === "required"
        ? { materialId: "brief-1", quote: "Use evidence", start: 0, end: 12 }
        : null,
    orderIndex: Number(id.slice(-1)),
  };
}

describe("buildRequirementsViewModel", () => {
  const requirements = [
    requirement("item-1", "confirmed"),
    requirement("item-2", "proposed", "inference"),
    requirement("item-3", "rejected"),
  ];

  it("places only confirmed items in trusted context", () => {
    expect(
      buildRequirementsViewModel(
        requirements,
        false,
      ).trustedContext.map((item) => item.id),
    ).toEqual(["item-1"]);
  });

  it("keeps proposed items in Nebu proposals", () => {
    expect(
      buildRequirementsViewModel(
        requirements,
        false,
      ).nebuProposals.map((item) => item.id),
    ).toEqual(["item-2"]);
  });

  it("keeps rejected items out of active groups", () => {
    const view = buildRequirementsViewModel(requirements, false);
    expect([...view.trustedContext, ...view.nebuProposals].map((item) => item.id))
      .not.toContain("item-3");
    expect(view.rejectedCount).toBe(1);
  });

  it("uses transparent reasoning labels", () => {
    expect(getReasoningLabel("required")).toBe("Required");
    expect(getReasoningLabel("inference")).toBe("Inference");
  });

  it("strongly recommends a missing rubric without blocking progress", () => {
    expect(buildRequirementsViewModel(requirements, false).contextNotice).toBe(
      "No rubric added. Uploading it is highly recommended for more precise guidance.",
    );
    expect(buildRequirementsViewModel(requirements, true).contextNotice).toBeNull();
  });
});
