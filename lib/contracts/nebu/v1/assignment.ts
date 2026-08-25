import { z } from "zod";
import {
  NEBU_SCHEMA_VERSION,
  assignmentStageSchema,
  opaqueIdSchema,
  timestampSchema,
  understandingStatusSchema,
} from "./shared";

export const assignmentV1Schema = z.strictObject({
  schemaVersion: z.literal(NEBU_SCHEMA_VERSION),
  id: opaqueIdSchema,
  userId: opaqueIdSchema,
  courseId: opaqueIdSchema,
  title: z.string().trim().min(1).max(240),
  dueOn: z.iso.date().nullable(),
  stage: assignmentStageSchema,
  understandingStatus: understandingStatusSchema,
  understandingError: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const assignmentBriefV1Schema = z.strictObject({
  schemaVersion: z.literal(NEBU_SCHEMA_VERSION),
  id: opaqueIdSchema,
  userId: opaqueIdSchema,
  courseId: opaqueIdSchema,
  assignmentId: opaqueIdSchema,
  kind: z.literal("assignment_brief"),
  format: z.literal("text"),
  text: z.string().min(1).max(100_000),
  createdAt: timestampSchema,
});

export type AssignmentV1 = z.infer<typeof assignmentV1Schema>;
export type AssignmentBriefV1 = z.infer<typeof assignmentBriefV1Schema>;
