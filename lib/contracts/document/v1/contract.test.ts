import { describe, expect, it } from "vitest";
import { parseDocumentV1 } from "./index";
import {
  minimalDocumentFixture,
  representativeDocumentFixture,
} from "./fixtures";

/** Deep-clone the representative fixture as a mutable untyped object. */
function cloneRepresentative(): any {
  return structuredClone(representativeDocumentFixture);
}

/** Expect a structural (post-version) rejection whose message names the cause. */
function expectInvalid(doc: unknown, messagePart: string): void {
  const result = parseDocumentV1(doc);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.code).toBe("invalid_document");
  expect(result.message).toContain(messagePart);
}

/** Block indices in the representative fixture, by id. */
const IDX = {
  headerArtifact: 0,
  h1: 1,
  paragraphIntro: 2,
  table1: 5,
  captionTable1: 6,
  figure1: 7,
  captionFigure1: 8,
  tableFallback: 10,
} as const;

describe("documentV1 contract — accepts valid documents", () => {
  it("accepts the minimal fixture and returns the parsed document", () => {
    const result = parseDocumentV1(structuredClone(minimalDocumentFixture));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toEqual(minimalDocumentFixture);
  });

  it("accepts the representative fixture covering every block kind", () => {
    const result = parseDocumentV1(
      structuredClone(representativeDocumentFixture),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const kinds = new Set(result.document.blocks.map((b) => b.kind));
    expect(kinds).toEqual(
      new Set([
        "heading",
        "paragraph",
        "footnote",
        "reference_entry",
        "table",
        "figure",
        "formula",
        "caption",
        "page_artifact",
      ]),
    );
  });

  it("survives a JSON round trip (worker boundary shape)", () => {
    const wire = JSON.parse(JSON.stringify(representativeDocumentFixture));
    expect(parseDocumentV1(wire).ok).toBe(true);
  });
});

describe("documentV1 contract — identity and ordering invariants", () => {
  it("rejects duplicate block ids", () => {
    const doc = cloneRepresentative();
    doc.blocks[1].id = doc.blocks[0].id;
    expectInvalid(doc, "duplicate block id");
  });

  it("rejects blocks not sorted by strictly increasing readingOrder", () => {
    const doc = cloneRepresentative();
    doc.blocks[2].readingOrder = 0;
    expectInvalid(doc, "strictly increasing readingOrder");
  });

  it("rejects duplicate readingOrder values", () => {
    const doc = cloneRepresentative();
    doc.blocks[1].readingOrder = doc.blocks[0].readingOrder;
    expectInvalid(doc, "strictly increasing readingOrder");
  });

  it("rejects zero-based page numbers (pages are one-based)", () => {
    const doc = cloneRepresentative();
    doc.blocks[0].anchor.page = 0;
    expectInvalid(doc, ">=1");
  });

  it("rejects an empty canonical document (no blocks)", () => {
    const doc = cloneRepresentative();
    doc.blocks = [];
    expectInvalid(doc, "at least one block");
  });
});

describe("documentV1 contract — source format vs extraction method", () => {
  it("keeps file format and extraction method independent", () => {
    for (const method of ["embedded_text", "ocr", "vision", "hybrid"]) {
      const doc = cloneRepresentative();
      doc.extraction.method = method;
      const result = parseDocumentV1(doc);
      expect(result.ok, `method ${method} should parse`).toBe(true);
      if (!result.ok) continue;
      expect(result.document.source.mediaType).toBe("application/pdf");
    }
  });

  it("rejects the retired conflated source.kind field", () => {
    const doc = cloneRepresentative();
    delete doc.source.mediaType;
    doc.source.kind = "born_digital_pdf";
    expectInvalid(doc, "kind");
  });

  it("rejects an unknown extraction method", () => {
    const doc = cloneRepresentative();
    doc.extraction.method = "guesswork";
    expectInvalid(doc, "method");
  });
});

describe("documentV1 contract — relationship invariants", () => {
  it("rejects a citation pointing at a missing reference entry", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.paragraphIntro].citations[0].referenceEntryId =
      "blk-does-not-exist";
    expectInvalid(doc, "does not exist");
  });

  it("rejects a citation pointing at a non reference_entry block", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.paragraphIntro].citations[0].referenceEntryId = "blk-fn-1";
    expectInvalid(doc, "must be a reference_entry block");
  });

  it("rejects a footnote reference pointing at a non footnote block", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.paragraphIntro].footnoteRefs[0].footnoteId = "blk-ref-elton";
    expectInvalid(doc, "must be a footnote block");
  });

  it("rejects a caption whose target is not a table, figure, or formula", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.captionFigure1].captionFor = "blk-p-intro";
    expectInvalid(doc, "must be a table | figure | formula block");
  });
});

describe("documentV1 contract — marker offsets in paragraph text", () => {
  it("rejects citation offsets out of range of sourceText", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.paragraphIntro].citations[0].start = 9000;
    doc.blocks[IDX.paragraphIntro].citations[0].end = 9016;
    expectInvalid(doc, "out of range");
  });

  it("rejects a citation whose offsets select different text than markerText", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.paragraphIntro].citations[0].start = 0;
    doc.blocks[IDX.paragraphIntro].citations[0].end = 16;
    expectInvalid(doc, "does not match");
  });

  it("rejects a footnote marker whose offsets select different text", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.paragraphIntro].footnoteRefs[0].start = 0;
    doc.blocks[IDX.paragraphIntro].footnoteRefs[0].end = 1;
    expectInvalid(doc, "does not match");
  });

  it("rejects end-inclusive style offsets (end must exceed start)", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.paragraphIntro].footnoteRefs[0].end =
      doc.blocks[IDX.paragraphIntro].footnoteRefs[0].start;
    expectInvalid(doc, "greater than start");
  });
});

describe("documentV1 contract — anchors, bounds, and page counts", () => {
  it("rejects a bounding box extending past the page edge", () => {
    const doc = cloneRepresentative();
    doc.blocks[0].anchor.bbox = { x: 0.9, y: 0.1, width: 0.3, height: 0.1 };
    expectInvalid(doc, "x + width");
  });

  it("rejects a source_region fallback without a bounding box", () => {
    const doc = cloneRepresentative();
    delete doc.blocks[IDX.tableFallback].fallback.representation.anchor.bbox;
    expectInvalid(doc, "requires an anchor with a bounding box");
  });

  it("rejects a block anchored past the declared pageCount", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.h1].anchor.page = 4;
    expectInvalid(doc, "declared source pageCount");
  });

  it("rejects a source_region fallback anchored past the declared pageCount", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.tableFallback].fallback.representation.anchor.page = 7;
    expectInvalid(doc, "declared source pageCount");
  });
});

describe("documentV1 contract — source fidelity", () => {
  it("rejects a figure with no bounding box and no fallback", () => {
    const doc = cloneRepresentative();
    delete doc.blocks[IDX.figure1].anchor.bbox;
    expectInvalid(doc, "croppable");
  });

  it("rejects a figure whose only fallback is raw_text (not croppable)", () => {
    const doc = cloneRepresentative();
    delete doc.blocks[IDX.figure1].anchor.bbox;
    doc.blocks[IDX.figure1].fallback = {
      reason: "extraction_failed",
      representation: { kind: "raw_text", text: "[figure]" },
    };
    expectInvalid(doc, "croppable");
  });

  it("accepts a figure without bbox when a source_region fallback exists", () => {
    const doc = cloneRepresentative();
    delete doc.blocks[IDX.figure1].anchor.bbox;
    doc.blocks[IDX.figure1].fallback = {
      reason: "extraction_failed",
      representation: {
        kind: "source_region",
        anchor: { page: 2, bbox: { x: 0.15, y: 0.58, width: 0.7, height: 0.25 } },
      },
    };
    expect(parseDocumentV1(doc).ok).toBe(true);
  });

  it("rejects an inline caption string on a table (captions must be anchored blocks)", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.table1].caption = "Table 1. Unanchored caption";
    expectInvalid(doc, "caption");
  });

  it("rejects an inline caption string on a figure", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.figure1].caption = "Figure 1. Unanchored caption";
    expectInvalid(doc, "caption");
  });

  it("rejects free-form altText on a figure (removed from the source layer)", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.figure1].altText = "AI-written description";
    expectInvalid(doc, "altText");
  });

  it("rejects a table with neither exact sourceText nor a fallback", () => {
    const doc = cloneRepresentative();
    delete doc.blocks[IDX.tableFallback].fallback;
    expectInvalid(doc, "never silently substitute");
  });

  it("rejects an ai_reconstructed table that drops its source text", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.table1].reconstruction.provenance = "ai_reconstructed";
    doc.blocks[IDX.table1].sourceText = "";
    expectInvalid(doc, "never silently substitute");
  });

  it("rejects non-rectangular table rows", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.table1].reconstruction.rows[1] = ["17th", "897"];
    expectInvalid(doc, "rectangular");
  });

  it("rejects a paragraph with empty source text", () => {
    const doc = cloneRepresentative();
    doc.blocks[IDX.paragraphIntro].sourceText = "";
    expectInvalid(doc, "sourceText");
  });

  it("rejects unknown extra properties (strict envelope)", () => {
    const doc = cloneRepresentative();
    doc.generatedSummary =
      "An AI summary that does not belong in the source layer.";
    expectInvalid(doc, "generatedSummary");
  });
});
