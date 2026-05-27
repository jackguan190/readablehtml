import { paragraphize } from "./paragraphizer";
import type { SerializedParagraph } from "./types";
import type { Footnote } from "@/lib/content";

/**
 * Heuristic structuring layer (no AI required).
 *
 * Walks per-page extracted text, detects probable headings using lightweight
 * regex heuristics, and groups paragraphs into semantic sections. Each section
 * carries page_start / page_end so the reading view can show "pp. 26–28" and
 * paragraphs keep their source page anchors.
 *
 * Heading detectors (any one is sufficient):
 *  - Numbered heading: "1. Introduction" / "1.2 Methods" / "Chapter 4"
 *  - All-caps short line: "INTRODUCTION" (3–80 chars, mostly letters, no sentence punctuation)
 *  - Title-case short line followed by a paragraph break — three or more
 *    capitalized words, no terminal punctuation, length 3–80 chars.
 *
 * If no headings are found, fall back to a single section "Document" containing
 * every paragraph, with page markers preserved per paragraph.
 */

export interface RawPage {
  page: number;
  /** Full original page text (used as fallback / for footnote extraction). */
  text: string;
  /** Body text with detected footnotes/author-note removed. Falls back to `text`. */
  mainText?: string;
  footnotes?: Footnote[];
  authorNote?: string;
  /** Debug: which footnote-extraction strategy fired on this page. */
  footnoteDetection?:
    | "divider"
    | "trailing-numbered"
    | "first-page-front-matter"
    | "first-page-publication-metadata"
    | "first-page-author-note"
    | "single-footnote-after-author-note"
    | "none";
}

export interface StructuredSectionInput {
  section_index: number;
  section_key: string;
  title: string;
  page_start: number;
  page_end: number | null;
  summary: string | null;
  body: {
    paragraphs: SerializedParagraph[];
    footnotes?: Footnote[];
    authorNote?: string;
  };
  key_terms: { term: string; def: string }[];
}

/**
 * Returns the page's body text used for structuring (main text minus
 * detected footnotes/author-note). Falls back to the original text when
 * footnote extraction declined to separate anything.
 */
export function bodyTextFor(page: RawPage): string {
  return page.mainText ?? page.text;
}

/**
 * Walk the page range covered by each section and attach the per-page
 * footnotes / author-note onto the section's body. Author note is taken
 * from the first page in the section that has one.
 */
export function attachFootnotesToSections(
  sections: StructuredSectionInput[],
  pages: RawPage[],
): StructuredSectionInput[] {
  const pageMap = new Map<number, RawPage>();
  pages.forEach((p) => pageMap.set(p.page, p));

  return sections.map((s) => {
    const start = s.page_start;
    const end = s.page_end ?? start;
    const fns: Footnote[] = [];
    let authorNote: string | undefined;
    for (let p = start; p <= end; p++) {
      const rp = pageMap.get(p);
      if (!rp) continue;
      if (rp.footnotes && rp.footnotes.length > 0) fns.push(...rp.footnotes);
      if (rp.authorNote && !authorNote) authorNote = rp.authorNote;
    }
    if (fns.length === 0 && !authorNote) return s;
    return {
      ...s,
      body: {
        ...s.body,
        footnotes: fns.length > 0 ? fns : s.body.footnotes,
        authorNote: authorNote ?? s.body.authorNote,
      },
    };
  });
}

const NUMBERED_HEADING_RE =
  /^(?:(?:\d+(?:\.\d+){0,3})|(?:Chapter|Section|Part|Appendix)\s+(?:[IVXLCDM]+|\d+|[A-Z]))[.:)\s]?\s+(.+?)$/i;

// Heading rough length / shape constraints.
const HEADING_MIN_LEN = 3;
const HEADING_MAX_LEN = 100;

function isMostlyLetters(line: string): boolean {
  const letters = line.replace(/[^\p{L}]/gu, "").length;
  return letters >= Math.max(2, Math.floor(line.length * 0.5));
}

function looksAllCaps(line: string): boolean {
  if (!/\p{Lu}/u.test(line)) return false;
  if (/\p{Ll}/u.test(line)) return false; // no lowercase
  if (!isMostlyLetters(line)) return false;
  return true;
}

function looksTitleCase(line: string): boolean {
  if (/[.!?]\s*$/.test(line)) return false; // terminal sentence punctuation = body sentence
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 12) return false;
  const capitalized = words.filter((w) =>
    /^[\p{Lu}]/u.test(w) || /^[0-9]/.test(w) || /^[A-Z][a-z]/.test(w),
  ).length;
  return capitalized >= Math.max(2, Math.ceil(words.length * 0.7));
}

function matchNumberedHeading(line: string): { full: string } | null {
  if (!NUMBERED_HEADING_RE.test(line)) return null;
  return { full: line };
}

/**
 * Standard single-word section names that count as headings even when they
 * fail the looksTitleCase >=2-words rule. Exported because `footnotes.ts`
 * uses the same list to detect the body-start when stripping page-1
 * front matter.
 */
export const KNOWN_SECTION_HEADINGS: ReadonlySet<string> = new Set([
  "introduction",
  "conclusion",
  "conclusions",
  "abstract",
  "background",
  "methods",
  "methodology",
  "results",
  "findings",
  "discussion",
  "references",
  "bibliography",
  "acknowledgments",
  "acknowledgements",
  "appendix",
  "summary",
  "notes",
  "overview",
  "preface",
  "foreword",
  "epilogue",
]);

export function looksKnownSectionHeading(line: string): boolean {
  const t = line
    .trim()
    .toLowerCase()
    .replace(/[\s.:;)]+$/, "")
    .replace(/^[\s(]+/, "");
  return KNOWN_SECTION_HEADINGS.has(t);
}

/** Question-style heading: short capitalized line ending with `?`. */
function looksQuestionHeading(line: string): boolean {
  if (!line.endsWith("?")) return false;
  if (line.length < HEADING_MIN_LEN || line.length > 120) return false;
  const inner = line.slice(0, -1).trim();
  if (!/^[A-Z]/.test(inner)) return false;
  const words = inner.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 14) return false;
  // first letter capitalized + no internal terminal punctuation
  if (/[.!?]\s/.test(inner)) return false;
  return true;
}

function lineLooksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < HEADING_MIN_LEN || t.length > HEADING_MAX_LEN) return false;
  if (looksKnownSectionHeading(t)) return true;
  if (looksQuestionHeading(t)) return true;
  if (/[.!?:;,]$/.test(t)) {
    // numbered headings sometimes end with ":" or "." after the number — allow only if numbered
    if (!matchNumberedHeading(t)) return false;
  }
  if (matchNumberedHeading(t)) return true;
  if (looksAllCaps(t)) return true;
  if (looksTitleCase(t)) return true;
  return false;
}

/**
 * Pre-processor: insert paragraph breaks around inline headings that
 * extraction collapsed into the middle of a paragraph. Targets:
 *
 *   "… end of body sentence. What is Gray Zone Conflict? The contemporary…"
 *
 * becomes:
 *
 *   "… end of body sentence.\n\nWhat is Gray Zone Conflict?\n\nThe contemporary…"
 *
 * which lets the downstream line-level heading detector pick the question
 * up as a section boundary.
 *
 * Conservative — only fires on question-style headings (2–10 words, capital
 * first letter, no internal `.`/`!`/`?`) preceded by a sentence terminator
 * and followed by a capital letter. Title-case-without-punctuation embedded
 * headings are harder to disambiguate from proper-noun runs in body prose
 * and are intentionally left for the line-level detector.
 */
export function insertHeadingBoundaries(text: string): string {
  return text.replace(
    /([.!?]['"”’)\]]?)\s+([A-Z][A-Za-z]+(?:\s+[A-Za-z][A-Za-z'-]*){1,9}\?)\s+([A-Z])/g,
    "$1\n\n$2\n\n$3",
  );
}

interface HeadingHit {
  page: number;
  raw: string; // original line text
  position: number; // line index within the page
}

interface DetectedSection {
  title: string;
  pageStart: number;
  pageEnd: number;
  /** Concatenated body text for this section, paragraphs separated by \n\n. */
  body: string;
  /** Page that each block of body text came from, parallel to the blocks. */
  bodyPages: number[];
  bodyBlocks: string[];
}

type FlatLine = { page: number; text: string; blank: boolean };

const STRUCT_DEBUG =
  typeof process !== "undefined" &&
  (process.env.STRUCTURE_DEBUG === "1" ||
    process.env.NODE_ENV !== "production");

function sdbg(...args: unknown[]) {
  if (!STRUCT_DEBUG) return;
  // eslint-disable-next-line no-console
  console.log("[structure-debug]", ...args);
}

/**
 * Build a DetectedSection from a slice of flattened lines.
 * Walks lines page-grouped so the resulting bodyBlocks know their source page.
 */
function buildSectionFromLines(
  lines: FlatLine[],
  title: string,
  fallbackPage: number,
): DetectedSection | null {
  const bodyBlocks: string[] = [];
  const bodyPages: number[] = [];
  let currentBuf: string[] = [];
  let currentPage = lines[0]?.page ?? fallbackPage;
  for (const l of lines) {
    if (l.blank) {
      if (currentBuf.length > 0) {
        bodyBlocks.push(currentBuf.join(" ").trim());
        bodyPages.push(currentPage);
        currentBuf = [];
      }
      continue;
    }
    if (l.page !== currentPage && currentBuf.length === 0) {
      currentPage = l.page;
    }
    currentBuf.push(l.text);
  }
  if (currentBuf.length > 0) {
    bodyBlocks.push(currentBuf.join(" ").trim());
    bodyPages.push(currentPage);
  }

  if (!bodyBlocks.some((b) => b.length > 0)) return null;

  const pageMin = Math.min(fallbackPage, ...bodyPages);
  const pageMax = Math.max(fallbackPage, ...bodyPages);

  return {
    title,
    pageStart: pageMin,
    pageEnd: pageMax,
    body: bodyBlocks.join("\n\n"),
    bodyBlocks,
    bodyPages,
  };
}

/**
 * Decide whether a line is heading-shaped GIVEN its context (previous and next
 * lines). Strong patterns (question / numbered / all-caps) are accepted even
 * when not strictly blank-surrounded — extraction frequently strips paragraph
 * breaks around headings. Title-case headings remain context-gated to avoid
 * misclassifying proper-noun runs as section boundaries.
 */
function detectHeadingHit(
  cur: FlatLine,
  prev: FlatLine | undefined,
  next: FlatLine | undefined,
): boolean {
  if (cur.blank) return false;
  const t = cur.text.trim();
  if (t.length < HEADING_MIN_LEN || t.length > HEADING_MAX_LEN) return false;

  const followedByBlank = !next || next.blank;
  const precededByBlank = !prev || prev.blank;
  const nextLooksLikeProseStart =
    !!next && !next.blank && next.text.length > 25 && /^[A-Z]/.test(next.text);

  // Strong patterns: accept with EITHER side blank — survives stripped breaks.
  if (looksKnownSectionHeading(t)) {
    return followedByBlank || precededByBlank || nextLooksLikeProseStart;
  }
  if (looksQuestionHeading(t)) {
    return followedByBlank || precededByBlank || nextLooksLikeProseStart;
  }
  if (matchNumberedHeading(t)) {
    return followedByBlank || precededByBlank || nextLooksLikeProseStart;
  }
  if (looksAllCaps(t)) {
    return followedByBlank || precededByBlank || nextLooksLikeProseStart;
  }
  // Title case: require either blank-surrounded OR followed-by-prose-start.
  if (!looksTitleCase(t)) return false;
  if (/[.!?:;,]$/.test(t)) return false;
  if (followedByBlank && precededByBlank) return true;
  if (precededByBlank && nextLooksLikeProseStart) return true;
  return false;
}

/**
 * Single pass through page text. We treat each line followed by a blank line
 * (or by clear prose-start context) as a potential heading anchor. Heuristics
 * inside `detectHeadingHit` decide which ones survive.
 *
 * Critically: any content BEFORE the first detected heading is preserved as
 * a leading "Opening" section so we never drop pages 1-2 just because the
 * paper's first explicit heading lives on page 3.
 */
function detectSections(pages: RawPage[]): DetectedSection[] {
  // Flatten into a list of (page, line) entries, preserving paragraph breaks
  // by inserting empty lines. Uses bodyTextFor() so footnote/author-note
  // text never reaches the heading detector.
  const lines: FlatLine[] = [];
  for (const p of pages) {
    const split = bodyTextFor(p).split(/\n/);
    for (const raw of split) {
      const trimmed = raw.replace(/\s+$/, "");
      if (trimmed.length === 0) {
        lines.push({ page: p.page, text: "", blank: true });
      } else {
        lines.push({ page: p.page, text: trimmed, blank: false });
      }
    }
    // page boundary — insert blank line so headings near page edges are detected
    lines.push({ page: p.page, text: "", blank: true });
  }

  const headings: HeadingHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    if (cur.blank) continue;
    const next = lines[i + 1];
    const prev = lines[i - 1];
    if (!detectHeadingHit(cur, prev, next)) continue;
    headings.push({ page: cur.page, raw: cur.text, position: i });
  }

  sdbg(`detected ${headings.length} heading(s) across ${pages.length} pages`);

  if (headings.length === 0) {
    // single-section fallback — also uses bodyTextFor() so footnotes
    // don't leak into the body.
    const body = pages.map((p) => bodyTextFor(p)).join("\n\n");
    const bodyBlocks = pages.map((p) => bodyTextFor(p));
    const bodyPages = pages.map((p) => p.page);
    return [
      {
        title: "Document",
        pageStart: pages[0]?.page ?? 1,
        pageEnd: pages[pages.length - 1]?.page ?? pages[0]?.page ?? 1,
        body,
        bodyBlocks,
        bodyPages,
      },
    ];
  }

  const sections: DetectedSection[] = [];

  // PRESERVE PRE-FIRST-HEADING CONTENT.
  // If the first heading isn't at position 0, capture everything before it
  // as a leading "Opening" section. Otherwise pages 1-2 etc. would be lost.
  if (headings[0].position > 0) {
    const preLines = lines.slice(0, headings[0].position);
    const opening = buildSectionFromLines(
      preLines,
      "Opening",
      pages[0]?.page ?? 1,
    );
    if (opening) {
      sdbg(
        `prepending Opening section: pp. ${opening.pageStart}-${opening.pageEnd} (${opening.bodyBlocks.length} blocks)`,
      );
      sections.push(opening);
    }
  }

  // Heading-bounded sections.
  for (let h = 0; h < headings.length; h++) {
    const start = headings[h];
    const end = headings[h + 1];
    const startIdx = start.position + 1;
    const endIdx = end ? end.position : lines.length;
    const sectionLines = lines.slice(startIdx, endIdx);
    const section = buildSectionFromLines(
      sectionLines,
      start.raw.trim(),
      start.page,
    );
    if (section) sections.push(section);
  }

  // Drop sections that ended up empty.
  return sections.filter((s) => s.bodyBlocks.some((b) => b.length > 0));
}

function makeParagraphs(
  bodyBlocks: string[],
  bodyPages: number[],
  sectionKey: string,
  dropcapFirst: boolean,
): SerializedParagraph[] {
  const out: SerializedParagraph[] = [];
  for (let i = 0; i < bodyBlocks.length; i++) {
    const block = bodyBlocks[i];
    const page = bodyPages[i];
    const chunks = paragraphize(block);
    chunks.forEach((text, j) => {
      out.push({
        id: `p-${sectionKey}-${i}-${j}`,
        page,
        dropcap: dropcapFirst && i === 0 && j === 0,
        inline: [{ type: "text", text }],
      });
    });
  }
  if (out.length === 0) {
    out.push({
      id: `p-${sectionKey}-0`,
      inline: [{ type: "text", text: "" }],
    });
  }
  return out;
}

/**
 * Detect "Table N" / "Table N.N" anchor paragraphs and convert them into a
 * dedicated table block. The renderer then shows a card with the caption +
 * "View original scan" instead of pretending the scrambled cell text is
 * normal prose.
 *
 * Conservative — only converts the anchor paragraph (the one that starts
 * with "Table N"). Scrambled cell paragraphs that follow stay as body for
 * now; the user can Hide them, and a future layout-aware extractor will
 * carve them into proper rows.
 *
 * Original text is preserved in `rawText` so nothing is lost — the
 * `inline` field is replaced with just the caption so AI fallbacks (which
 * use bodyTextFor → inline join) don't get scrambled column headers.
 */
const TABLE_ANCHOR_RE = /^Table\s+(\d+(?:\.\d+)?)\s*[.:]?\s*(.*)$/i;

function paragraphPlainTextLocal(p: SerializedParagraph): string {
  return p.inline.map((i) => ("text" in i ? i.text : i.term)).join("");
}

export function convertTableParagraphs(
  paragraphs: SerializedParagraph[],
): SerializedParagraph[] {
  return paragraphs.map((p) => {
    if (p.blockType === "table") return p; // already converted
    const text = paragraphPlainTextLocal(p);
    const m = text.match(TABLE_ANCHOR_RE);
    if (!m) return p;
    const tableNum = m[1];
    const rest = (m[2] ?? "").trim();
    // Caption = up to the first sentence-end followed by capital, capped at 200 chars.
    let captionContent = rest;
    const sentenceEnd = rest.search(/\.\s+[A-Z]/);
    if (sentenceEnd > 0) {
      captionContent = rest.slice(0, sentenceEnd + 1).trim();
    } else if (rest.length > 200) {
      captionContent = rest.slice(0, 200).trim() + "…";
    }
    const caption = captionContent
      ? `Table ${tableNum}. ${captionContent}`
      : `Table ${tableNum}`;
    return {
      ...p,
      blockType: "table" as const,
      caption,
      rawText: text,
      confidence: "detected_caption_only" as const,
      htmlTable: null,
      originalScanAvailable: true,
      // Replace inline with just the caption so any consumer that reads
      // inline text (AI fallback, search index, etc.) gets the caption,
      // not the scrambled cells.
      inline: [{ type: "text", text: caption }],
    };
  });
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export interface HeuristicStructureOutcome {
  sections: StructuredSectionInput[];
  /** True when the heuristic found real headings; false when it fell back. */
  headingsDetected: boolean;
}

/**
 * Produce structured sections from raw extracted pages. No LLM involved.
 *
 * When the heuristic cannot identify real headings, falls back to
 * page-based sections (one section per PDF page) — `headingsDetected: false`
 * signals to the UI that it should surface "No strong headings detected,
 * using page-based sections." rather than pretending the document is one
 * monolithic "Document" section.
 */
export function buildHeuristicSections(
  pages: RawPage[],
): HeuristicStructureOutcome {
  const detected = detectSections(pages);
  const headingsDetected = detected.length > 0 && detected[0].title !== "Document";

  if (!headingsDetected) {
    sdbg(
      `no headings detected — falling back to ${pages.length} page-based sections`,
    );
    return {
      sections: buildPageSections(pages),
      headingsDetected: false,
    };
  }

  // SANITY CHECK: a heading was detected, but the structurer collapsed the
  // whole document (or nearly all of it) into a single section. For long
  // PDFs (>8 pages) one giant section is unreadable — fall back to
  // page-based sections so the reader at least has navigable units. The
  // user can re-run Restructure with AI to recover a semantic plan.
  if (detected.length === 1 && pages.length > 8) {
    sdbg(
      `sanity fallback: 1 heading covers ${pages.length} pages — using page-based sections instead`,
    );
    return {
      sections: buildPageSections(pages),
      headingsDetected: false,
    };
  }

  const sections = detected.map((s, i) => {
    const slug = slugify(s.title) || `section-${i + 1}`;
    const sectionKey = `sec-${i + 1}-${slug}`;
    return {
      section_index: i,
      section_key: sectionKey,
      title: s.title,
      page_start: s.pageStart,
      page_end: s.pageEnd !== s.pageStart ? s.pageEnd : null,
      summary: null,
      body: {
        paragraphs: convertTableParagraphs(
          makeParagraphs(s.bodyBlocks, s.bodyPages, sectionKey, i === 0),
        ),
      },
      key_terms: [],
    };
  });

  if (STRUCT_DEBUG) {
    const totalPages = pages.length;
    const coveredPages = new Set<number>();
    sections.forEach((s, i) => {
      const start = s.page_start;
      const end = s.page_end ?? start;
      sdbg(
        `section ${i}: "${s.title}" pp. ${start}${end !== start ? `-${end}` : ""} (${s.body.paragraphs.length} paragraphs)`,
      );
      for (let p = start; p <= end; p++) coveredPages.add(p);
    });
    const orphans: number[] = [];
    for (let p = 1; p <= totalPages; p++) {
      if (!coveredPages.has(p)) orphans.push(p);
    }
    sdbg(
      `summary: ${totalPages} raw pages → ${sections.length} sections; orphans=${orphans.length === 0 ? "none" : orphans.join(",")}`,
    );
  }

  return {
    sections: attachFootnotesToSections(sections, pages),
    headingsDetected: true,
  };
}

/**
 * Page-per-section pipeline (existing extraction_only behavior, preserved for
 * documents that want to opt out of the structuring layer). Footnotes for each
 * page attach to that page's section.
 */
export function buildPageSections(pages: RawPage[]): StructuredSectionInput[] {
  const sections = pages.map((p, i) => {
    const sectionKey = `page-${p.page}`;
    const paragraphs = paragraphize(bodyTextFor(p)).map((text, j) => ({
      id: `p-${sectionKey}-${j}`,
      page: p.page,
      dropcap: i === 0 && j === 0,
      inline: [{ type: "text", text }] as SerializedParagraph["inline"],
    }));
    return {
      section_index: i,
      section_key: sectionKey,
      title: `Page ${p.page}`,
      page_start: p.page,
      page_end: null,
      summary: null,
      body: {
        paragraphs: convertTableParagraphs(
          paragraphs.length > 0
            ? paragraphs
            : [
                {
                  id: `p-${sectionKey}-0`,
                  page: p.page,
                  inline: [{ type: "text", text: "" }],
                },
              ],
        ),
      } as StructuredSectionInput["body"],
      key_terms: [],
    };
  });
  return attachFootnotesToSections(sections, pages);
}
