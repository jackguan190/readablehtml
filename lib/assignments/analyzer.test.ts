import { describe, expect, it, vi } from "vitest";
import {
  analyzeAssignmentBrief,
  ASSIGNMENT_ANALYSIS_SYSTEM_PROMPT,
} from "./analyzer";

function providerReturning(content: string) {
  return {
    callStructured: vi.fn(async () => ({
      content,
      modelUsed: "gpt-test",
      providerUsed: "openai" as const,
    })),
  };
}

function proposal(items: unknown[]): string {
  return JSON.stringify({ schemaVersion: 1, items });
}

describe("analyzeAssignmentBrief", () => {
  it("resolves a unique exact support quote to UTF-16 offsets", async () => {
    const briefText = "Write a 1,500-word argument about public memory.";
    const result = await analyzeAssignmentBrief({
      briefText,
      provider: providerReturning(
        proposal([
          {
            kind: "word_limit",
            text: "The essay is 1,500 words.",
            reasoningClass: "required",
            supportQuote: "1,500-word",
          },
        ]),
      ),
    });

    expect(result).toMatchObject({
      ok: true,
      items: [{ support: { quote: "1,500-word", start: 8, end: 18 } }],
    });
  });

  it("keeps ambiguity as inference with null support", async () => {
    const result = await analyzeAssignmentBrief({
      briefText: "Discuss memory.",
      provider: providerReturning(
        proposal([
          {
            kind: "ambiguity",
            text: "The expected evidence base is unclear.",
            reasoningClass: "inference",
            supportQuote: null,
          },
        ]),
      ),
    });

    expect(result).toMatchObject({ ok: true, items: [{ support: null }] });
  });

  it("rejects invalid JSON", async () => {
    const result = await analyzeAssignmentBrief({
      briefText: "Discuss memory.",
      provider: providerReturning("not-json"),
    });

    expect(result).toMatchObject({
      ok: false,
      code: "invalid_model_output",
    });
  });

  it("rejects unknown output keys", async () => {
    const result = await analyzeAssignmentBrief({
      briefText: "Discuss memory.",
      provider: providerReturning(
        JSON.stringify({
          schemaVersion: 1,
          items: [
            {
              kind: "central_question",
              text: "Discuss memory.",
              reasoningClass: "required",
              supportQuote: "Discuss memory.",
            },
          ],
          assumedRubric: ["clarity"],
        }),
      ),
    });

    expect(result).toMatchObject({
      ok: false,
      code: "invalid_model_output",
    });
  });

  it.each([
    ["an absent quote", "Discuss memory.", "Use archival evidence."],
    ["a repeated quote", "Use evidence. Use evidence.", "Use evidence."],
  ])(
    "rejects required support with %s",
    async (_name, briefText, supportQuote) => {
      const result = await analyzeAssignmentBrief({
        briefText,
        provider: providerReturning(
          proposal([
            {
              kind: "constraint",
              text: "Use evidence.",
              reasoningClass: "required",
              supportQuote,
            },
          ]),
        ),
      });

      expect(result).toMatchObject({
        ok: false,
        code: "unverifiable_support",
      });
    },
  );

  it("limits output to forty items", async () => {
    const items = Array.from({ length: 41 }, (_, index) => ({
      kind: "ambiguity",
      text: `Ambiguity ${index}`,
      reasoningClass: "inference",
      supportQuote: null,
    }));

    const result = await analyzeAssignmentBrief({
      briefText: "Discuss memory.",
      provider: providerReturning(proposal(items)),
    });

    expect(result).toMatchObject({
      ok: false,
      code: "invalid_model_output",
    });
  });

  it("instructs the model not to invent missing context", async () => {
    const provider = providerReturning(
      proposal([
        {
          kind: "ambiguity",
          text: "No rubric is included.",
          reasoningClass: "inference",
          supportQuote: null,
        },
      ]),
    );

    await analyzeAssignmentBrief({ briefText: "Discuss memory.", provider });

    expect(ASSIGNMENT_ANALYSIS_SYSTEM_PROMPT).toContain(
      "Do not invent a rubric",
    );
    expect(ASSIGNMENT_ANALYSIS_SYSTEM_PROMPT).toContain("professor preference");
    expect(provider.callStructured.mock.calls[0][0].systemPrompt).toBe(
      ASSIGNMENT_ANALYSIS_SYSTEM_PROMPT,
    );
  });
});
