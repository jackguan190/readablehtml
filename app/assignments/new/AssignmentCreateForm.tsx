"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createAssignmentAction } from "@/lib/assignments/actions";
import type { CreateAssignmentFormState } from "@/lib/assignments/actions";
import type { CourseV1 } from "@/lib/contracts/nebu/v1";

interface AssignmentCreateFormProps {
  courses: CourseV1[];
}

const INITIAL_STATE: CreateAssignmentFormState = {
  formError: null,
  fieldErrors: {},
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-[12px] text-red-700">{message}</p>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg bg-ink text-paper px-4 py-2.5 text-[13px] font-semibold shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 transition-opacity no-tap-highlight"
    >
      {pending ? "Creating…" : "Create assignment"}
    </button>
  );
}

export function AssignmentCreateForm({ courses }: AssignmentCreateFormProps) {
  const [state, formAction] = useFormState(
    createAssignmentAction,
    INITIAL_STATE,
  );
  const [courseMode, setCourseMode] = useState<"existing" | "new">(
    courses.length > 0 ? "existing" : "new",
  );

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-line bg-paper-raised px-3 py-2 text-[14px] outline-none transition-colors focus:border-accent";
  const labelClass = "block text-[13px] font-medium text-ink";

  return (
    <form action={formAction} className="space-y-7">
      {state.formError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {state.formError}
        </div>
      )}

      <fieldset>
        <legend className="text-[13px] font-semibold text-ink">Course</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="rounded-xl border border-line bg-paper-raised p-3 text-[13px]">
            <input
              type="radio"
              name="courseMode"
              value="existing"
              checked={courseMode === "existing"}
              disabled={courses.length === 0}
              onChange={() => setCourseMode("existing")}
              className="mr-2"
            />
            Use an existing course
          </label>
          <label className="rounded-xl border border-line bg-paper-raised p-3 text-[13px]">
            <input
              type="radio"
              name="courseMode"
              value="new"
              checked={courseMode === "new"}
              onChange={() => setCourseMode("new")}
              className="mr-2"
            />
            Create a new course
          </label>
        </div>
        <FieldError message={state.fieldErrors.courseMode} />

        {courseMode === "existing" && courses.length > 0 && (
          <label className={`${labelClass} mt-4`}>
            Existing course
            <select name="courseId" className={inputClass}>
              <option value="">Choose a course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                  {course.term ? ` — ${course.term}` : ""}
                </option>
              ))}
            </select>
            <FieldError message={state.fieldErrors.courseId} />
          </label>
        )}

        {courseMode === "new" && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className={labelClass}>
              Course name
              <input
                name="courseName"
                className={inputClass}
                placeholder="Modern Political Theory"
              />
              <FieldError message={state.fieldErrors.courseName} />
            </label>
            <label className={labelClass}>
              Term
              <input name="term" className={inputClass} placeholder="Fall 2026" />
            </label>
            <label className={labelClass}>
              Instructor
              <input
                name="instructorName"
                className={inputClass}
                placeholder="Professor name"
              />
            </label>
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className={labelClass}>
          Assignment title
          <input
            name="assignmentTitle"
            className={inputClass}
            placeholder="Essay 1: Memory and Modernity"
          />
          <FieldError message={state.fieldErrors.assignmentTitle} />
        </label>
        <label className={labelClass}>
          Due date
          <input name="dueOn" type="date" className={inputClass} />
          <FieldError message={state.fieldErrors.dueOn} />
        </label>
      </div>

      <label className={labelClass}>
        Assignment brief
        <textarea
          name="briefText"
          rows={12}
          className={`${inputClass} resize-y leading-6`}
          placeholder="Paste the assignment prompt, rubric language, or professor instructions here."
        />
        <FieldError message={state.fieldErrors.briefText} />
      </label>

      <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] leading-5 text-ink-muted max-w-[58ch]">
          Nebu will only extract claims it can support from this brief. Missing
          context is marked as inference, not treated as a hidden rubric.
        </p>
        <SubmitButton />
      </div>
    </form>
  );
}
