import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NebuHeader } from "@/components/nebu/NebuHeader";
import { getOwnedCourses } from "@/lib/assignments/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AssignmentCreateForm } from "./AssignmentCreateForm";

export const dynamic = "force-dynamic";

export default async function NewAssignmentPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/assignments/new");

  const courses = await getOwnedCourses(supabase, user.id);

  return (
    <div className="min-h-screen bg-paper-sunken text-ink">
      <NebuHeader userEmail={user.email ?? ""} />

      <main className="max-w-page mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <Link
          href="/assignments"
          className="inline-flex items-center gap-2 text-[13px] text-ink-muted hover:text-ink transition-colors no-tap-highlight"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to assignments
        </Link>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <div className="eyebrow text-accent">New assignment</div>
            <h1 className="mt-1.5 font-serif text-[30px] sm:text-[42px] tracking-tightish leading-tight">
              Give Nebu the assignment before the essay.
            </h1>
            <p className="mt-2 text-[14px] leading-6 text-ink-muted max-w-[62ch]">
              Paste the brief first. Nebu will extract what is required, what
              is inferred, and where each claim came from.
            </p>
          </div>

          <aside className="rounded-2xl border border-accent/20 bg-accent-soft/40 p-5">
            <div className="eyebrow text-accent-ink">
              Highly recommended context
            </div>
            <p className="mt-2 text-[13px] leading-6 text-accent-ink/90">
              After this first step, add rubric notes, lecture themes, and TA
              office-hour comments. Nebu should help your essay align with the
              course, not just summarize the prompt.
            </p>
          </aside>
        </section>

        <section className="mt-8 rounded-2xl border border-line bg-paper p-5 sm:p-7">
          <AssignmentCreateForm courses={courses} mode="library" />
        </section>
      </main>
    </div>
  );
}
