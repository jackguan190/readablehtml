import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { NebuHeader } from "@/components/nebu/NebuHeader";
import {
  formatAssignmentDueDate,
  getAssignmentStageLabel,
  getUnderstandingStatusLabel,
} from "@/lib/assignments/list-view-model";
import { getAssignmentList, getOwnedCourses } from "@/lib/assignments/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AssignmentsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/assignments");

  const [assignments, courses] = await Promise.all([
    getAssignmentList(supabase, user.id),
    getOwnedCourses(supabase, user.id),
  ]);
  const coursesById = new Map(courses.map((course) => [course.id, course]));

  return (
    <div className="min-h-screen bg-paper-sunken text-ink">
      <NebuHeader userEmail={user.email ?? ""} />

      <main className="max-w-page mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="eyebrow text-accent">Essay workspace</div>
            <h1 className="mt-1.5 font-serif text-[30px] sm:text-[42px] tracking-tightish leading-tight">
              Course-aware assignment notes.
            </h1>
            <p className="mt-2 text-[14px] text-ink-muted max-w-[64ch]">
              Turn a pasted assignment brief into source-backed requirements
              you can confirm, edit, and use while planning an essay.
            </p>
          </div>
          <Link
            href="/assignments/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink text-paper px-4 py-2.5 text-[13px] font-semibold shadow-sm hover:opacity-90 transition-opacity no-tap-highlight"
          >
            <Plus className="h-4 w-4" />
            New Assignment
          </Link>
        </section>

        {assignments.length === 0 ? (
          <section className="rounded-2xl border border-line bg-paper p-8 sm:p-10">
            <div className="max-w-[58ch]">
              <h2 className="font-serif text-[24px] tracking-tightish">
                Start with one essay brief.
              </h2>
              <p className="mt-2 text-[14px] leading-6 text-ink-muted">
                Nebu works best when the assignment is the center: course,
                professor instructions, rubric language, and office-hour notes
                can later sit around it.
              </p>
              <Link
                href="/assignments/new"
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent text-paper px-4 py-2.5 text-[13px] font-semibold hover:opacity-90 transition-opacity no-tap-highlight"
              >
                Create your first assignment
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {assignments.map((assignment) => {
              const course = coursesById.get(assignment.courseId);
              return (
                <li key={assignment.id}>
                  <Link
                    href={`/assignments/${assignment.id}/requirements`}
                    className="group block rounded-2xl border border-line bg-paper p-5 hover:border-line-strong hover:shadow-sm transition-all no-tap-highlight"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="eyebrow text-ink-faint">
                          {course?.name ?? "Course"}
                        </div>
                        <h2 className="mt-1 font-serif text-[21px] tracking-tightish truncate">
                          {assignment.title}
                        </h2>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint group-hover:text-accent transition-colors" />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
                      <span className="rounded-full bg-paper-sunken px-2.5 py-1">
                        {getAssignmentStageLabel(assignment.stage)}
                      </span>
                      <span className="rounded-full bg-paper-sunken px-2.5 py-1">
                        {formatAssignmentDueDate(assignment.dueOn)}
                      </span>
                      <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent-ink">
                        {getUnderstandingStatusLabel(
                          assignment.understandingStatus,
                        )}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
