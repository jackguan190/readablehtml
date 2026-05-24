import "server-only";

import OpenAI from "openai";
import { paragraphize } from "./paragraphizer";
import type { RawPage, StructuredSectionInput } from "./structuring";
import { attachFootnotesToSections, bodyTextFor, buildHeuristicSections } from "./structuring";
import type { SerializedParagraph } from "./types";

const MODEL = "gpt-4o-mini";
const MAX_CHARS = 60_000; // ~12-15k tokens for typical English; safe for a single call

interface AIPlanSection {
  title: string;
  page_start: number;
  page_end: number;
  summary: string;
  key_terms: { term: string; def: string }[];
}

interface AIPlan {
  sections: AIPlanSection[];
}

export interface AiStructureResult {
  kind: "ok";
  sections: StructuredSectionInput[];
}

export interface AiStructureSkipped {
  kind: "skipped";
  reason: "no_api_key" | "openai_error" | "no_text";
  detail?: string;
}

export type AiStructureOutcome = AiStructureResult | AiStructureSkipped;

function isOpenAiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

function compactPagesForPrompt(pages: RawPage[]): string {
  // Send only main body text to the LLM — footnotes and author-note text are
  // deliberately excluded so they don't pollute generated summaries / titles.
  // Footnotes are attached separately to the resulting sections via
  // attachFootnotesToSections().
  let total = 0;
  const out: string[] = [];
  for (const p of pages) {
    const header = `--- PAGE ${p.page} ---\n`;
    const remaining = MAX_CHARS - total - header.length;
    if (remaining <= 0) break;
    const body = bodyTextFor(p);
    const text = body.slice(0, Math.max(0, remaining));
    out.push(header + text);
    total += header.length + text.length;
  }
  return out.join("\n\n");
}

const SYSTEM_PROMPT = `You are structuring an academic PDF into a study page.
Given the extracted text from a PDF with explicit "--- PAGE N ---" markers,
identify the document's natural sections and produce a JSON plan.

Rules:
- Output strict JSON with shape { "sections": [{ "title", "page_start", "page_end", "summary", "key_terms" }] }.
- "title" should be a short, content-meaningful heading. Prefer headings present in the source. If absent, invent a concise descriptive one (3-8 words).
- "page_start" and "page_end" are integer PDF page numbers (use the "--- PAGE N ---" markers).
- "summary" is 2-3 plain sentences describing what the section argues or covers.
- "key_terms" lists 3-6 terms with short (one-sentence) definitions, drawn from the section content. Skip if there are none.
- Cover the entire document — every page should belong to exactly one section.
- Do not invent content not present in the source.
- Do not include the body paragraphs in your output — only structural metadata.`;

async function fetchPlan(pages: RawPage[]): Promise<AIPlan> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = compactPagesForPrompt(pages);
  const completion = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OpenAI returned non-JSON content.");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as AIPlan).sections)
  ) {
    throw new Error("OpenAI plan was missing 'sections' array.");
  }
  return parsed as AIPlan;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Slice the raw page text using the AI's page_start/page_end plan and split
 * each section's text into reader-friendly paragraphs. The LLM only supplies
 * structural metadata — paragraph content comes from the verifiable source.
 */
function mergePlanWithRawPages(
  plan: AIPlan,
  pages: RawPage[],
): StructuredSectionInput[] {
  const pageMap = new Map<number, RawPage>();
  pages.forEach((p) => pageMap.set(p.page, p));
  const minPage = pages[0]?.page ?? 1;
  const maxPage = pages[pages.length - 1]?.page ?? minPage;

  const out: StructuredSectionInput[] = [];
  plan.sections.forEach((s, i) => {
    const startPage = clamp(Math.floor(s.page_start ?? minPage), minPage, maxPage);
    const endPage = clamp(
      Math.floor(s.page_end ?? startPage),
      startPage,
      maxPage,
    );

    const slug = slugify(s.title || `section-${i + 1}`) || `section-${i + 1}`;
    const sectionKey = `sec-${i + 1}-${slug}`;

    const paragraphs: SerializedParagraph[] = [];
    for (let p = startPage; p <= endPage; p++) {
      const sourcePage = pageMap.get(p);
      const text = sourcePage ? bodyTextFor(sourcePage) : "";
      const chunks = paragraphize(text);
      chunks.forEach((chunk, j) => {
        paragraphs.push({
          id: `p-${sectionKey}-${p}-${j}`,
          page: p,
          dropcap: i === 0 && p === startPage && j === 0,
          inline: [{ type: "text", text: chunk }],
        });
      });
    }

    if (paragraphs.length === 0) {
      paragraphs.push({
        id: `p-${sectionKey}-0`,
        page: startPage,
        inline: [{ type: "text", text: "" }],
      });
    }

    out.push({
      section_index: i,
      section_key: sectionKey,
      title: (s.title ?? `Section ${i + 1}`).trim() || `Section ${i + 1}`,
      page_start: startPage,
      page_end: endPage !== startPage ? endPage : null,
      summary: typeof s.summary === "string" && s.summary.trim().length > 0
        ? s.summary.trim()
        : null,
      key_terms: Array.isArray(s.key_terms)
        ? s.key_terms
            .filter(
              (kt): kt is { term: string; def: string } =>
                !!kt &&
                typeof kt.term === "string" &&
                typeof kt.def === "string" &&
                kt.term.trim().length > 0 &&
                kt.def.trim().length > 0,
            )
            .map((kt) => ({ term: kt.term.trim(), def: kt.def.trim() }))
            .slice(0, 6)
        : [],
      body: { paragraphs },
    });
  });

  if (out.length === 0) {
    // Plan was empty — fall back to heuristic so we never produce 0 sections.
    return buildHeuristicSections(pages).sections;
  }
  // Attach per-page footnotes / author-note based on each section's page range.
  return attachFootnotesToSections(out, pages);
}

/**
 * Run AI-driven structuring. Returns `skipped` if OPENAI_API_KEY is missing
 * or the call fails — callers should fall back to heuristic structuring.
 */
export async function aiStructure(pages: RawPage[]): Promise<AiStructureOutcome> {
  if (!isOpenAiConfigured()) {
    return { kind: "skipped", reason: "no_api_key" };
  }
  if (pages.length === 0 || pages.every((p) => !p.text.trim())) {
    return { kind: "skipped", reason: "no_text" };
  }

  try {
    const plan = await fetchPlan(pages);
    const sections = mergePlanWithRawPages(plan, pages);
    return { kind: "ok", sections };
  } catch (err) {
    return {
      kind: "skipped",
      reason: "openai_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
