import type { SerializedParagraph } from "./types";

/** Minimum non-whitespace chars on a page to consider it "has real text." */
const MIN_CHARS_PER_PAGE = 50;

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
  sections: ExtractedSectionInput[];
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
      pageCount: 0,
      totalChars: 0,
      error:
        err instanceof Error
          ? err.message
          : "PDF parsing failed for an unknown reason.",
    };
  }

  const pagesWithText = perPageText.filter(
    (t) => nonWhitespaceLength(t) >= MIN_CHARS_PER_PAGE,
  ).length;
  const totalChars = perPageText.reduce(
    (sum, t) => sum + nonWhitespaceLength(t),
    0,
  );

  // If fewer than half the pages have meaningful text, assume scanned/image PDF.
  const requiredGoodPages = Math.max(1, Math.ceil(totalPages / 2));
  if (totalPages === 0 || pagesWithText < requiredGoodPages) {
    return {
      kind: "needs_ocr",
      sections: [],
      pageCount: totalPages,
      totalChars,
      warning:
        "This PDF appears to be scanned (image-only). OCR is not implemented yet.",
    };
  }

  const sections: ExtractedSectionInput[] = perPageText.map((text, i) => {
    const pageNumber = i + 1;
    return {
      section_index: i,
      section_key: `page-${pageNumber}`,
      title: `Page ${pageNumber}`,
      page_start: pageNumber,
      summary: null,
      body: { paragraphs: splitParagraphs(text ?? "", pageNumber) },
      key_terms: [],
    };
  });

  return {
    kind: "ready",
    sections,
    pageCount: totalPages,
    totalChars,
  };
}
