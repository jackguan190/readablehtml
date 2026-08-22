import { z } from "zod";
import { NEBU_SCHEMA_VERSION, opaqueIdSchema } from "./shared";
import { assignmentBriefV1Schema } from "./assignment";

export const requirementKindSchema = z.enum([
  "central_question",
  "deliverable",
  "constraint",
  "word_limit",
  "due_date",
  "rubric_criterion",
  "expectation",
  "ambiguity",
]);

export const reasoningClassSchema = z.enum(["required", "inference"]);
export const reviewStatusSchema = z.enum(["proposed", "confirmed", "rejected"]);

export const sourceSupportSchema = z
  .strictObject({
    materialId: opaqueIdSchema,
    quote: z.string().min(1).max(4_000),
    start: z.number().int().min(0),
    end: z.number().int().positive(),
  })
  .refine((value) => value.end > value.start, {
    message: "support end must be greater than start",
    path: ["end"],
  });

export const assignmentRequirementV1Schema = z.strictObject({
  schemaVersion: z.literal(NEBU_SCHEMA_VERSION),
  id: opaqueIdSchema,
  assignmentId: opaqueIdSchema,
  kind: requirementKindSchema,
  text: z.string().trim().min(1).max(2_000),
  reasoningClass: reasoningClassSchema,
  reviewStatus: reviewStatusSchema,
  origin: z.enum(["ai", "user"]),
  studentEdited: z.boolean(),
  support: sourceSupportSchema.nullable(),
  orderIndex: z.number().int().min(0),
});

export const assignmentUnderstandingV1Schema = z
  .strictObject({
    schemaVersion: z.literal(NEBU_SCHEMA_VERSION),
    assignmentId: opaqueIdSchema,
    brief: assignmentBriefV1Schema,
    rubricAvailable: z.boolean(),
    items: z.array(assignmentRequirementV1Schema).min(1),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    value.items.forEach((item, index) => {
      if (ids.has(item.id)) {
        ctx.addIssue({ code: "custom", path: ["items", index, "id"], message: "duplicate requirement id" });
      }
      ids.add(item.id);
      if (item.assignmentId !== value.assignmentId) {
        ctx.addIssue({ code: "custom", path: ["items", index, "assignmentId"], message: "requirement belongs to another assignment" });
      }
      if (item.reasoningClass === "required" && item.support === null) {
        ctx.addIssue({ code: "custom", path: ["items", index, "support"], message: "required items need exact source support" });
      }
      if (item.support) {
        const { start, end, quote, materialId } = item.support;
        if (materialId !== value.brief.id || value.brief.text.slice(start, end) !== quote) {
          ctx.addIssue({ code: "custom", path: ["items", index, "support"], message: "support must resolve exactly inside the assignment brief" });
        }
      }
    });
  });

export type AssignmentRequirementV1 = z.infer<typeof assignmentRequirementV1Schema>;
export type AssignmentUnderstandingV1 = z.infer<typeof assignmentUnderstandingV1Schema>;
