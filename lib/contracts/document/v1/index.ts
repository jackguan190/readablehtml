/**
 * Canonical Document Contract v1 — public API.
 *
 * Import from this module only; `schema.ts` and `document.ts` are internal
 * layout. See CONTRACT.md for invariants and the dependency rule.
 */
export {
  blockSchema,
  boundingBoxSchema,
  captionBlockSchema,
  confidenceSchema,
  fallbackSchema,
  figureBlockSchema,
  footnoteBlockSchema,
  footnoteReferenceSchema,
  formulaBlockSchema,
  headingBlockSchema,
  inlineCitationSchema,
  pageArtifactBlockSchema,
  paragraphBlockSchema,
  referenceEntryBlockSchema,
  sourceAnchorSchema,
  tableBlockSchema,
  tableReconstructionSchema,
} from "./schema";
export type {
  Block,
  BlockFallback,
  BlockKind,
  BoundingBox,
  CaptionBlock,
  Confidence,
  FigureBlock,
  FootnoteBlock,
  FootnoteReference,
  FormulaBlock,
  HeadingBlock,
  InlineCitation,
  PageArtifactBlock,
  ParagraphBlock,
  ReferenceEntryBlock,
  SourceAnchor,
  TableBlock,
  TableReconstruction,
} from "./schema";

export {
  SCHEMA_VERSION,
  documentExtractionSchema,
  documentSourceSchema,
  documentV1Schema,
  extractionMethodSchema,
  parseDocumentV1,
} from "./document";
export type {
  DocumentExtraction,
  DocumentSource,
  DocumentV1,
  ExtractionMethod,
  InvalidDocumentResult,
  ParseDocumentV1Result,
  UnsupportedVersionResult,
} from "./document";
