import "server-only";

import OpenAI from "openai";
import {
  LLM_DEFAULTS,
  type CallStructuredInput,
  type CallStructuredResult,
  type ExplainParagraphInput,
  type ExplainParagraphResult,
  type LlmErrorCode,
  type LlmProviderConfig,
  type LlmProviderKind,
  type SummarizeSectionInput,
  type SummarizeSectionResult,
} from "./types";

/**
 * Server-only LLM provider abstraction. Both OpenAI and DeepSeek expose
 * an OpenAI-compatible HTTP API; the same client implementation handles
 * both with different `baseURL` + `apiKey` pairs.
 *
 * Security:
 *   - User-supplied BYOK keys are passed in via `LlmProviderConfig`. They
 *     are NEVER persisted, NEVER logged, and only live in memory for the
 *     duration of a single server-action invocation.
 *   - The platform OPENAI_API_KEY is read from `process.env` and never
 *     reaches the client.
 */

export interface LlmProvider {
  readonly kind: LlmProviderKind;
  readonly defaultModel: string;
  callStructured(input: CallStructuredInput): Promise<CallStructuredResult>;
  summarizeSection(
    input: SummarizeSectionInput,
  ): Promise<SummarizeSectionResult>;
  explainParagraph(
    input: ExplainParagraphInput,
  ): Promise<ExplainParagraphResult>;
  // translateText — coming later. The provider already has callStructured,
  // so a translation method is a thin wrapper around it when we wire the UI.
}

export class LlmProviderError extends Error {
  readonly code: LlmErrorCode;
  readonly provider: LlmProviderKind;
  readonly cause: unknown;

  constructor(
    provider: LlmProviderKind,
    code: LlmErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "LlmProviderError";
    this.code = code;
    this.provider = provider;
    this.cause = cause;
  }
}

/** Translate an SDK error into a structured LlmProviderError. */
function classifyError(provider: LlmProviderKind, err: unknown): LlmProviderError {
  // OpenAI SDK throws OpenAI.APIError with `.status`, `.code`, `.message`.
  const anyErr = err as { status?: number; code?: string; message?: string };
  const status = typeof anyErr.status === "number" ? anyErr.status : undefined;
  const msg = anyErr.message ?? String(err);

  if (status === 401 || status === 403) {
    return new LlmProviderError(
      provider,
      "invalid_key",
      `Authentication failed against ${provider}. Check the API key.`,
      err,
    );
  }
  if (status === 429) {
    return new LlmProviderError(
      provider,
      "rate_limit",
      `${provider} rate-limited the request. Try again in a moment.`,
      err,
    );
  }
  if (status === 404 || /model.*not.*(found|exist|support)/i.test(msg)) {
    return new LlmProviderError(
      provider,
      "unsupported_model",
      `${provider} does not recognize the requested model.`,
      err,
    );
  }
  if ((status !== undefined && status >= 500) || /network|fetch|ENOTFOUND|ECONN/i.test(msg)) {
    return new LlmProviderError(
      provider,
      "provider_unavailable",
      `${provider} is currently unreachable.`,
      err,
    );
  }
  return new LlmProviderError(
    provider,
    "unknown",
    `${provider} call failed: ${msg}`,
    err,
  );
}

class OpenAiCompatibleProvider implements LlmProvider {
  constructor(
    public readonly kind: LlmProviderKind,
    private readonly apiKey: string,
    private readonly baseURL: string | undefined,
    public readonly defaultModel: string,
  ) {}

  private buildClient(): OpenAI {
    // `apiKey` is captured in a local closure — never written to logs.
    return new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL });
  }

  async callStructured(
    input: CallStructuredInput,
  ): Promise<CallStructuredResult> {
    const client = this.buildClient();
    try {
      const completion = await client.chat.completions.create({
        model: this.defaultModel,
        response_format:
          input.responseFormat === "json" ? { type: "json_object" } : undefined,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        temperature: input.temperature ?? 0.2,
      });
      const content = completion.choices[0]?.message?.content ?? "";
      return {
        content,
        modelUsed: this.defaultModel,
        providerUsed: this.kind,
      };
    } catch (err) {
      throw classifyError(this.kind, err);
    }
  }

  async summarizeSection(
    input: SummarizeSectionInput,
  ): Promise<SummarizeSectionResult> {
    const systemPrompt = `You produce concise study-page summaries.
Output strict JSON: { "summary": string (2-3 sentences), "key_terms": Array<{ "term": string, "def": string }> }.
Do not invent content not present in the source.`;
    const userPrompt = `Section title: ${input.title}\n\nSection body:\n${input.body}`;

    const result = await this.callStructured({
      systemPrompt,
      userPrompt,
      responseFormat: "json",
      temperature: 0.2,
    });

    let parsed: { summary?: string; key_terms?: unknown } = {};
    try {
      parsed = JSON.parse(result.content);
    } catch {
      throw new LlmProviderError(
        this.kind,
        "unknown",
        `${this.kind} returned non-JSON for summarizeSection.`,
      );
    }
    const keyTerms = Array.isArray(parsed.key_terms)
      ? parsed.key_terms
          .filter(
            (kt): kt is { term: string; def: string } =>
              !!kt &&
              typeof (kt as { term?: unknown }).term === "string" &&
              typeof (kt as { def?: unknown }).def === "string",
          )
          .slice(0, 6)
      : [];
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      keyTerms,
      modelUsed: result.modelUsed,
      providerUsed: result.providerUsed,
    };
  }

  async explainParagraph(
    input: ExplainParagraphInput,
  ): Promise<ExplainParagraphResult> {
    const systemPrompt = `You explain a single paragraph from an academic text in 2-3 plain sentences.
Be specific. Do not summarize the whole document. Do not invent.`;
    const userPrompt = input.context
      ? `Context (surrounding section): ${input.context}\n\nParagraph to explain:\n${input.paragraph}`
      : `Paragraph to explain:\n${input.paragraph}`;

    const result = await this.callStructured({
      systemPrompt,
      userPrompt,
      responseFormat: "text",
      temperature: 0.3,
    });
    return {
      explanation: result.content.trim(),
      modelUsed: result.modelUsed,
      providerUsed: result.providerUsed,
    };
  }
}

/**
 * Build an LlmProvider for the given config. Validates that any required
 * key is present and routes to the right baseURL.
 *
 * Throws `LlmProviderError(code: "not_configured")` synchronously when
 * the platform key is missing (callers should catch and surface a clean
 * UI error instead of treating it as a generic 500).
 */
export function buildProvider(config: LlmProviderConfig): LlmProvider {
  if (config.source === "platform") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new LlmProviderError(
        "openai",
        "not_configured",
        "Platform OPENAI_API_KEY is not configured on the server. Provide your own key via BYOK or ask the operator to set it.",
      );
    }
    return new OpenAiCompatibleProvider(
      "openai",
      apiKey,
      undefined,
      config.model ?? LLM_DEFAULTS.openai.defaultModel,
    );
  }

  // BYOK
  const trimmedKey = (config.apiKey ?? "").trim();
  if (trimmedKey.length === 0) {
    throw new LlmProviderError(
      config.provider,
      "invalid_key",
      "Bring-your-own-key requires a non-empty API key.",
    );
  }
  if (config.provider === "deepseek") {
    return new OpenAiCompatibleProvider(
      "deepseek",
      trimmedKey,
      LLM_DEFAULTS.deepseek.baseUrl,
      config.model ?? LLM_DEFAULTS.deepseek.defaultModel,
    );
  }
  // openai BYOK
  return new OpenAiCompatibleProvider(
    "openai",
    trimmedKey,
    undefined,
    config.model ?? LLM_DEFAULTS.openai.defaultModel,
  );
}

/**
 * Public helper for server actions: turn any thrown LlmProviderError into a
 * `{ code, message }` shape suitable for sending to the client. Plain
 * unknown errors get bucketed as `unknown`.
 */
export function toClientLlmError(err: unknown): {
  code: LlmErrorCode;
  message: string;
} {
  if (err instanceof LlmProviderError) {
    return { code: err.code, message: err.message };
  }
  return {
    code: "unknown",
    message: err instanceof Error ? err.message : String(err),
  };
}
