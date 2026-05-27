import "server-only";

import type { SerializedParagraph } from "./types";
import type { StructuredSectionInput } from "./structuring";
import type { ChandraBlock, ChandraResult } from "./chandra-provider";

/**
 * Convert a `ChandraResult` (the layout-aware extractor's output) into the
 * `StructuredSectionInput[]` shape that the rest of the reading pipeline
 * expects. Each Chandra `heading` block of level ≤ 2 becomes a section
 * boundary; lower-level headings remain in-body as `blockType: "heading"`
 * paragraphs; `paragraph` / `table` / `figure` / `footnote` / `metadata`
 * blocks map onto matching `SerializedParagraph` block types.
 *
 * Document-level orphan handling: if the very first block isn't a heading,
 * we open an implicit "Opening" section to capture preamble text — the
 * structurer's same don't-drop-content rule applies here.
 *
 * Reconstructed table HTML (when Chandra provides it) flows into
 * `paragraph.htmlTable`, and `confidence` flips from
 * `"detected_caption_only"` to `"extracted_rows"` so the renderer can show
 * the real table instead of a placeholder card.
 */

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function blockToParagraph(
  block: ChandraBlock,
  sectionKey: string,
  index: number,
  dropcap: boolean,
): SerializedParagraph | null {
  const id = `p-${sectionKey}-${block.page}-${index}`;
  switch (block.blockType) {
    case "paragraph": {
      const text = block.text?.trim();
      if (!text) return null;
      return {
        id,
        page: block.page,
        dropcap,
        inline: [{ type: "text", text }],
        blockType: "body",
      };
    }
    case "heading": {
      const text = block.text?.trim();
      if (!text) return null;
      return {
        id,
        page: block.page,
        inline: [{ type: "text", text }],
        blockType: "heading",
      };
    }
    case "footnote": {
      const text = block.text?.trim();
      if (!text) return null;
      return {
        id,
        page: block.page,
        inline: [{ type: "text", text }],
        blockType: "metadata",
        // Footnotes hide in the reading flow; they're preserved in JSON
        // so a future "footnotes panel per section" can surface them.
        hidden: true,
      };
    }
    case "metadata": {
      const text = block.text?.trim();
      if (!text) return null;
      return {
        id,
        page: block.page,
        inline: [{ type: "text", text }],
        blockType: "metadata",
        hidden: true,
      };
    }
    case "table": {
      const caption = (block.caption ?? "").trim() || `Table on page ${block.page}`;
      const htmlTable = block.htmlTable?.trim() || null;
      return {
        id,
        page: block.page,
        inline: [{ type: "text", text: caption }],
        blockType: "table",
        caption,
        htmlTable,
        confidence: htmlTable ? "extracted_rows" : "detected_caption_only",
        originalScanAvailable: true,
        rawText: block.text ?? block.markdownTable ?? caption,
      };
    }
    case "figure": {
      const caption =
        (block.caption ?? "").trim() ||
        (block.figureDescription ?? "").trim() ||
        `Figure on page ${block.page}`;
      return {
        id,
        page: block.page,
        inline: [{ type: "text", text: caption }],
        blockType: "figure",
        caption,
        originalScanAvailable: true,
      };
    }
    default:
      return null;
  }
}

interface Accumulator {
  title: string;
  pageStart: number;
  pageEnd: number;
  paragraphs: SerializedParagraph[];
}

function pushParagraphTo(
  acc: Accumulator,
  block: ChandraBlock,
  sectionIndex: number,
): void {
  const sectionKey = slugify(acc.title) || `section-${sectionIndex + 1}`;
  const dropcap = sectionIndex === 0 && acc.paragraphs.length === 0;
  const paragraph = blockToParagraph(
    block,
    sectionKey,
    acc.paragraphs.length,
    dropcap,
  );
  if (paragraph) {
    acc.paragraphs.push(paragraph);
    acc.pageEnd = Math.max(acc.pageEnd, block.page);
  }
}

/**
 * Convert Chandra's per-page blocks into structured sections. Top-level
 * headings (level 1 or 2) start new sections; everything else accumulates.
 */
export function chandraToSections(
  result: ChandraResult,
): StructuredSectionInput[] {
  const accs: Accumulator[] = [];
  let current: Accumulator | null = null;

  for (const page of result.pages) {
    for (const block of page.blocks) {
      const isSectionHeading =
        block.blockType === "heading" &&
        (block.level ?? 1) <= 2 &&
        !!block.text?.trim();

      if (isSectionHeading) {
        const title = block.text!.trim();
        current = {
          title,
          pageStart: page.page,
          pageEnd: page.page,
          paragraphs: [],
        };
        accs.push(current);
        continue;
      }

      if (!current) {
        // Open an implicit "Opening" section for preamble content.
        current = {
          title: "Opening",
          pageStart: page.page,
          pageEnd: page.page,
          paragraphs: [],
        };
        accs.push(current);
      }
      pushParagraphTo(current, block, accs.length - 1);
    }
  }

  if (accs.length === 0) {
    // Defensive: Chandra returned no usable blocks. Emit a single empty
    // section so callers don't have to special-case zero output.
    return [
      {
        section_index: 0,
        section_key: "chandra-empty",
        title: "Document",
        page_start: 1,
        page_end: null,
        summary: null,
        body: {
          paragraphs: [
            {
              id: "p-chandra-empty-0",
              inline: [{ type: "text", text: "" }],
            },
          ],
        },
        key_terms: [],
      },
    ];
  }

  return accs.map((acc, i) => {
    const slug = slugify(acc.title) || `section-${i + 1}`;
    return {
      section_index: i,
      section_key: `chandra-${i + 1}-${slug}`,
      title: acc.title,
      page_start: acc.pageStart,
      page_end: acc.pageEnd !== acc.pageStart ? acc.pageEnd : null,
      summary: null,
      body: {
        paragraphs:
          acc.paragraphs.length > 0
            ? acc.paragraphs
            : [
                {
                  id: `p-chandra-${i + 1}-empty`,
                  inline: [{ type: "text", text: "" }],
                },
              ],
      },
      key_terms: [],
    };
  });
}
