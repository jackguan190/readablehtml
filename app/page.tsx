import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAssignmentList } from "@/lib/assignments/queries";
import { postAuthenticationPath } from "@/lib/nebu/navigation";
import { redirect } from "next/navigation";
import { NebuLanding } from "@/components/nebu/NebuLanding";

export const dynamic = "force-dynamic";

export default async function Page() {
  let supabase: ReturnType<typeof createSupabaseServerClient>;
  let user: { id: string } | null;

  try {
    supabase = createSupabaseServerClient();
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    // Supabase env vars not set — render the public landing route.
    return <NebuLanding />;
  }

  if (!user) return <NebuLanding />;
  const assignments = await getAssignmentList(supabase, user.id);
  redirect(postAuthenticationPath(assignments.length));
}
