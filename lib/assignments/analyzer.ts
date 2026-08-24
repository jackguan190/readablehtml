import { z } from "zod";
import { assignmentAnalysisProposalV1Schema } from "../contracts/nebu/v1/analysis";
import {
  reasoningClassSchema,
  requirementKindSchema,
} from "../contracts/nebu/v1/requirement";
import type { CallStructuredInput, CallStructuredResult } from "../llm/types";

type RequirementKind = z.infer<typeof requirementKindSchema>;
type ReasoningClass = z.infer<typeof reasoningClassSchema>;

export const ASSIGNMENT_ANALYSIS_SYSTEM_PROMPT = `Analyze only the supplied assignment brief.
Do not invent a rubric, grading criterion, professor preference, due date, or word limit.
Use reasoningClass "required" only when supportQuote is an exact, unique substring of the brief.
Use reasoningClass "inference" for interpretation or ambiguity and set supportQuote to null.
Return strict JSON matching schemaVersion 1. Do not return prose outside JSON.

Extract only what the brief explicitly supports or clearly leaves ambiguous. Look for:
- central question
- deliverables
- constraints
- dates
- word limit
- explicit expectations
- criteria present in the brief
- ambiguities`;

export interface AnalyzeAssignmentBriefInput {
  briefText: string;
  provider: {
    callStructured(input: CallStructuredInput): Promise<CallStructuredResult>;
  };
}

export interface NewRequirementDraft {
  kind: RequirementKind;
  text: string;
  reasoningClass: ReasoningClass;
  support: { quote: string; start: number; end: number } | null;
  orderIndex: number;
}

export type AnalyzeBriefResult =
  | {
      ok: true;
      items: NewRequirementDraft[];
      providerUsed: string;
      modelUsed: string;
    }
  | {
      ok: false;
      code:
        | "invalid_model_output"
        | "unverifiable_support"
        | "provider_error";
      message: string;
    };

export function findUniqueQuote(
  text: string,
  quote: string,
): { start: number; end: number } | null {
  const start = text.indexOf(quote);
  if (start < 0) return null;
  if (text.indexOf(quote, start + 1) >= 0) return null;
  return { start, end: start + quote.length };
}

export async function analyzeAssignmentBrief({
  briefText,
  provider,
}: AnalyzeAssignmentBriefInput): Promise<AnalyzeBriefResult> {
  let modelResponse: CallStructuredResult;

  try {
    modelResponse = await provider.callStructured({
      systemPrompt: ASSIGNMENT_ANALYSIS_SYSTEM_PROMPT,
      userPrompt: `Assignment brief:\n${briefText}`,
      responseFormat: "json",
      temperature: 0.1,
    });
  } catch (error) {
    return {
      ok: false,
      code: "provider_error",
      message:
        error instanceof Error
          ? error.message
          : "Assignment analysis provider call failed.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(modelResponse.content);
  } catch {
    return {
      ok: false,
      code: "invalid_model_output",
      message: "Assignment analysis returned invalid JSON.",
    };
  }

  const proposal = assignmentAnalysisProposalV1Schema.safeParse(parsed);
  if (!proposal.success) {
    return {
      ok: false,
      code: "invalid_model_output",
      message: z.prettifyError(proposal.error),
    };
  }

  const items: NewRequirementDraft[] = [];

  for (const [index, item] of proposal.data.items.entries()) {
    if (item.reasoningClass === "inference") {
      if (item.supportQuote !== null) {
        return {
          ok: false,
          code: "invalid_model_output",
          message: "Inference items must not include support quotes.",
        };
      }

      items.push({
        kind: item.kind,
        text: item.text,
        reasoningClass: item.reasoningClass,
        support: null,
        orderIndex: index,
      });
      continue;
    }

    if (item.supportQuote === null) {
      return {
        ok: false,
        code: "unverifiable_support",
        message: `Required item ${index} is missing an exact support quote.`,
      };
    }

    const offsets = findUniqueQuote(briefText, item.supportQuote);
    if (!offsets) {
      return {
        ok: false,
        code: "unverifiable_support",
        message: `Required item ${index} does not resolve to a unique exact quote.`,
      };
    }

    items.push({
      kind: item.kind,
      text: item.text,
      reasoningClass: item.reasoningClass,
      support: {
        quote: item.supportQuote,
        start: offsets.start,
        end: offsets.end,
      },
      orderIndex: index,
    });
  }

  return {
    ok: true,
    items,
    providerUsed: modelResponse.providerUsed,
    modelUsed: modelResponse.modelUsed,
  };
}
