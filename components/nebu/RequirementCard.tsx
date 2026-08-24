"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssignmentRequirementV1 } from "@/lib/contracts/nebu/v1";
import { reviewRequirementAction } from "@/lib/assignments/actions";
import { getReasoningLabel } from "@/lib/assignments/view-model";

interface RequirementCardProps {
  requirement: AssignmentRequirementV1;
}

const KIND_LABELS: Record<AssignmentRequirementV1["kind"], string> = {
  central_question: "Central question",
  deliverable: "Deliverable",
  constraint: "Constraint",
  word_limit: "Word limit",
  due_date: "Due date",
  rubric_criterion: "Rubric criterion",
  expectation: "Expectation",
  ambiguity: "Ambiguity",
};

export function getRequirementKindLabel(
  kind: AssignmentRequirementV1["kind"],
): string {
  return KIND_LABELS[kind];
}

export function RequirementCard({ requirement }: RequirementCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState(requirement.text);
  const [error, setError] = useState<string | null>(null);

  function submitDecision(
    decision: "confirm" | "edit_and_confirm" | "reject",
  ) {
    setError(null);
    const data = new FormData();
    data.set("assignmentId", requirement.assignmentId);
    data.set("requirementId", requirement.id);
    data.set("decision", decision);
    if (decision === "edit_and_confirm") data.set("editedText", editedText);

    startTransition(async () => {
      const result = await reviewRequirementAction(data);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <article className="rounded-xl border border-line bg-paper-raised p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-paper-sunken px-2.5 py-1 text-[11px] font-medium text-ink-muted">
          {getRequirementKindLabel(requirement.kind)}
        </span>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent-ink">
          {getReasoningLabel(requirement.reasoningClass)}
        </span>
      </div>

      {editing ? (
        <textarea
          value={editedText}
          onChange={(event) => setEditedText(event.target.value)}
          rows={4}
          className="mt-3 w-full resize-y rounded-lg border border-line bg-paper px-3 py-2 text-[14px] leading-6 outline-none focus:border-accent"
        />
      ) : (
        <p className="mt-3 text-[14px] leading-6 text-ink">
          {requirement.text}
        </p>
      )}

      {requirement.support && (
        <blockquote className="mt-3 rounded-lg border-l-2 border-accent bg-paper px-3 py-2 text-[12.5px] leading-5 text-ink-muted">
          <div className="font-medium text-ink">Source quote</div>
          <p className="mt-1">&ldquo;{requirement.support.quote}&rdquo;</p>
          <div className="mt-1 text-[11px] text-ink-faint">
            Brief offsets {requirement.support.start}–
            {requirement.support.end}
          </div>
        </blockquote>
      )}

      {error && <p className="mt-3 text-[12px] text-red-700">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {editing ? (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => submitDecision("edit_and_confirm")}
              className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-paper disabled:opacity-60"
            >
              Save and confirm
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setEditedText(requirement.text);
                setEditing(false);
              }}
              className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink-muted disabled:opacity-60"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => submitDecision("confirm")}
              className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-paper disabled:opacity-60"
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setEditing(true)}
              className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-ink-muted disabled:opacity-60"
            >
              Edit and confirm
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => submitDecision("reject")}
              className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-red-700 disabled:opacity-60"
            >
              Reject
            </button>
          </>
        )}
      </div>
    </article>
  );
}
