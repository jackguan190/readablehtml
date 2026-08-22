/**
 * Representative fixtures for the canonical Document Contract v1.
 *
 * Test data only — invented academic-style content that exercises every
 * block kind and relationship the contract supports. Tests clone and mutate
 * these; do not mutate them in place.
 */
import type { DocumentV1 } from "./document";

/** Smallest useful valid document: one paragraph, no relations. */
export const minimalDocumentFixture: DocumentV1 = {
  schemaVersion: 1,
  documentId: "doc-minimal",
  source: { mediaType: "application/pdf" },
  extraction: { method: "embedded_text" },
  blocks: [
    {
      id: "blk-p1",
      kind: "paragraph",
      readingOrder: 0,
      anchor: { page: 1 },
      confidence: "high",
      sourceText: "A single paragraph of exact source prose.",
    },
  ],
};

/**
 * Exact source prose for the intro paragraph. Marker offsets below are
 * zero-based, end-exclusive UTF-16 code-unit indices into this string:
 * citation "(Elton 1967, 24)" at [58, 74), footnote marker "1" at [75, 76).
 */
const INTRO_TEXT =
  "Historians do not merely collect sources; they weigh them (Elton 1967, 24).1 The weighing itself has a method, though it is rarely stated outright.";

/**
 * Covers: heading hierarchy, prose with offset-anchored citation and
 * footnote markers, footnote body, figure + caption blocks related through
 * `captionFor`, extracted table with header/units/notes, formula,
 * low-confidence table preserved via source-region fallback, reference-list
 * entry, page artifacts, bounding-box anchors, and independent source
 * format / extraction method fields.
 */
export const representativeDocumentFixture: DocumentV1 = {
  schemaVersion: 1,
  documentId: "doc-fixture-evidence-paper",
  title: "Weighing Evidence: Method in Historical Argument",
  source: {
    mediaType: "application/pdf",
    storagePath: "fixtures/evidence-paper.pdf",
    pageCount: 3,
  },
  extraction: { method: "embedded_text" },
  blocks: [
    {
      id: "blk-artifact-header-1",
      kind: "page_artifact",
      artifactKind: "running_header",
      readingOrder: 0,
      anchor: { page: 1, bbox: { x: 0.1, y: 0.02, width: 0.8, height: 0.03 } },
      confidence: "high",
      sourceText: "Journal of Historical Method 14 (2024)",
    },
    {
      id: "blk-h1",
      kind: "heading",
      level: 1,
      readingOrder: 1,
      anchor: { page: 1 },
      confidence: "high",
      sourceText: "Weighing Evidence: Method in Historical Argument",
    },
    {
      id: "blk-p-intro",
      kind: "paragraph",
      readingOrder: 2,
      anchor: { page: 1 },
      confidence: "high",
      sourceText: INTRO_TEXT,
      citations: [
        {
          markerText: "(Elton 1967, 24)",
          start: 58,
          end: 74,
          referenceEntryId: "blk-ref-elton",
        },
      ],
      footnoteRefs: [
        { markerText: "1", start: 75, end: 76, footnoteId: "blk-fn-1" },
      ],
    },
    {
      id: "blk-h2-tables",
      kind: "heading",
      level: 2,
      readingOrder: 3,
      anchor: { page: 2 },
      confidence: "high",
      sourceText: "Counting What Survives",
    },
    {
      id: "blk-p-tables",
      kind: "paragraph",
      readingOrder: 4,
      anchor: { page: 2 },
      confidence: "high",
      sourceText:
        "Survival rates of archival series vary sharply by period, as Table 1 shows.",
    },
    {
      id: "blk-table-1",
      kind: "table",
      readingOrder: 5,
      anchor: { page: 2, bbox: { x: 0.12, y: 0.3, width: 0.76, height: 0.22 } },
      confidence: "high",
      sourceText:
        "Century Series Survival Rate 16th 412 31 17th 897 44 18th 1204 58",
      reconstruction: {
        provenance: "extracted",
        header: ["Century", "Series", "Survival Rate"],
        rows: [
          ["16th", "412", "31"],
          ["17th", "897", "44"],
          ["18th", "1204", "58"],
        ],
        units: "Survival Rate in percent",
        notes: ["Counts exclude ecclesiastical series recatalogued after 1900."],
      },
    },
    {
      id: "blk-caption-table-1",
      kind: "caption",
      readingOrder: 6,
      anchor: { page: 2 },
      confidence: "high",
      sourceText: "Table 1. Surviving archival series by century",
      captionFor: "blk-table-1",
    },
    {
      id: "blk-figure-1",
      kind: "figure",
      readingOrder: 7,
      anchor: { page: 2, bbox: { x: 0.15, y: 0.58, width: 0.7, height: 0.25 } },
      confidence: "high",
    },
    {
      id: "blk-caption-figure-1",
      kind: "caption",
      readingOrder: 8,
      anchor: { page: 2 },
      confidence: "high",
      sourceText: "Figure 1. Survival rate of archival series, 1500–1800.",
      captionFor: "blk-figure-1",
    },
    {
      id: "blk-formula-1",
      kind: "formula",
      readingOrder: 9,
      anchor: { page: 3, bbox: { x: 0.3, y: 0.2, width: 0.4, height: 0.06 } },
      confidence: "medium",
      sourceText: "S(t) = S0 * e^(-lambda * t)",
    },
    {
      id: "blk-table-2-fallback",
      kind: "table",
      readingOrder: 10,
      anchor: { page: 3, bbox: { x: 0.1, y: 0.35, width: 0.8, height: 0.3 } },
      confidence: "low",
      sourceText: "",
      fallback: {
        reason: "reconstruction_unreliable",
        representation: {
          kind: "source_region",
          anchor: {
            page: 3,
            bbox: { x: 0.1, y: 0.35, width: 0.8, height: 0.3 },
          },
        },
      },
    },
    {
      id: "blk-caption-table-2",
      kind: "caption",
      readingOrder: 11,
      anchor: { page: 3 },
      confidence: "high",
      sourceText: "Table 2. Reconstructed shipping manifests (partial)",
      captionFor: "blk-table-2-fallback",
    },
    {
      id: "blk-fn-1",
      kind: "footnote",
      markerText: "1",
      readingOrder: 12,
      anchor: { page: 1 },
      confidence: "high",
      sourceText:
        "The phrase is Elton's, though the sentiment is considerably older.",
    },
    {
      id: "blk-ref-elton",
      kind: "reference_entry",
      readingOrder: 13,
      anchor: { page: 3 },
      confidence: "high",
      sourceText:
        "Elton, G. R. 1967. The Practice of History. Sydney: Sydney University Press.",
    },
    {
      id: "blk-artifact-pagenum-3",
      kind: "page_artifact",
      artifactKind: "page_number",
      readingOrder: 14,
      anchor: { page: 3, bbox: { x: 0.47, y: 0.95, width: 0.06, height: 0.03 } },
      confidence: "high",
      sourceText: "3",
    },
  ],
};
