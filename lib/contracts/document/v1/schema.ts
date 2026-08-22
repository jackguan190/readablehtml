/**
 * Canonical Document Contract v1 — block-level schemas.
 *
 * Zod is the single runtime schema source; all public TypeScript types are
 * inferred from these schemas. This module must not import React, Next.js,
 * Supabase, the existing document pipeline, or UI types — it crosses
 * untrusted JSON and future worker boundaries.
 *
 * Coordinate convention: bounding boxes are normalized to the source page
 * with a TOP-LEFT origin. `x`, `y`, `width`, `height` are fractions of the
 * page in the range 0..1, and boxes may not extend past the page edges.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Source anchoring
// ---------------------------------------------------------------------------

export const boundingBoxSchema = z
  .strictObject({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  })
  .refine((b) => b.x + b.width <= 1, {
    message: "bounding box exceeds right page edge: x + width must be <= 1",
  })
  .refine((b) => b.y + b.height <= 1, {
    message: "bounding box exceeds bottom page edge: y + height must be <= 1",
  });

/** Where a block came from in the source PDF. Pages are one-based. */
export const sourceAnchorSchema = z.strictObject({
  page: z.number().int().min(1),
  bbox: boundingBoxSchema.optional(),
});

// ---------------------------------------------------------------------------
// Confidence and fallback
// ---------------------------------------------------------------------------

export const confidenceSchema = z.enum(["high", "medium", "low"]);

/**
 * Explicit fallback for content that could not be reconstructed reliably.
 * A `source_region` fallback points at a croppable page region and therefore
 * requires a bounding box; `raw_text` preserves the exact linearized text the
 * extractor saw. Fallbacks preserve source content — they never replace it
 * with generated explanation.
 */
export const fallbackSchema = z.strictObject({
  reason: z.enum([
    "layout_unreadable",
    "reconstruction_unreliable",
    "extraction_failed",
    "encoding_suspect",
  ]),
  representation: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("source_region"),
      anchor: sourceAnchorSchema.refine((a) => a.bbox !== undefined, {
        message: "source_region fallback requires an anchor with a bounding box",
      }),
    }),
    z.strictObject({
      kind: z.literal("raw_text"),
      text: z.string().min(1),
    }),
  ]),
});

// ---------------------------------------------------------------------------
// Inline relations
// ---------------------------------------------------------------------------

/**
 * Marker offsets are zero-based, end-exclusive UTF-16 code-unit indices into
 * the owning paragraph's `sourceText` (the same unit browser selection APIs
 * use). The paragraph validates that `sourceText.slice(start, end)` exactly
 * equals `markerText`, making the source relationship verifiable.
 */
const markerOffsets = {
  /** Exact marker text as it appears in the source prose. */
  markerText: z.string().min(1),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
} as const;

/** An in-text citation marker, e.g. "(Elton 1967, 24)" or "[12]". */
export const inlineCitationSchema = z
  .strictObject({
    ...markerOffsets,
    /** Optional link to a `reference_entry` block resolved for this marker. */
    referenceEntryId: z.string().min(1).optional(),
  })
  .refine((m) => m.end > m.start, {
    message: "marker end must be greater than start (end-exclusive offsets)",
  });

/** A footnote marker in prose linked to its `footnote` block body. */
export const footnoteReferenceSchema = z
  .strictObject({
    ...markerOffsets,
    footnoteId: z.string().min(1),
  })
  .refine((m) => m.end > m.start, {
    message: "marker end must be greater than start (end-exclusive offsets)",
  });

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/**
 * Fields shared by every block.
 *
 * `id` must be stable for the lifetime of the document version so that
 * annotations can anchor to it. ID generation is an extraction-time concern
 * and is NOT implemented in this contract; the contract only requires
 * non-empty uniqueness (validated at document level).
 *
 * `readingOrder` defines the deterministic reading sequence; the document
 * validator requires blocks to be sorted by strictly increasing values.
 */
const blockBase = {
  id: z.string().min(1),
  readingOrder: z.number().int().min(0),
  anchor: sourceAnchorSchema,
  confidence: confidenceSchema,
  fallback: fallbackSchema.optional(),
} as const;

export const headingBlockSchema = z.strictObject({
  ...blockBase,
  kind: z.literal("heading"),
  /** Exact source heading text. */
  sourceText: z.string().min(1),
  /** Hierarchy level, 1 (top) through 6. */
  level: z.number().int().min(1).max(6),
});

export const paragraphBlockSchema = z
  .strictObject({
    ...blockBase,
    kind: z.literal("paragraph"),
    /** Exact source prose. Never paraphrased or normalized away. */
    sourceText: z.string().min(1),
    citations: z.array(inlineCitationSchema).optional(),
    footnoteRefs: z.array(footnoteReferenceSchema).optional(),
  })
  .superRefine((p, ctx) => {
    const checkMarker = (
      marker: { markerText: string; start: number; end: number },
      path: (string | number)[],
    ): void => {
      if (marker.end > p.sourceText.length) {
        ctx.addIssue({
          code: "custom",
          message: "marker offsets are out of range of the paragraph sourceText",
          path,
        });
        return;
      }
      const selected = p.sourceText.slice(marker.start, marker.end);
      if (selected !== marker.markerText) {
        ctx.addIssue({
          code: "custom",
          message: `marker text ${JSON.stringify(
            marker.markerText,
          )} does not match sourceText at [start, end) (found ${JSON.stringify(
            selected,
          )})`,
          path,
        });
      }
    };
    p.citations?.forEach((c, j) => checkMarker(c, ["citations", j]));
    p.footnoteRefs?.forEach((r, j) => checkMarker(r, ["footnoteRefs", j]));
  });

export const footnoteBlockSchema = z.strictObject({
  ...blockBase,
  kind: z.literal("footnote"),
  /** The footnote's own marker, e.g. "12" or "*". */
  markerText: z.string().min(1),
  sourceText: z.string().min(1),
});

/** One entry in the reference list / bibliography, kept as exact text. */
export const referenceEntryBlockSchema = z.strictObject({
  ...blockBase,
  kind: z.literal("reference_entry"),
  sourceText: z.string().min(1),
});

export const tableReconstructionSchema = z
  .strictObject({
    /**
     * Where the rows came from. "ai_reconstructed" content is an assistance
     * layer — the block must still preserve source text or a fallback.
     */
    provenance: z.enum(["extracted", "ai_reconstructed"]),
    header: z.array(z.string()).optional(),
    /** Exact cell text, row-major. Rows must be rectangular. */
    rows: z.array(z.array(z.string())).min(1),
    units: z.string().optional(),
    notes: z.array(z.string()).optional(),
  })
  .refine((r) => r.rows.every((row) => row.length === r.rows[0].length), {
    message: "table rows must be rectangular (equal column counts)",
  })
  .refine((r) => r.header === undefined || r.header.length === r.rows[0].length, {
    message: "table header must have the same column count as the rows",
  });

export const tableBlockSchema = z
  .strictObject({
    ...blockBase,
    kind: z.literal("table"),
    /**
     * Exact linearized source text the extractor saw. May be empty ONLY when
     * an explicit fallback preserves the source region instead.
     */
    sourceText: z.string(),
    reconstruction: tableReconstructionSchema.optional(),
  })
  .refine((t) => t.sourceText.length > 0 || t.fallback !== undefined, {
    message:
      "table must preserve exact sourceText or carry an explicit fallback — never silently substitute reconstruction for source",
  });

/**
 * Figures carry no free-form text fields: alt text or descriptions are AI
 * assistance and live outside the canonical source layer. Captions are
 * separate anchored `caption` blocks related through `captionFor`.
 */
export const figureBlockSchema = z
  .strictObject({
    ...blockBase,
    kind: z.literal("figure"),
  })
  .refine(
    (f) =>
      f.anchor.bbox !== undefined ||
      f.fallback?.representation.kind === "source_region",
    {
      message:
        "figure must retain a croppable source representation: anchor.bbox or a source_region fallback",
    },
  );

export const formulaBlockSchema = z
  .strictObject({
    ...blockBase,
    kind: z.literal("formula"),
    /** Exact source representation (e.g. extracted text or TeX-like string). */
    sourceText: z.string(),
  })
  .refine((f) => f.sourceText.length > 0 || f.fallback !== undefined, {
    message:
      "formula must preserve exact sourceText or carry an explicit source-region fallback",
  });

/** A caption block related to a table, figure, or formula. */
export const captionBlockSchema = z.strictObject({
  ...blockBase,
  kind: z.literal("caption"),
  sourceText: z.string().min(1),
  /** ID of the table/figure/formula this caption belongs to. */
  captionFor: z.string().min(1),
});

/** Running headers/footers and page numbers — preserved but non-body. */
export const pageArtifactBlockSchema = z.strictObject({
  ...blockBase,
  kind: z.literal("page_artifact"),
  artifactKind: z.enum(["running_header", "running_footer", "page_number"]),
  sourceText: z.string().min(1),
});

export const blockSchema = z.discriminatedUnion("kind", [
  headingBlockSchema,
  paragraphBlockSchema,
  footnoteBlockSchema,
  referenceEntryBlockSchema,
  tableBlockSchema,
  figureBlockSchema,
  formulaBlockSchema,
  captionBlockSchema,
  pageArtifactBlockSchema,
]);

// ---------------------------------------------------------------------------
// Inferred types (the public TypeScript surface)
// ---------------------------------------------------------------------------

export type BoundingBox = z.infer<typeof boundingBoxSchema>;
export type SourceAnchor = z.infer<typeof sourceAnchorSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type BlockFallback = z.infer<typeof fallbackSchema>;
export type InlineCitation = z.infer<typeof inlineCitationSchema>;
export type FootnoteReference = z.infer<typeof footnoteReferenceSchema>;
export type HeadingBlock = z.infer<typeof headingBlockSchema>;
export type ParagraphBlock = z.infer<typeof paragraphBlockSchema>;
export type FootnoteBlock = z.infer<typeof footnoteBlockSchema>;
export type ReferenceEntryBlock = z.infer<typeof referenceEntryBlockSchema>;
export type TableReconstruction = z.infer<typeof tableReconstructionSchema>;
export type TableBlock = z.infer<typeof tableBlockSchema>;
export type FigureBlock = z.infer<typeof figureBlockSchema>;
export type FormulaBlock = z.infer<typeof formulaBlockSchema>;
export type CaptionBlock = z.infer<typeof captionBlockSchema>;
export type PageArtifactBlock = z.infer<typeof pageArtifactBlockSchema>;
export type Block = z.infer<typeof blockSchema>;
export type BlockKind = Block["kind"];
