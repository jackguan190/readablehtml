export const CREATE_ASSIGNMENT_ERRORS = {
  courseId: "Choose a course.",
  courseName: "Course name is required.",
  assignmentTitle: "Assignment title is required.",
  briefText: "Assignment brief is required.",
  briefTooLong: "Assignment brief must be 100,000 characters or fewer.",
  dueOn: "Use a valid date in YYYY-MM-DD format.",
} as const;

export type CreateAssignmentInput = {
  assignmentTitle: string;
  briefText: string;
  dueOn: string | null;
} &
  (
    | { courseMode: "existing"; courseId: string }
    | {
        courseMode: "new";
        courseName: string;
        term: string | null;
        instructorName: string | null;
      }
  );

export type InputResult<T> =
  | { ok: true; value: T }
  | { ok: false; fieldErrors: Record<string, string> };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function optionalLabel(value: string): string | null {
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseCreateAssignmentInput(
  formData: FormData,
): InputResult<CreateAssignmentInput> {
  const assignmentTitle = field(formData, "assignmentTitle").trim();
  const briefText = field(formData, "briefText").trim();
  const dueOnValue = field(formData, "dueOn").trim();
  const courseMode = field(formData, "courseMode");
  const courseId = field(formData, "courseId").trim();
  const courseName = field(formData, "courseName").trim();
  const term = optionalLabel(field(formData, "term"));
  const instructorName = optionalLabel(field(formData, "instructorName"));
  const fieldErrors: Record<string, string> = {};

  if (assignmentTitle === "") {
    fieldErrors.assignmentTitle = CREATE_ASSIGNMENT_ERRORS.assignmentTitle;
  }
  if (briefText === "") {
    fieldErrors.briefText = CREATE_ASSIGNMENT_ERRORS.briefText;
  } else if (briefText.length > 100_000) {
    fieldErrors.briefText = CREATE_ASSIGNMENT_ERRORS.briefTooLong;
  }
  if (dueOnValue !== "" && !isValidDate(dueOnValue)) {
    fieldErrors.dueOn = CREATE_ASSIGNMENT_ERRORS.dueOn;
  }
  if (courseMode === "existing" && courseId === "") {
    fieldErrors.courseId = CREATE_ASSIGNMENT_ERRORS.courseId;
  }
  if (courseMode === "new" && courseName === "") {
    fieldErrors.courseName = CREATE_ASSIGNMENT_ERRORS.courseName;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const common = {
    assignmentTitle,
    briefText,
    dueOn: dueOnValue === "" ? null : dueOnValue,
  };

  if (courseMode === "existing") {
    return { ok: true, value: { ...common, courseMode, courseId } };
  }

  return {
    ok: true,
    value: {
      ...common,
      courseMode: "new",
      courseName,
      term,
      instructorName,
    },
  };
}
