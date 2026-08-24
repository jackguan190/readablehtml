import type { AssignmentRequirementV1 } from "../contracts/nebu/v1";

type ReasoningClass = AssignmentRequirementV1["reasoningClass"];

export interface RequirementsViewModel {
  trustedContext: AssignmentRequirementV1[];
  nebuProposals: AssignmentRequirementV1[];
  rejectedCount: number;
  contextNotice: string | null;
}

const REASONING_LABELS: Record<ReasoningClass, string> = {
  required: "Required",
  inference: "Inference",
};

export function getReasoningLabel(reasoningClass: ReasoningClass): string {
  return REASONING_LABELS[reasoningClass];
}

export function buildRequirementsViewModel(
  requirements: AssignmentRequirementV1[],
  rubricAvailable: boolean,
): RequirementsViewModel {
  const sorted = [...requirements].sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    trustedContext: sorted.filter((item) => item.reviewStatus === "confirmed"),
    nebuProposals: sorted.filter((item) => item.reviewStatus === "proposed"),
    rejectedCount: sorted.filter((item) => item.reviewStatus === "rejected")
      .length,
    contextNotice: rubricAvailable
      ? null
      : "No rubric added. Uploading it is highly recommended for more precise guidance.",
  };
}
