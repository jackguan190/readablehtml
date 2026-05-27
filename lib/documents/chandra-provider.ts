import "server-only";

/**
 * Chandra (layout-aware OCR) provider interface.
 *
 * The actual HTTP call to the Chandra API is a documented stub today —
 * see `HttpChandraProvider.convertPdf` below. The rest of the pipeline
 * (server action, mapper, UI, schema, quota) is fully wired and ships
 * with this turn so that when Chandra's API is integrated, no migration
 * + code release dance is needed — just fill in the function body.
 *
 * Returned `ChandraResult` shape is the contract every consumer downstream
 * relies on. Keep it stable when implementing the HTTP call.
 */

export interface ChandraConvertOptions {
  documentId: string;
  /** Total page count (used for telemetry + provider-side limits). */
  pageCount: number;
}

export type ChandraBlockType =
  | "heading"
  | "paragraph"
  | "table"
  | "figure"
  | "footnote"
  | "metadata";

export interface ChandraBlock {
  blockType: ChandraBlockType;
  /** Source page number (1-indexed). */
  page: number;
  /** Text content for heading / paragraph / footnote / metadata blocks. */
  text?: string;
  /** Caption text for table / figure blocks. */
  caption?: string;
  /** Heading level (1-6). Only meaningful for heading blocks. */
  level?: number;
  /** Reconstructed HTML for a table. */
  htmlTable?: string;
  /** Reconstructed Markdown for a table (alternative to htmlTable). */
  markdownTable?: string;
  /** Reconstructed structured JSON for a table (rows of cells). */
  jsonTable?: unknown;
  /** Alt-text / description for a figure block. */
  figureDescription?: string;
  /** Bounding box on the source page (optional, for future overlay UI). */
  bbox?: { x: number; y: number; w: number; h: number };
}

export interface ChandraPage {
  page: number;
  blocks: ChandraBlock[];
}

export interface ChandraResult {
  pages: ChandraPage[];
  pageCount: number;
  /** Always "chandra" — tags the source for downstream consumers. */
  provider: "chandra";
  /** Full raw API response, persisted to chandra_jobs.raw_response for debugging. */
  rawApiResponse?: unknown;
}

export interface ChandraProvider {
  /** True when env vars are set and the provider can attempt a call. */
  isConfigured(): boolean;
  /** Perform the conversion. May throw on network/provider errors. */
  convertPdf(
    buffer: Uint8Array,
    options: ChandraConvertOptions,
  ): Promise<ChandraResult>;
}

/** Returned when CHANDRA_API_KEY isn't set. */
export class NotConfiguredChandraProvider implements ChandraProvider {
  isConfigured(): boolean {
    return false;
  }
  async convertPdf(): Promise<ChandraResult> {
    throw new Error(
      "Chandra is not configured on this deployment. " +
        "Set CHANDRA_API_KEY (and optionally CHANDRA_API_URL) in .env.local " +
        "to enable layout-aware conversion.",
    );
  }
}

/**
 * HTTP provider — calls the Chandra API and returns a `ChandraResult`.
 *
 * NOT YET IMPLEMENTED — `convertPdf` throws with a "wire me up" message.
 *
 * To wire this up:
 *   1. Replace the body of `convertPdf` with a real HTTP call. Expected
 *      shape (will need to translate from the actual Chandra API response):
 *
 *      POST `${apiUrl}/convert`  (or whatever the actual endpoint is)
 *        Headers:
 *          Authorization: Bearer ${this.apiKey}
 *          Content-Type:  multipart/form-data
 *        Body: the PDF buffer as a file part
 *
 *      Then parse the response into the `ChandraResult` shape above.
 *
 *   2. Persist `rawApiResponse` for debugging (server action writes it to
 *      `chandra_jobs.raw_response`).
 *
 *   3. Handle provider errors by throwing — `runChandraForDocument` catches
 *      and surfaces a clean error to the user without destroying existing
 *      document_pages.
 *
 *   4. (Optional) If Chandra returns async/polling, switch the action over
 *      to a background-worker pattern — today's flow assumes synchronous
 *      completion within the server-action timeout.
 */
export class HttpChandraProvider implements ChandraProvider {
  constructor(
    private readonly apiKey: string,
    private readonly apiUrl: string,
  ) {}

  isConfigured(): boolean {
    return !!this.apiKey && !!this.apiUrl;
  }

  async convertPdf(
    _buffer: Uint8Array,
    _options: ChandraConvertOptions,
  ): Promise<ChandraResult> {
    // INTENTIONAL STUB — see file-level JSDoc for the wiring contract.
    throw new Error(
      "Chandra HTTP provider not yet wired. " +
        "Fill in lib/documents/chandra-provider.ts:HttpChandraProvider.convertPdf with the actual API call. " +
        "Expected return shape: { pages: [{ page, blocks: [{ blockType, ... }] }], pageCount, provider: 'chandra' }.",
    );
  }
}

/** Construct the appropriate provider based on env config. */
export function getChandraProvider(): ChandraProvider {
  const apiKey = process.env.CHANDRA_API_KEY;
  const apiUrl =
    process.env.CHANDRA_API_URL ?? "https://api.datalab.to/v1/chandra";
  if (!apiKey) return new NotConfiguredChandraProvider();
  return new HttpChandraProvider(apiKey, apiUrl);
}

export type ChandraOutcome =
  | { kind: "ok"; result: ChandraResult }
  | {
      kind: "skipped";
      reason:
        | "not_configured"
        | "quota_exceeded"
        | "too_many_pages"
        | "provider_error";
      detail?: string;
    };
