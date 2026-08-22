import { z } from "zod";

export const NEBU_SCHEMA_VERSION = 1 as const;
export const opaqueIdSchema = z.string().min(1);
export const timestampSchema = z.iso.datetime({ offset: true });
export const assignmentStageSchema = z.enum([
  "setup",
  "research",
  "planning",
  "writing",
  "complete",
]);
export const understandingStatusSchema = z.enum([
  "not_started",
  "processing",
  "ready",
  "failed",
]);
