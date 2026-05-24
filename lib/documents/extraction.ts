import type { SerializedParagraph } from "./types";
import type { RawPage } from "./structuring";
import { extractFootnotes } from "./footnotes";

/** Minimum non-whitespace chars on a page to consider it "has real text." */
const MIN_CHARS_PER_PAGE = 50;

/**
 * Normalize PDF-extracted text to repair common encoding artifacts.
 *
 * Runs per page, BEFORE paragraph splitting and BEFORE persistence. Two passes:
 *
 *   1. Unicode NFKC — folds compatibility forms (e.g. `ﬁ` U+FB01 → `"fi"`)
 *      and other presentation characters academic PDFs frequently emit.
 *
 *   2. Targeted repairs for broken glyphs that NFKC does NOT touch. Academic
 *      PDFs with bad font encoding sometimes substitute legitimate codepoints
 *      (`ª`, `º`, `°`) where the original glyph was a `fi`/`fl` ligature.
 *      We only rewrite these when they appear *between letters*, so legitimate
 *      uses ("30°C", "1º", "Mª") are preserved.
 *
 * Existing Supabase rows are not migrated by this function — only new uploads
 * benefit, since this runs inside the extraction pipeline. To fix an already
 * uploaded document, delete it and re-upload.
 *
 * Mappings applied:
 *
 * | Input          | Output | Trigger                                |
 * |----------------|--------|----------------------------------------|
 * | `ﬀ` U+FB00     | `ff`   | always                                 |
 * | `ﬁ` U+FB01     | `fi`   | always                                 |
 * | `ﬂ` U+FB02     | `fl`   | always                                 |
 * | `ﬃ` U+FB03     | `ffi`  | always                                 |
 * | `ﬄ` U+FB04     | `ffl`  | always                                 |
 * | `ª` U+00AA     | `fi`   | only between letters                   |
 * | `º` U+00BA     | `fl`   | only between letters                   |
 * | `°` U+00B0     | `fl`   | only between letters                   |
 *
 * @example
 *   normalizePdfText("in°uence")    // "influence"
 *   normalizePdfText("efªcacious")  // "efficacious"
 *   normalizePdfText("signiªcant")  // "significant"
 *   normalizePdfText("Conºict")     // "Conflict"
 *   normalizePdfText("ﬁreﬂy")       // "firefly"   (NFKC)
 *   normalizePdfText("30°C")        // "30°C"      (untouched — no letter before °)
 *   normalizePdfText("Mª Curie")    // "Mª Curie"  (untouched — no letter after ª)
 */
export function normalizePdfText(input: string): string {
  if (!input) return input;

  // 1. NFKC — handles standard presentation-form ligatures (FB00–FB06 etc.)
  //    and other compatibility decompositions in a single pass.
  let s = input.normalize("NFKC");

  // 2. Belt-and-suspenders: explicit ligature codepoint mappings in case the
  //    input arrives already partially decomposed, or NFKC misses anything
  //    (e.g. some PDF tools emit raw private-use glyphs that survive NFKC).
  s = s
    .replace(/ﬀ/g, "ff")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬃ/g, "ffi")
    .replace(/ﬄ/g, "ffl");

  // 3. Broken-glyph repair. Lookbehind/lookahead so we never consume the
  //    surrounding letters — that way consecutive cases (rare but possible)
  //    don't skip every other match.
  s = s
    .replace(/(?<=\p{L})ª(?=\p{L})/gu, "fi") // ª between letters → fi
    .replace(/(?<=\p{L})º(?=\p{L})/gu, "fl") // º between letters → fl
    .replace(/(?<=\p{L})°(?=\p{L})/gu, "fl"); // ° between letters → fl

  return s;
}

export interface ExtractedSectionInput {
  section_index: number;
  section_key: string;
  title: string;
  page_start: number;
  summary: string | null;
  body: { paragraphs: SerializedParagraph[] };
  key_terms: { term: string; def: string }[];
}

export interface ExtractionOutcome {
  kind: "ready" | "needs_ocr" | "failed";
  /** Per-page-section fallback shape (extraction_only mode). */
  sections: ExtractedSectionInput[];
  /**
   * Normalized per-page text. Downstream structuring layers (heuristic /
   * AI) consume this to build semantic sections.
   */
  rawPages: RawPage[];
  pageCount: number;
  totalChars: number;
  warning?: string;
  error?: string;
}

function nonWhitespaceLength(s: string): number {
  return s.replace(/\s+/g, "").length;
}

/**
 * Turn one page's raw extracted text into clean paragraphs.
 * - Normalize line endings, strip soft hyphens
 * - Join end-of-line hyphenated words (e.g. "publi-\ncation" → "publication")
 * - Treat 2+ newlines as hard paragraph breaks
 * - Within a paragraph, join soft-wrapped lines with a space
 * - Drop page-number-only lines and other junk
 */
function splitParagraphs(
  pageText: string,
  pageNumber: number,
): SerializedParagraph[] {
  let text = pageText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/­/g, ""); // soft hyphens
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/(\w)-\n(\w)/g, "$1$2"); // join hyphenated words across lines

  const rawBlocks = text.split(/\n{2,}/);

  const paragraphs: string[] = [];
  for (const block of rawBlocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    const joined = lines.join(" ").replace(/\s+/g, " ").trim();
    if (joined.length === 0) continue;

    // skip lonely page-number-only lines like "12" or "— 12 —"
    if (/^[—–\-\s]*\d{1,4}[—–\-\s]*$/.test(joined)) continue;

    paragraphs.push(joined);
  }

  if (paragraphs.length === 0) {
    return [
      {
        id: `p-${pageNumber}-0`,
        page: pageNumber,
        inline: [{ type: "text", text: "" }],
      },
    ];
  }

  return paragraphs.map((text, i) => ({
    id: `p-${pageNumber}-${i}`,
    page: pageNumber,
    dropcap: pageNumber === 1 && i === 0,
    inline: [{ type: "text", text }],
  }));
}

/**
 * Extract per-page text from a PDF buffer using unpdf. Returns a structured
 * outcome — caller decides whether to seed `document_pages` from these
 * sections, fall back to mock content (needs_ocr), or mark the document failed.
 */
export async function extractPdfPages(
  buffer: Uint8Array,
): Promise<ExtractionOutcome> {
  let totalPages = 0;
  let perPageText: string[] = [];

  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(buffer);
    totalPages = pdf.numPages;
    const result = await extractText(pdf, { mergePages: false });
    perPageText = Array.isArray(result.text) ? result.text : [result.text];
  } catch (err) {
    return {
      kind: "failed",
      sections: [],
      rawPages: [],
      pageCount: 0,
      totalChars: 0,
      error:
        err instanceof Error
          ? err.message
          : "PDF parsing failed for an unknown reason.",
    };
  }

  // Normalize per page BEFORE paragraph splitting and BEFORE the
  // scanned-vs-text decision — so ligature characters don't undercount.
  const normalizedPages = perPageText.map((t) => normalizePdfText(t ?? ""));

  const pagesWithText = normalizedPages.filter(
    (t) => nonWhitespaceLength(t) >= MIN_CHARS_PER_PAGE,
  ).length;
  const totalChars = normalizedPages.reduce(
    (sum, t) => sum + nonWhitespaceLength(t),
    0,
  );

  // If fewer than half the pages have meaningful text, assume scanned/image PDF.
  const requiredGoodPages = Math.max(1, Math.ceil(totalPages / 2));
  const rawPages: RawPage[] = normalizedPages.map((text, i) => {
    const page = i + 1;
    const fn = extractFootnotes(text, page);
    return {
      page,
      text,
      mainText: fn.mainText,
      footnotes: fn.footnotes.length > 0 ? fn.footnotes : undefined,
      authorNote: fn.authorNote,
      footnoteDetection: fn.detection,
    };
  });

  if (totalPages === 0 || pagesWithText < requiredGoodPages) {
    return {
      kind: "needs_ocr",
      sections: [],
      rawPages,
      pageCount: totalPages,
      totalChars,
      warning:
        "This PDF appears to be scanned (image-only). OCR is not implemented yet.",
    };
  }

  const sections: ExtractedSectionInput[] = normalizedPages.map((text, i) => {
    const pageNumber = i + 1;
    return {
      section_index: i,
      section_key: `page-${pageNumber}`,
      title: `Page ${pageNumber}`,
      page_start: pageNumber,
      summary: null,
      body: { paragraphs: splitParagraphs(text, pageNumber) },
      key_terms: [],
    };
  });

  return {
    kind: "ready",
    sections,
    rawPages,
    pageCount: totalPages,
    totalChars,
  };
}
