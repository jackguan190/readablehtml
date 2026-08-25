/**
 * Canonical Document Contract v1 — document envelope, cross-block
 * invariants, and the versioned parse entry point.
 *
 * Version policy (Phase 1): exact discriminator `schemaVersion: 1`. Missing,
 * malformed, or unknown versions produce a distinguishable
 * `unsupported_version` result. No forward compatibility is claimed.
 */
import { z } from "zod";
import { blockSchema, type Block, type BlockKind } from "./schema";

export const SCHEMA_VERSION = 1;

/**
 * The source file format, independent of how text was extracted from it.
 * MVP ships born-digital PDFs only, but that is a product decision — the
 * contract models the file generically so OCR/vision producers do not force
 * a schema version bump.
 */
export const documentSourceSchema = z.strictObject({
  mediaType: z.literal("application/pdf"),
  /** Storage key of the original PDF, when known. Opaque to the contract. */
  storagePath: z.string().min(1).optional(),
  pageCount: z.number().int().min(1).optional(),
});

/**
 * How block content was produced from the source. Recognized methods cover
 * the producers this repository already anticipates; recognizing a method
 * here implements no pipeline and enables nothing in the MVP product.
 */
export const extractionMethodSchema = z.enum([
  "embedded_text",
  "ocr",
  "vision",
  "hybrid",
]);

export const documentExtractionSchema = z.strictObject({
  method: extractionMethodSchema,
});

// ---------------------------------------------------------------------------
// Document-level invariants
// ---------------------------------------------------------------------------

function checkDocumentInvariants(
  doc: { source: { pageCount?: number }; blocks: Block[] },
  ctx: z.RefinementCtx,
): void {
  const byId = new Map<string, Block>();
  doc.blocks.forEach((block, i) => {
    if (byId.has(block.id)) {
      ctx.addIssue({
        code: "custom",
        message: `duplicate block id "${block.id}" — block ids must be unique`,
        path: ["blocks", i, "id"],
      });
    } else {
      byId.set(block.id, block);
    }
  });

  let previousOrder = -1;
  doc.blocks.forEach((block, i) => {
    if (block.readingOrder <= previousOrder) {
      ctx.addIssue({
        code: "custom",
        message:
          "blocks must be sorted by strictly increasing readingOrder (deterministic reading order)",
        path: ["blocks", i, "readingOrder"],
      });
    }
    previousOrder = block.readingOrder;
  });

  const requireTarget = (
    path: (string | number)[],
    targetId: string,
    allowedKinds: readonly BlockKind[],
  ): void => {
    const target = byId.get(targetId);
    if (!target) {
      ctx.addIssue({
        code: "custom",
        message: `relationship target "${targetId}" does not exist`,
        path,
      });
      return;
    }
    if (!allowedKinds.includes(target.kind)) {
      ctx.addIssue({
        code: "custom",
        message: `relationship target "${targetId}" must be a ${allowedKinds.join(
          " | ",
        )} block, but is a ${target.kind} block`,
        path,
      });
    }
  };

  doc.blocks.forEach((block, i) => {
    if (block.kind === "paragraph") {
      block.citations?.forEach((citation, j) => {
        if (citation.referenceEntryId !== undefined) {
          requireTarget(
            ["blocks", i, "citations", j, "referenceEntryId"],
            citation.referenceEntryId,
            ["reference_entry"],
          );
        }
      });
      block.footnoteRefs?.forEach((ref, j) => {
        requireTarget(
          ["blocks", i, "footnoteRefs", j, "footnoteId"],
          ref.footnoteId,
          ["footnote"],
        );
      });
    }
    if (block.kind === "caption") {
      requireTarget(["blocks", i, "captionFor"], block.captionFor, [
        "table",
        "figure",
        "formula",
      ]);
    }
  });

  const pageCount = doc.source.pageCount;
  if (pageCount !== undefined) {
    doc.blocks.forEach((block, i) => {
      if (block.anchor.page > pageCount) {
        ctx.addIssue({
          code: "custom",
          message: `anchor page ${block.anchor.page} exceeds the declared source pageCount ${pageCount}`,
          path: ["blocks", i, "anchor", "page"],
        });
      }
      const rep = block.fallback?.representation;
      if (rep?.kind === "source_region" && rep.anchor.page > pageCount) {
        ctx.addIssue({
          code: "custom",
          message: `fallback anchor page ${rep.anchor.page} exceeds the declared source pageCount ${pageCount}`,
          path: ["blocks", i, "fallback", "representation", "anchor", "page"],
        });
      }
    });
  }
}

export const documentV1Schema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    /** Stable document identifier. Assigned upstream; opaque to the contract. */
    documentId: z.string().min(1),
    title: z.string().min(1).optional(),
    source: documentSourceSchema,
    extraction: documentExtractionSchema,
    /** All blocks, pre-sorted by readingOrder. Never empty. */
    blocks: z
      .array(blockSchema)
      .min(1, "a canonical document must contain at least one block"),
  })
  .superRefine(checkDocumentInvariants);

export type DocumentV1 = z.infer<typeof documentV1Schema>;
export type DocumentSource = z.infer<typeof documentSourceSchema>;
export type DocumentExtraction = z.infer<typeof documentExtractionSchema>;
export type ExtractionMethod = z.infer<typeof extractionMethodSchema>;

// ---------------------------------------------------------------------------
// Versioned parse entry point
// ---------------------------------------------------------------------------

export interface UnsupportedVersionResult {
  ok: false;
  code: "unsupported_version";
  supportedVersion: typeof SCHEMA_VERSION;
  receivedVersion: unknown;
  message: string;
}

export interface InvalidDocumentResult {
  ok: false;
  code: "invalid_document";
  issues: z.ZodError["issues"];
  message: string;
}

export type ParseDocumentV1Result =
  | { ok: true; document: DocumentV1 }
  | UnsupportedVersionResult
  | InvalidDocumentResult;

/**
 * Parse untrusted JSON into a canonical v1 document.
 *
 * Version is checked before structural validation so callers can distinguish
 * "not a version we speak" from "version 1 but malformed".
 */
export function parseDocumentV1(input: unknown): ParseDocumentV1Result {
  const receivedVersion =
    typeof input === "object" && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>).schemaVersion
      : undefined;

  if (receivedVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      code: "unsupported_version",
      supportedVersion: SCHEMA_VERSION,
      receivedVersion,
      message:
        receivedVersion === undefined
          ? "document has no schemaVersion (or is not an object); only schemaVersion 1 is supported"
          : `unsupported schemaVersion ${JSON.stringify(
              receivedVersion,
            )}; only schemaVersion 1 is supported`,
    };
  }

  const result = documentV1Schema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      code: "invalid_document",
      issues: result.error.issues,
      message: z.prettifyError(result.error),
    };
  }
  return { ok: true, document: result.data };
}
