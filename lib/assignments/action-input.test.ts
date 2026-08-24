import { describe, expect, it } from "vitest";
import { parseRequirementDecisionInput } from "./action-input";

function decision(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return parseRequirementDecisionInput(data);
}

const ids = { assignmentId: "assignment-1", requirementId: "requirement-1" };

describe("parseRequirementDecisionInput", () => {
  it("accepts confirm without edited text", () => {
    expect(decision({ ...ids, decision: "confirm" })).toEqual({
      ok: true,
      value: { ...ids, decision: "confirm" },
    });
  });

  it("requires nonblank text when confirming an edit", () => {
    expect(
      decision({ ...ids, decision: "edit_and_confirm", editedText: "  " }),
    ).toEqual({ ok: false, message: "Edited requirement text is required." });
  });

  it("accepts reject", () => {
    expect(decision({ ...ids, decision: "reject" })).toEqual({
      ok: true,
      value: { ...ids, decision: "reject" },
    });
  });

  it("rejects an unknown decision", () => {
    expect(decision({ ...ids, decision: "approve" })).toEqual({
      ok: false,
      message: "Choose a valid review action.",
    });
  });
});
