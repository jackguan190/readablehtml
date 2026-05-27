import type { LlmErrorCode } from "./types";

/**
 * Single source of truth for translating a structured LlmErrorCode into the
 * sentence the UI should render. Both restructure-with-AI and explain-paragraph
 * surface the same set of failures; identical wording is intentional.
 *
 * Callers may override `fallback` to provide a context-specific generic
 * message (e.g. "AI restructuring failed. The document is unchanged.").
 */
export function llmErrorMessage(
  code: LlmErrorCode,
  fallback: string = "The AI request failed.",
): string {
  switch (code) {
    case "invalid_key":
      return "Your API key was rejected. Update it in AI Settings.";
    case "rate_limit":
      return "Provider rate-limited the request. Try again in a moment.";
    case "unsupported_model":
      return "Selected model isn't available on this provider. Pick another in AI Settings.";
    case "provider_unavailable":
      return "Provider is unreachable. Try again later.";
    case "not_configured":
      return "AI is not configured. Add your own key in AI Settings.";
    case "unknown":
      return fallback;
    default: {
      // Exhaustiveness guard — compile-time check that we covered every code.
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}
