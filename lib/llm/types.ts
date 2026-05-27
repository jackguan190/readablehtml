/**
 * Shared types for the LLM provider abstraction.
 * Both client and server can import these — no `server-only` here. Actual
 * provider construction (which uses API keys) lives in `lib/llm/provider.ts`
 * and IS server-only.
 */

export type LlmProviderKind = "openai" | "deepseek";

export type LlmSource = "platform" | "byok";

/**
 * Config the client sends to a server action when it wants to invoke an
 * AI feature. Three legal shapes:
 *
 *   { source: "platform" }
 *     → use server's OPENAI_API_KEY + consume platform AI quota.
 *
 *   { source: "byok", provider: "openai", apiKey, model? }
 *     → user's OpenAI key, no platform quota consumed.
 *
 *   { source: "byok", provider: "deepseek", apiKey, model? }
 *     → user's DeepSeek key (OpenAI-compatible API), no platform quota consumed.
 *
 * Never persisted server-side. Never logged. Passed through the server-action
 * boundary in memory only.
 */
export type LlmProviderConfig =
  | { source: "platform"; model?: string }
  | {
      source: "byok";
      provider: LlmProviderKind;
      apiKey: string;
      model?: string;
    };

export interface CallStructuredInput {
  systemPrompt: string;
  userPrompt: string;
  /** When set to "json", request strict JSON mode (provider-dependent). */
  responseFormat?: "json" | "text";
  temperature?: number;
}

export interface CallStructuredResult {
  content: string;
  modelUsed: string;
  providerUsed: LlmProviderKind;
}

export interface SummarizeSectionInput {
  /** Section heading text. */
  title: string;
  /** Section body text. */
  body: string;
}

export interface SummarizeSectionResult {
  summary: string;
  keyTerms: { term: string; def: string }[];
  modelUsed: string;
  providerUsed: LlmProviderKind;
}

export interface ExplainParagraphInput {
  paragraph: string;
  /** Optional surrounding context (e.g. section title or prior paragraph). */
  context?: string;
}

export interface ExplainParagraphResult {
  explanation: string;
  modelUsed: string;
  providerUsed: LlmProviderKind;
}

/**
 * Structured error codes a provider call can surface. The UI can branch on
 * `code` to render specific messaging; `cause` carries the original Error.
 */
export type LlmErrorCode =
  | "invalid_key"
  | "rate_limit"
  | "unsupported_model"
  | "provider_unavailable"
  | "not_configured"
  | "unknown";

/** Defaults — referenced by both the provider impl and the AI Settings UI. */
export const LLM_DEFAULTS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o"] as const,
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"] as const,
  },
} as const;
