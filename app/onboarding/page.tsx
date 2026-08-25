import { redirect } from "next/navigation";
import { getAssignmentList, getOwnedCourses } from "@/lib/assignments/queries";
import { postAuthenticationPath } from "@/lib/nebu/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OnboardingAssignmentForm } from "./OnboardingAssignmentForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  const [assignments, courses] = await Promise.all([
    getAssignmentList(supabase, user.id),
    getOwnedCourses(supabase, user.id),
  ]);
  if (postAuthenticationPath(assignments.length) === "/assignments") {
    redirect("/assignments");
  }

  return <OnboardingAssignmentForm courses={courses} />;
}
