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

function lineLooksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < HEADING_MIN_LEN || t.length > HEADING_MAX_LEN) return false;
  if (/[.!?:;,]$/.test(t)) {
    // numbered headings sometimes end with ":" or "." after the number — allow only if numbered
    if (!matchNumberedHeading(t)) return false;
  }
  if (matchNumberedHeading(t)) return true;
  if (looksAllCaps(t)) return true;
  if (looksTitleCase(t)) return true;
  return false;
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

/**
 * Single pass through page text. We treat each line followed by a blank line
 * as a potential heading anchor. Heuristics inside `lineLooksLikeHeading`
 * decide whether the line is actually a heading.
 */
function detectSections(pages: RawPage[]): DetectedSection[] {
  // Flatten into a list of (page, line) entries, preserving paragraph breaks
  // by inserting empty lines. Uses bodyTextFor() so footnote/author-note
  // text never reaches the heading detector.
  type Line = { page: number; text: string; blank: boolean };
  const lines: Line[] = [];
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

  // Identify headings: a non-blank line followed (within 2 lines) by a blank
  // and then text — or surrounded by blank-ish whitespace.
  const headings: HeadingHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    if (cur.blank) continue;
    const next = lines[i + 1];
    const prev = lines[i - 1];
    const looksFollowedByBlank = !next || next.blank;
    const looksPrecededByBlank = !prev || prev.blank;
    if (!(looksFollowedByBlank && looksPrecededByBlank)) continue;
    if (!lineLooksLikeHeading(cur.text)) continue;
    headings.push({ page: cur.page, raw: cur.text, position: i });
  }

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

  // Build sections from heading boundaries.
  const sections: DetectedSection[] = [];
  for (let h = 0; h < headings.length; h++) {
    const start = headings[h];
    const end = headings[h + 1];
    const startIdx = start.position + 1;
    const endIdx = end ? end.position : lines.length;
    const sectionLines = lines.slice(startIdx, endIdx);

    // Concatenate body text, page-grouped so paragraphs know their source.
    const bodyBlocks: string[] = [];
    const bodyPages: number[] = [];
    let currentBuf: string[] = [];
    let currentPage = sectionLines[0]?.page ?? start.page;
    for (const l of sectionLines) {
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

    const pageMin = Math.min(start.page, ...bodyPages);
    const pageMax = Math.max(start.page, ...bodyPages);

    sections.push({
      title: start.raw.trim(),
      pageStart: pageMin,
      pageEnd: pageMax,
      body: bodyBlocks.join("\n\n"),
      bodyBlocks,
      bodyPages,
    });
  }

  // Drop sections with no body content
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
        paragraphs: makeParagraphs(
          s.bodyBlocks,
          s.bodyPages,
          sectionKey,
          i === 0,
        ),
      },
      key_terms: [],
    };
  });

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
        paragraphs:
          paragraphs.length > 0
            ? paragraphs
            : [
                {
                  id: `p-${sectionKey}-0`,
                  page: p.page,
                  inline: [{ type: "text", text: "" }],
                },
              ],
      } as StructuredSectionInput["body"],
      key_terms: [],
    };
  });
  return attachFootnotesToSections(sections, pages);
}
