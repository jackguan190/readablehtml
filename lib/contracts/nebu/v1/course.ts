import { z } from "zod";
import { NEBU_SCHEMA_VERSION, opaqueIdSchema, timestampSchema } from "./shared";

export const courseV1Schema = z.strictObject({
  schemaVersion: z.literal(NEBU_SCHEMA_VERSION),
  id: opaqueIdSchema,
  userId: opaqueIdSchema,
  name: z.string().trim().min(1).max(160),
  term: z.string().trim().min(1).max(80).nullable(),
  instructorName: z.string().trim().min(1).max(160).nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type CourseV1 = z.infer<typeof courseV1Schema>;
