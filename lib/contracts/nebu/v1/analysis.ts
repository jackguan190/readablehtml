import { z } from "zod";
import { NEBU_SCHEMA_VERSION } from "./shared";
import { reasoningClassSchema, requirementKindSchema } from "./requirement";

export const analysisProposalItemV1Schema = z
  .strictObject({
    kind: requirementKindSchema,
    text: z.string().trim().min(1).max(2_000),
    reasoningClass: reasoningClassSchema,
    supportQuote: z.string().min(1).max(4_000).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "rubric_criterion" && value.reasoningClass !== "required") {
      ctx.addIssue({
        code: "custom",
        path: ["reasoningClass"],
        message: "rubric criteria must be required, never inferred",
      });
    }
    if (value.kind === "rubric_criterion" && value.supportQuote === null) {
      ctx.addIssue({
        code: "custom",
        path: ["supportQuote"],
        message: "rubric criteria need an exact support quote",
      });
    }
  });

export const assignmentAnalysisProposalV1Schema = z.strictObject({
  schemaVersion: z.literal(NEBU_SCHEMA_VERSION),
  items: z.array(analysisProposalItemV1Schema).min(1).max(40),
});

export type AssignmentAnalysisProposalV1 = z.infer<typeof assignmentAnalysisProposalV1Schema>;
