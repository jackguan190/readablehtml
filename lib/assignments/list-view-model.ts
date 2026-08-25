import type { AssignmentV1 } from "../contracts/nebu/v1";

type AssignmentStage = AssignmentV1["stage"];
type UnderstandingStatus = AssignmentV1["understandingStatus"];

const STAGE_LABELS: Record<AssignmentStage, string> = {
  setup: "Set up",
  research: "Research",
  planning: "Planning",
  writing: "Writing",
  complete: "Complete",
};

const UNDERSTANDING_STATUS_LABELS: Record<UnderstandingStatus, string> = {
  not_started: "Not analyzed",
  processing: "Analyzing",
  ready: "Ready",
  failed: "Needs retry",
};

export function getAssignmentStageLabel(stage: AssignmentStage): string {
  return STAGE_LABELS[stage];
}

export function getUnderstandingStatusLabel(
  status: UnderstandingStatus,
): string {
  return UNDERSTANDING_STATUS_LABELS[status];
}

export function formatAssignmentDueDate(dueOn: string | null): string {
  if (dueOn === null) return "No due date added";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dueOn}T00:00:00Z`));
}
