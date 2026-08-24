import { notFound, redirect } from "next/navigation";
import { getAssignmentWorkspace } from "@/lib/assignments/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RequirementsClient } from "./RequirementsClient";

export const dynamic = "force-dynamic";

interface RequirementsPageProps {
  params: { id: string };
}

export default async function RequirementsPage({
  params,
}: RequirementsPageProps) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/assignments/${params.id}/requirements`);

  const workspace = await getAssignmentWorkspace(supabase, user.id, params.id);
  if (!workspace) notFound();

  const { data: rubricRow } = await supabase
    .from("materials")
    .select("id")
    .eq("assignment_id", workspace.assignment.id)
    .eq("user_id", user.id)
    .eq("kind", "rubric")
    .limit(1)
    .maybeSingle();

  return (
    <RequirementsClient
      userEmail={user.email ?? ""}
      workspace={{
        courseName: workspace.course.name,
        courseTerm: workspace.course.term,
        assignmentId: workspace.assignment.id,
        assignmentTitle: workspace.assignment.title,
        dueOn: workspace.assignment.dueOn,
        understandingStatus: workspace.assignment.understandingStatus,
        understandingError: workspace.assignment.understandingError,
        briefText: workspace.brief.text,
        latestAnalysisJob: workspace.latestAnalysisJob,
        requirements: workspace.requirements,
        rubricAvailable: rubricRow !== null,
      }}
    />
  );
}
