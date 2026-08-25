import { describe, expect, it } from "vitest";
import { parseCreateAssignmentInput } from "./input";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const base = {
  assignmentTitle: "  Essay One  ",
  briefText: "  Analyze the role of memory.  ",
  dueOn: "",
};

describe("parseCreateAssignmentInput", () => {
  it("accepts an existing course", () => {
    expect(
      parseCreateAssignmentInput(
        form({ ...base, courseMode: "existing", courseId: "course-1" }),
      ),
    ).toEqual({
      ok: true,
      value: {
        courseMode: "existing",
        courseId: "course-1",
        assignmentTitle: "Essay One",
        briefText: "Analyze the role of memory.",
        dueOn: null,
      },
    });
  });

  it("accepts a new course and normalizes optional labels", () => {
    expect(
      parseCreateAssignmentInput(
        form({
          ...base,
          courseMode: "new",
          courseName: "  Modern History  ",
          term: "  Fall 2026  ",
          instructorName: "   ",
          dueOn: "2026-09-30",
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        courseMode: "new",
        courseName: "Modern History",
        term: "Fall 2026",
        instructorName: null,
        assignmentTitle: "Essay One",
        briefText: "Analyze the role of memory.",
        dueOn: "2026-09-30",
      },
    });
  });

  it("preserves internal whitespace in the stored brief", () => {
    const result = parseCreateAssignmentInput(
      form({
        ...base,
        courseMode: "existing",
        courseId: "course-1",
        briefText: "  A sentence.\n\n  Another sentence.  ",
      }),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        courseMode: "existing",
        courseId: "course-1",
        assignmentTitle: "Essay One",
        briefText: "A sentence.\n\n  Another sentence.",
        dueOn: null,
      },
    });
  });

  const invalidCases: Array<{
    values: Record<string, string>;
    field: string;
    message: string;
  }> = [
    {
      values: {
        ...base,
        courseMode: "existing",
        courseId: "",
        assignmentTitle: "",
      },
      field: "assignmentTitle",
      message: "Assignment title is required.",
    },
    {
      values: {
        ...base,
        courseMode: "existing",
        courseId: "",
        briefText: "   ",
      },
      field: "briefText",
      message: "Assignment brief is required.",
    },
    {
      values: {
        ...base,
        courseMode: "existing",
        courseId: "",
        dueOn: "09/30/2026",
      },
      field: "dueOn",
      message: "Use a valid date in YYYY-MM-DD format.",
    },
    {
      values: {
        ...base,
        courseMode: "existing",
        courseId: "",
        briefText: "x".repeat(100_001),
      },
      field: "briefText",
      message: "Assignment brief must be 100,000 characters or fewer.",
    },
    {
      values: { ...base, courseMode: "existing", courseId: "" },
      field: "courseId",
      message: "Choose a course.",
    },
    {
      values: { ...base, courseMode: "new", courseName: "" },
      field: "courseName",
      message: "Course name is required.",
    },
    {
      values: { ...base, courseId: "course-1" },
      field: "courseMode",
      message: "Choose whether to use an existing course or create a new one.",
    },
    {
      values: { ...base, courseMode: "surprise", courseId: "course-1" },
      field: "courseMode",
      message: "Choose whether to use an existing course or create a new one.",
    },
    {
      values: {
        ...base,
        courseMode: "existing",
        courseId: "course-1",
        dueOn: "2026-02-30",
      },
      field: "dueOn",
      message: "Use a valid date in YYYY-MM-DD format.",
    },
  ];

  it.each(invalidCases)(
    "returns the exact $field error",
    ({ values, field, message }) => {
      const result = parseCreateAssignmentInput(form(values));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.fieldErrors[field]).toBe(message);
    },
  );
});
