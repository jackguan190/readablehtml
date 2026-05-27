# BYOK AI Providers — Design Spec

**Date:** 2026-05-27
**Status:** Approved for implementation
**Scope:** Wire existing BYOK abstraction into the document reader UI, and add a per-paragraph "Explain" action+UI driven by the same abstraction.

## Goal

Let users opt out of the platform OpenAI key by pasting their own DeepSeek (or OpenAI) API key in an AI Settings panel. When BYOK is active, the platform's monthly AI quota is not consumed. Keys live in browser memory only for the lifetime of the open tab — never localStorage, never cookies, never logs.

## Non-goals

Payments, Chandra implementation, OCR, public sharing, the `translateText` provider method (deferred), persistence of the user's key across reloads, multi-tab session sync, BYOK usage counters.

## What already exists (no work)

| Surface | Location |
|---|---|
| `LlmProvider` interface (`summarizeSection`, `explainParagraph`, `callStructured`) | `lib/llm/provider.ts` |
| `OpenAiCompatibleProvider` (handles OpenAI + DeepSeek via baseURL + apiKey) | `lib/llm/provider.ts` |
| `LlmProviderConfig` discriminated union, `LLM_DEFAULTS`, `LlmErrorCode` | `lib/llm/types.ts` |
| `LlmProviderError` + `classifyError` (status → code) + `toClientLlmError` | `lib/llm/provider.ts` |
| `buildProvider(config)` with platform fallback (throws `not_configured` on missing platform key) | `lib/llm/provider.ts` |
| `restructureWithAI(documentId, providerConfig?)` — accepts BYOK, skips platform quota when BYOK | `lib/documents/actions.ts` |
| `aiStructure(pages, providerConfig?)` — accepts BYOK, returns structured `LlmErrorCode` on failure | `lib/documents/ai_structuring.ts` |
| `AiSettingsButton` popover UI (provider radio, password input, model picker, verbatim copy) | `components/AiSettings.tsx` |

## Architecture

```
Browser                                       Server (Next.js server actions)
─────────                                     ──────────────────────────────
DocumentClient ── useState<AiSettingsValue>   restructureWithAI(id, cfg?)
   │   (session-only, no localStorage)        explainParagraphAction(input, cfg?)
   ▼                                                  │
AiSettingsButton (popover)                            ▼
   user pastes key ──cfg──▶                  buildProvider(cfg)
   key in React state only                            │
                                                      ▼
                                              OpenAiCompatibleProvider
                                              (DeepSeek baseURL or default)
```

### Session-only key — invariants

- `aiSettings: AiSettingsValue` lives in `useState` inside `DocumentClient`.
- No `useEffect` writes it anywhere.
- No serialization to `localStorage`, `sessionStorage`, cookies, IndexedDB, or analytics.
- API key crosses to the server as part of the encrypted Next server-action payload (HTTPS + Next's encrypted action ID); used once inside `buildProvider`, then dropped.
- No log statement prints `config.apiKey` — already audited in `provider.ts` and to be re-audited in the new action.
- A one-line comment at the state declaration locks the invariant:
  ```ts
  // session-only; do not persist (no localStorage, no cookies)
  const [aiSettings, setAiSettings] = useState<AiSettingsValue>(aiSettingsDefault);
  ```

## Changes

### New file: `lib/documents/explain_actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildProvider, LlmProviderError, toClientLlmError } from "@/lib/llm/provider";
import type { LlmErrorCode, LlmProviderConfig, LlmProviderKind } from "@/lib/llm/types";
import {
  consumeQuota,
  getUsageSnapshot,
  quotaExceededMessage,
} from "@/lib/usage/quota";

interface ExplainInput {
  documentId: string;
  paragraph: string;
  context?: string;
  providerConfig?: LlmProviderConfig;
}

type ExplainResult =
  | {
      ok: true;
      data: {
        explanation: string;
        providerUsed: LlmProviderKind;
        modelUsed: string;
      };
    }
  | { error: string; code?: LlmErrorCode; quotaExceeded?: boolean };

export async function explainParagraphAction(
  input: ExplainInput,
): Promise<ExplainResult> {
  // 1. auth + ownership
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, user_id")
    .eq("id", input.documentId)
    .single();
  if (docErr || !doc) return { error: "Document not found." };
  if (doc.user_id !== user.id) return { error: "Not authorized." };

  // 2. quota peek (platform only — BYOK skips entirely)
  const config: LlmProviderConfig = input.providerConfig ?? { source: "platform" };
  const isByok = config.source === "byok";
  if (!isByok) {
    const snapshot = await getUsageSnapshot();
    if (snapshot && snapshot.aiActions >= snapshot.limits.ai) {
      return { error: quotaExceededMessage("ai_action"), quotaExceeded: true };
    }
  }

  // 3. call provider — never log apiKey
  try {
    const provider = buildProvider(config);
    const result = await provider.explainParagraph({
      paragraph: input.paragraph,
      context: input.context,
    });

    // 4. consume quota only on success (platform only)
    if (!isByok) {
      const consumed = await consumeQuota("ai_action");
      if ("error" in consumed) {
        if (consumed.error === "quota_exceeded") {
          return {
            error: quotaExceededMessage("ai_action"),
            quotaExceeded: true,
          };
        }
        return { error: consumed.error };
      }
    }

    return {
      ok: true,
      data: {
        explanation: result.explanation,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
      },
    };
  } catch (err) {
    const { code, message } = toClientLlmError(err);
    return { error: message, code };
  }
}
```

Notes:
- Reuses `getUsageSnapshot`/`consumeQuota` — same peek-then-consume order as `restructureWithAI`.
- `LlmProviderError` is caught and converted via `toClientLlmError` so the client never sees the `cause` chain.
- No `revalidatePath` — explain is a read-only AI call.

### Changed file: `app/documents/[id]/DocumentClient.tsx`

1. Add import:
   ```ts
   import { AiSettingsButton, aiSettingsDefault, type AiSettingsValue } from "@/components/AiSettings";
   ```
2. Add state next to other DocumentClient state (alongside `restructureError`, etc.):
   ```ts
   // session-only; do not persist (no localStorage, no cookies)
   const [aiSettings, setAiSettings] = useState<AiSettingsValue>(() => aiSettingsDefault());
   ```
3. Mount `<AiSettingsButton value={aiSettings} onChange={setAiSettings} />` in the document toolbar (next to "Restructure with AI").
4. Update the existing call site:
   ```ts
   const res = await restructureWithAI(document.id, aiSettings.config);
   ```
5. Pass `aiSettings.config` to `ReadingView` as a new prop `aiProviderConfig: LlmProviderConfig`. `ReadingView` forwards it to its internal `ParagraphView` so the per-paragraph "Explain" handler can include it in the server-action payload. No React Context — keeps the component contract explicit and the diff small.

### Changed file: `components/ReadingView.tsx` — `ParagraphView` per-paragraph render

Inside the existing `ParagraphView` component (the per-paragraph renderer used for `blockType === "body"`), add a hover-revealed pill button at the right edge of the paragraph:

- Icon: `Sparkles` from lucide-react.
- Tooltip: `"Explain this paragraph"`.
- On click → call `explainParagraphAction({ documentId, paragraph, context: section.title, providerConfig: aiSettings.config })`.
- Local state per paragraph: `explanation | null`, `loading`, `error`.
- On success → render inline collapsible block below paragraph: `<div role="region" aria-label="AI explanation">…</div>` with provider badge formatted exactly like the toolbar: `DeepSeek (BYOK) · deepseek-v4-flash` or `Platform · gpt-4o-mini` — share the existing `makeDisplayLabel` helper from `AiSettings.tsx` (export it for reuse). Block has a close button.
- On error → inline banner with code-specific message (see table below).

Deliberately separate from the selection toolbar. Selection = annotate (existing). Hover pill = explain (new). No overlap.

### Error-code → UI message mapping

Reused from the existing mapping in `lib/documents/actions.ts:restructureWithAI` (extract into a tiny helper `lib/llm/messages.ts` once, share between both actions' UIs):

| `LlmErrorCode` | UI message |
|---|---|
| `invalid_key` | "Your API key was rejected. Update it in AI Settings." |
| `rate_limit` | "Provider rate-limited the request. Try again in a moment." |
| `unsupported_model` | "Selected model isn't available on this provider. Pick another in AI Settings." |
| `provider_unavailable` | "Provider is unreachable. Try again later." |
| `not_configured` | "AI is not configured. Add your own key in AI Settings." |
| `unknown` | server-supplied message |

### No-op files

`lib/llm/types.ts`, `lib/llm/provider.ts`, `components/AiSettings.tsx`, `lib/documents/ai_structuring.ts` — already correct; no code change.

## Data flow examples

### A — Platform user, restructure with AI

```
DocumentClient ── restructureWithAI(id) ──▶ default {source:"platform"}
   ↳ peek user_usage.ai_actions vs limit 20
   ↳ provider = OpenAI w/ process.env.OPENAI_API_KEY
   ↳ call → consume ai_action → replace document_pages
```

### B — BYOK DeepSeek user, restructure with AI

```
DocumentClient ── aiSettings.config = {source:"byok", provider:"deepseek", apiKey, model:"deepseek-v4-flash"}
   ↳ restructureWithAI(id, cfg)
   ↳ isByok = true → SKIP quota peek + consume
   ↳ provider = DeepSeek w/ apiKey, baseURL https://api.deepseek.com
   ↳ call → on success replace document_pages
   ↳ apiKey dropped at end of action invocation
```

### C — BYOK DeepSeek user, explain a paragraph

```
ReadingView paragraph hover → click ✨
   ↳ explainParagraphAction({documentId, paragraph, context, providerConfig:cfg})
   ↳ auth + ownership check
   ↳ isByok = true → SKIP quota peek + consume
   ↳ provider.explainParagraph(paragraph, context)
   ↳ {ok:true, data:{explanation, providerUsed:"deepseek", modelUsed:"deepseek-v4-flash"}}
   ↳ ReadingView renders inline block + provider badge
```

## Verification

- `npm run build` must pass at the end (requirement #14).
- Manual click-through:
  1. Open a document; toolbar shows `AI · Platform · gpt-4o-mini`.
  2. Open AI Settings → switch to DeepSeek BYOK → paste a key → save. Badge updates to `AI · DeepSeek (BYOK) · deepseek-v4-flash`.
  3. Click "Restructure with AI" → DB is updated, monthly AI quota counter does NOT increment.
  4. Hover a body paragraph → click ✨ → inline explanation appears with `Explained by DeepSeek (deepseek-v4-flash)` badge.
  5. Reload page → `aiSettings` resets to platform (proves session-only).
  6. With a deliberately wrong key → click ✨ → see "Your API key was rejected" inline banner.
  7. Network tab → no request to `localStorage`/`sessionStorage`; key only present in the encrypted server-action POST body.

## Out of scope (explicitly)

- Payments, Chandra HTTP implementation, OCR, public sharing.
- `translateText` provider method (deferred — interface comment in `provider.ts` already notes this).
- Cross-tab session sync, persistence across reloads.
- BYOK usage counters (`byok_actions` column) — chose "skip platform quota, don't count at all" per session decision.
- Re-summarize a single section without re-running the full document pipeline — out of scope for this PR; provider method exists for future use.

## Constraints from the user spec (verbatim)

- "Do not proxy around restrictions or hide provider identity. This is a legitimate user-configured provider adapter."
  → Implementation honors this: `providerUsed` is returned on every result and surfaced in UI. We never claim DeepSeek output came from OpenAI or vice versa.
- "Do not store user API keys in localStorage."
  → React state only. One-line comment at the state declaration locks the invariant.
- "Never expose any server-side OpenAI key to the client."
  → `lib/llm/provider.ts` is `"server-only"`. `process.env.OPENAI_API_KEY` is read only inside `buildProvider` on the server. No `NEXT_PUBLIC_` exposure anywhere.
- "If user uses their own key, do not consume our platform AI quota, or track it separately as BYOK usage."
  → `if (!isByok)` short-circuits both peek and consume in both actions. No BYOK counter.
