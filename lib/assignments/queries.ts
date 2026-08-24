import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assignmentBriefV1Schema,
  assignmentRequirementV1Schema,
  assignmentV1Schema,
  courseV1Schema,
  type AssignmentBriefV1,
  type AssignmentRequirementV1,
  type AssignmentV1,
  type CourseV1,
} from "../contracts/nebu/v1";

export interface AssignmentAnalysisJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  startedAt: string | null;
  error: string | null;
}

export interface AssignmentWorkspaceData {
  course: CourseV1;
  assignment: AssignmentV1;
  brief: AssignmentBriefV1;
  requirements: AssignmentRequirementV1[];
  latestAnalysisJob: AssignmentAnalysisJob | null;
}

type Row = Record<string, unknown>;

function asRow(value: unknown): Row | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Row)
    : null;
}

function mapCourse(row: unknown): CourseV1 | null {
  const value = asRow(row);
  if (!value) return null;
  const parsed = courseV1Schema.safeParse({
    schemaVersion: 1,
    id: value.id,
    userId: value.user_id,
    name: value.name,
    term: value.term,
    instructorName: value.instructor_name,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  });
  return parsed.success ? parsed.data : null;
}

function mapAssignment(row: unknown): AssignmentV1 | null {
  const value = asRow(row);
  if (!value) return null;
  const parsed = assignmentV1Schema.safeParse({
    schemaVersion: 1,
    id: value.id,
    userId: value.user_id,
    courseId: value.course_id,
    title: value.title,
    dueOn: value.due_on,
    stage: value.stage,
    understandingStatus: value.understanding_status,
    understandingError: value.understanding_error,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  });
  return parsed.success ? parsed.data : null;
}

function mapBrief(row: unknown): AssignmentBriefV1 | null {
  const value = asRow(row);
  if (!value) return null;
  const parsed = assignmentBriefV1Schema.safeParse({
    schemaVersion: 1,
    id: value.id,
    userId: value.user_id,
    courseId: value.course_id,
    assignmentId: value.assignment_id,
    kind: value.kind,
    format: value.format,
    text: value.raw_text,
    createdAt: value.created_at,
  });
  return parsed.success ? parsed.data : null;
}

function mapRequirement(row: unknown): AssignmentRequirementV1 | null {
  const value = asRow(row);
  if (!value) return null;
  const hasSource = value.source_material_id !== null;
  const parsed = assignmentRequirementV1Schema.safeParse({
    schemaVersion: 1,
    id: value.id,
    assignmentId: value.assignment_id,
    kind: value.kind,
    text: value.text,
    reasoningClass: value.reasoning_class,
    reviewStatus: value.review_status,
    origin: value.origin,
    studentEdited: value.student_edited,
    support: hasSource
      ? {
          materialId: value.source_material_id,
          quote: value.source_quote,
          start: value.source_start,
          end: value.source_end,
        }
      : null,
    orderIndex: value.order_index,
  });
  return parsed.success ? parsed.data : null;
}

function mapLatestAnalysisJob(
  row: unknown,
): AssignmentAnalysisJob | null {
  const value = asRow(row);
  if (
    !value ||
    typeof value.id !== "string" ||
    !["queued", "running", "succeeded", "failed"].includes(
      String(value.status),
    ) ||
    (value.started_at !== null && typeof value.started_at !== "string") ||
    (value.error !== null && typeof value.error !== "string")
  ) {
    return null;
  }

  return {
    id: value.id,
    status: value.status as AssignmentAnalysisJob["status"],
    startedAt: value.started_at as string | null,
    error: value.error as string | null,
  };
}

export async function getOwnedCourses(
  supabase: SupabaseClient,
  userId: string,
): Promise<CourseV1[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map(mapCourse).filter((course): course is CourseV1 => course !== null);
}

export async function getAssignmentList(
  supabase: SupabaseClient,
  userId: string,
): Promise<AssignmentV1[]> {
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data
    .map(mapAssignment)
    .filter((assignment): assignment is AssignmentV1 => assignment !== null);
}

export async function getAssignmentWorkspace(
  supabase: SupabaseClient,
  userId: string,
  assignmentId: string,
): Promise<AssignmentWorkspaceData | null> {
  const { data: assignmentRow, error: assignmentError } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("user_id", userId)
    .maybeSingle();
  const assignment = assignmentError ? null : mapAssignment(assignmentRow);
  if (!assignment) return null;

  const { data: courseRow, error: courseError } = await supabase
    .from("courses")
    .select("*")
    .eq("id", assignment.courseId)
    .eq("user_id", userId)
    .maybeSingle();
  const course = courseError ? null : mapCourse(courseRow);
  if (!course) return null;

  const { data: briefRow, error: briefError } = await supabase
    .from("materials")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("user_id", userId)
    .eq("kind", "assignment_brief")
    .maybeSingle();
  const brief = briefError ? null : mapBrief(briefRow);
  if (!brief) return null;

  const { data: requirementRows, error: requirementsError } = await supabase
    .from("assignment_requirements")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("user_id", userId)
    .order("order_index", { ascending: true });
  if (requirementsError || !requirementRows) return null;
  const requirements = requirementRows.map(mapRequirement);
  if (requirements.some((requirement) => requirement === null)) return null;

  const { data: jobRow, error: jobError } = await supabase
    .from("assignment_analysis_jobs")
    .select("id, status, started_at, error")
    .eq("assignment_id", assignmentId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jobError) return null;
  const latestAnalysisJob = jobRow === null ? null : mapLatestAnalysisJob(jobRow);
  if (jobRow !== null && latestAnalysisJob === null) return null;

  return {
    course,
    assignment,
    brief,
    requirements: requirements as AssignmentRequirementV1[],
    latestAnalysisJob,
  };
}
