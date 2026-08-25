import { AssignmentCreateForm } from "@/app/assignments/new/AssignmentCreateForm";
import type { CourseV1 } from "@/lib/contracts/nebu/v1";

interface OnboardingAssignmentFormProps {
  courses: CourseV1[];
}

export function OnboardingAssignmentForm({
  courses,
}: OnboardingAssignmentFormProps) {
  return (
    <div className="min-h-screen bg-paper-sunken text-ink">
      <main className="max-w-page mx-auto px-4 py-8 sm:px-8 sm:py-12">
        <section className="max-w-[760px]">
          <div className="eyebrow text-accent">First assignment</div>
          <h1 className="mt-1.5 font-serif text-[30px] tracking-tightish sm:text-[42px]">
            Create your first assignment
          </h1>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-6 text-ink-muted">
            Paste your requirements first. You will review what Nebu finds
            before it uses them to support your essay work.
          </p>
        </section>

        <section className="mt-8 max-w-[760px] rounded-2xl border border-line bg-paper p-5 sm:p-7">
          <AssignmentCreateForm courses={courses} mode="onboarding" />
        </section>
      </main>
    </div>
  );
}
