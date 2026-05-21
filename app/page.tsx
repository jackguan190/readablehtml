import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HomeClient } from "./HomeClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  let userEmail: string | null = null;
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  } catch {
    // Supabase env vars not set — render the marketing page in unauthenticated mode.
    userEmail = null;
  }
  return <HomeClient userEmail={userEmail} />;
}
