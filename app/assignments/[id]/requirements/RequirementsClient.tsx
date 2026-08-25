"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { NebuHeader } from "@/components/nebu/NebuHeader";
import { RequirementsWorkspace } from "@/components/nebu/RequirementsWorkspace";
import { analyzeAssignmentAction } from "@/lib/assignments/actions";
import { formatAssignmentDueDate } from "@/lib/assignments/list-view-model";
import type {
  AssignmentRequirementV1,
  AssignmentV1,
} from "@/lib/contracts/nebu/v1";
import type { AssignmentAnalysisJob } from "@/lib/assignments/queries";

interface RequirementsClientProps {
  userEmail: string;
  workspace: {
    courseName: string;
    courseTerm: string | null;
    assignmentId: string;
    assignmentTitle: string;
    dueOn: string | null;
    understandingStatus: AssignmentV1["understandingStatus"];
    understandingError: string | null;
    briefText: string;
    latestAnalysisJob: AssignmentAnalysisJob | null;
    requirements: AssignmentRequirementV1[];
    rubricAvailable: boolean;
  };
}

function isJobTakingTooLong(job: AssignmentAnalysisJob | null): boolean {
  if (!job?.startedAt) return false;
  return Date.now() - new Date(job.startedAt).getTime() > 5 * 60 * 1000;
}

export function RequirementsClient({
  userEmail,
  workspace,
}: RequirementsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const takingTooLong = isJobTakingTooLong(workspace.latestAnalysisJob);
  const isProcessing =
    workspace.understandingStatus === "processing" && !takingTooLong;

  useEffect(() => {
    if (!isProcessing) return;
    const timer = window.setInterval(() => router.refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [isProcessing, router]);

  const courseLabel = useMemo(
    () =>
      workspace.courseTerm
        ? `${workspace.courseName} · ${workspace.courseTerm}`
        : workspace.courseName,
    [workspace.courseName, workspace.courseTerm],
  );

  function runAnalysis() {
    setActionError(null);
    startTransition(async () => {
      const result = await analyzeAssignmentAction(workspace.assignmentId);
      if ("error" in result) {
        setActionError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const statusPanel = (
    <div className="rounded-xl border border-line bg-paper-raised p-3">
      <div className="font-medium text-ink">Analysis status</div>
      {workspace.understandingStatus === "not_started" && (
        <p className="mt-1">Nebu has not analyzed this assignment yet.</p>
      )}
      {isProcessing && (
        <p className="mt-1 inline-flex items-center gap-2 text-accent">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Nebu is analyzing your assignment brief…
        </p>
      )}
      {takingTooLong && (
        <p className="mt-1 text-amber-700">
          Analysis is taking longer than expected
        </p>
      )}
      {workspace.understandingStatus === "ready" && (
        <p className="mt-1 text-emerald-700">
          Requirements are ready for your review.
        </p>
      )}
      {workspace.understandingStatus === "failed" && (
        <p className="mt-1 text-red-700">
          {workspace.understandingError ?? "Analysis failed."}
        </p>
      )}
      {(workspace.understandingStatus === "not_started" ||
        workspace.understandingStatus === "failed" ||
        takingTooLong) && (
        <button
          type="button"
          disabled={isPending || isProcessing}
          onClick={runAnalysis}
          className="mt-3 rounded-md bg-ink px-3 py-1.5 text-[12px] font-semibold text-paper disabled:opacity-60"
        >
          {workspace.understandingStatus === "not_started"
            ? "Analyze assignment"
            : "Try again"}
        </button>
      )}
      {actionError && <p className="mt-2 text-[12px] text-red-700">{actionError}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-paper-sunken text-ink">
      <NebuHeader userEmail={userEmail} />
      <main className="max-w-page mx-auto px-4 sm:px-8 py-6 sm:py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/assignments"
            className="inline-flex items-center gap-2 text-[13px] text-ink-muted hover:text-ink transition-colors no-tap-highlight"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to assignments
          </Link>
          <div className="rounded-full bg-paper px-3 py-1 text-[12px] text-ink-muted">
            Due: {formatAssignmentDueDate(workspace.dueOn)}
          </div>
        </div>

        <RequirementsWorkspace
          assignmentTitle={workspace.assignmentTitle}
          courseLabel={courseLabel}
          briefText={workspace.briefText}
          requirements={workspace.requirements}
          rubricAvailable={workspace.rubricAvailable}
          statusPanel={statusPanel}
        />
      </main>
    </div>
  );
}
