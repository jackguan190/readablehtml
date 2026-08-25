export type RequirementDecisionInput = {
  assignmentId: string;
  requirementId: string;
  decision: "confirm" | "edit_and_confirm" | "reject";
  editedText?: string;
};

export type RequirementDecisionParseResult =
  | { ok: true; value: RequirementDecisionInput }
  | { ok: false; message: string };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function parseRequirementDecisionInput(
  formData: FormData,
): RequirementDecisionParseResult {
  const assignmentId = field(formData, "assignmentId").trim();
  const requirementId = field(formData, "requirementId").trim();
  const decision = field(formData, "decision").trim();
  const editedText = field(formData, "editedText").trim();

  if (assignmentId === "" || requirementId === "") {
    return {
      ok: false,
      message: "Assignment or requirement was not found.",
    };
  }

  if (decision === "confirm") {
    return { ok: true, value: { assignmentId, requirementId, decision } };
  }

  if (decision === "reject") {
    return { ok: true, value: { assignmentId, requirementId, decision } };
  }

  if (decision === "edit_and_confirm") {
    if (editedText === "") {
      return {
        ok: false,
        message: "Edited requirement text is required.",
      };
    }

    return {
      ok: true,
      value: { assignmentId, requirementId, decision, editedText },
    };
  }

  return { ok: false, message: "Choose a valid review action." };
}
