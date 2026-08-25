import { z } from "zod";
import { assignmentUnderstandingV1Schema } from "./requirement";

export * from "./shared";
export * from "./course";
export * from "./assignment";
export * from "./requirement";
export * from "./analysis";

export type ParseAssignmentUnderstandingV1Result =
  | { ok: true; understanding: import("./requirement").AssignmentUnderstandingV1 }
  | { ok: false; code: "unsupported_version" | "invalid_understanding"; message: string };

export function parseAssignmentUnderstandingV1(
  input: unknown,
): ParseAssignmentUnderstandingV1Result {
  const receivedVersion =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>).schemaVersion
      : undefined;

  if (receivedVersion !== 1) {
    return {
      ok: false,
      code: "unsupported_version",
      message:
        receivedVersion === undefined
          ? "assignment understanding has no schemaVersion (or is not an object); only schemaVersion 1 is supported"
          : `unsupported schemaVersion ${JSON.stringify(receivedVersion)}; only schemaVersion 1 is supported`,
    };
  }

  const result = assignmentUnderstandingV1Schema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      code: "invalid_understanding",
      message: z.prettifyError(result.error),
    };
  }

  return { ok: true, understanding: result.data };
}
