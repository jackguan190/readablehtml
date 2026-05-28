# BYOK AI Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing BYOK LLM provider abstraction into the document reader, add session-only AI Settings UI, and ship a per-paragraph "Explain" action that respects BYOK.

**Architecture:** `DocumentClient` holds a session-only `AiSettingsValue` in `useState` (never persisted), passes `aiSettings.config` into `restructureWithAI` and a new `explainParagraphAction`. Both server actions skip platform AI quota when the config is BYOK. A hover-revealed Sparkles pill on each body paragraph triggers the explain action and renders the result inline. Provider badges everywhere reuse `makeDisplayLabel` from `AiSettings.tsx`.

**Tech Stack:** Next.js 14 App Router (server actions), TypeScript, React 18, Tailwind, lucide-react, Supabase (auth + RLS), OpenAI SDK (talks to both OpenAI and DeepSeek via different `baseURL`).

**Verification approach:** This project has no test framework installed (`package.json` only has `dev`/`build`/`start`/`lint` scripts). The spec explicitly defers automated tests for this alpha PR. Each task ends with `npm run lint` (where applicable) and a final task runs `npm run build` end-to-end. Manual click-through verification is documented in the final task.

**Spec reference:** `docs/superpowers/specs/2026-05-27-byok-ai-providers-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `lib/llm/messages.ts` | **Create** | Single source of truth for mapping `LlmErrorCode` → user-facing UI message. Used by both `restructureWithAI` callers and the new explain action's UI. ~25 lines, pure function, no deps beyond `lib/llm/types`. |
| `lib/documents/explain_actions.ts` | **Create** | `"use server"` wrapper around `provider.explainParagraph`. Auth + ownership + peek/consume quota (BYOK skips both) + error mapping. ~80 lines. |
| `components/AiSettings.tsx` | **Modify** | Add `export` keyword to existing `makeDisplayLabel` function so it can be reused for the explanation block's provider badge. One-character change. |
| `app/documents/[id]/DocumentClient.tsx` | **Modify** | Import `AiSettingsButton`/`aiSettingsDefault`/`AiSettingsValue`, add session-only `aiSettings` state, mount the button in the toolbar, pass `aiSettings.config` into `restructureWithAI`, pass it to `<ReadingView>` as a new prop. |
| `components/ReadingView.tsx` | **Modify** | Accept new `aiProviderConfig` prop on the public `Props` interface, forward it into the existing internal `ParagraphView` component. Inside `ParagraphView`, add a hover-revealed Sparkles pill on `blockType === "body"` paragraphs that calls `explainParagraphAction`, renders the result inline (collapsible) with a provider badge, and renders code-specific error messages. |

Each file has one responsibility. `lib/llm/messages.ts` is split out so the same mapping serves both the existing restructure flow (today the strings are inline in `lib/documents/actions.ts:restructureWithAI`) and the new explain flow — DRY without prematurely abstracting.

---

## Task 1: Add the shared error-code → message helper

**Files:**
- Create: `lib/llm/messages.ts`

This helper exists so the existing restructure flow and the new explain flow display identical wording for identical error codes.

- [ ] **Step 1: Create the helper file**

Create `lib/llm/messages.ts` with this exact content:

```ts
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
```

- [ ] **Step 2: Lint the new file**

Run:
```bash
cd ~/readablehtml && npm run lint -- --file lib/llm/messages.ts
```
Expected: no errors. (If `--file` is not supported by `next lint`, run the unscoped `npm run lint` — see Task 6.)

- [ ] **Step 3: Commit**

```bash
cd ~/readablehtml && git add lib/llm/messages.ts && git commit -m "feat(llm): add shared error-code → UI message helper"
```

---

## Task 2: Export `makeDisplayLabel` from `AiSettings.tsx`

**Files:**
- Modify: `components/AiSettings.tsx` (line 23 area — the `function makeDisplayLabel` declaration)

This lets the inline explanation block reuse the exact provider badge format the toolbar uses (e.g. `DeepSeek (BYOK) · deepseek-v4-flash`).

- [ ] **Step 1: Add the export keyword**

In `components/AiSettings.tsx`, change:

```ts
function makeDisplayLabel(config: LlmProviderConfig): string {
```

to:

```ts
export function makeDisplayLabel(config: LlmProviderConfig): string {
```

Leave the function body and all other code untouched.

- [ ] **Step 2: Verify the file still compiles**

Run:
```bash
cd ~/readablehtml && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/readablehtml && git add components/AiSettings.tsx && git commit -m "feat(ai-settings): export makeDisplayLabel for reuse in explanation badges"
```

---

## Task 3: Create the explainParagraph server action

**Files:**
- Create: `lib/documents/explain_actions.ts`

This is a standalone server action so the per-paragraph UI can call it directly without going through `restructureWithAI`. It mirrors the auth/quota/error-handling pattern of `restructureWithAI` but does NOT mutate any database row (explain is read-only).

- [ ] **Step 1: Create the action file**

Create `lib/documents/explain_actions.ts` with this exact content:

```ts
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildProvider, toClientLlmError } from "@/lib/llm/provider";
import type {
  LlmErrorCode,
  LlmProviderConfig,
  LlmProviderKind,
} from "@/lib/llm/types";
import {
  consumeQuota,
  getUsageSnapshot,
  quotaExceededMessage,
} from "@/lib/usage/quota";

export interface ExplainParagraphInput {
  documentId: string;
  paragraph: string;
  context?: string;
  providerConfig?: LlmProviderConfig;
}

export type ExplainParagraphResult =
  | {
      ok: true;
      data: {
        explanation: string;
        providerUsed: LlmProviderKind;
        modelUsed: string;
      };
    }
  | { error: string; code?: LlmErrorCode; quotaExceeded?: boolean };

/**
 * Explain a single paragraph using the configured LLM provider.
 *
 * Flow (mirrors restructureWithAI's peek-then-consume pattern):
 *   1. Auth + ownership check on the parent document.
 *   2. If platform (not BYOK): peek user_usage.ai_actions; fail fast if at cap.
 *   3. Call provider.explainParagraph().
 *   4. If platform: consume one ai_action slot.
 *
 * BYOK calls never touch user_usage — neither peek nor consume.
 *
 * Read-only on the database — no document_pages mutation, no revalidatePath.
 *
 * Security:
 *   - Caller's apiKey lives inside providerConfig only for the duration of this
 *     call (server-action invocation scope). Never logged, never persisted.
 *   - LlmProviderError.cause is stripped via toClientLlmError before return.
 */
export async function explainParagraphAction(
  input: ExplainParagraphInput,
): Promise<ExplainParagraphResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, user_id")
    .eq("id", input.documentId)
    .single();
  if (docErr || !doc) return { error: "Document not found." };
  if (doc.user_id !== user.id) return { error: "Not authorized." };

  const config: LlmProviderConfig =
    input.providerConfig ?? { source: "platform" };
  const isByok = config.source === "byok";

  if (!isByok) {
    const snapshot = await getUsageSnapshot();
    if (snapshot && snapshot.aiActions >= snapshot.limits.ai) {
      return {
        error: quotaExceededMessage("ai_action"),
        quotaExceeded: true,
      };
    }
  }

  try {
    const provider = buildProvider(config);
    const result = await provider.explainParagraph({
      paragraph: input.paragraph,
      context: input.context,
    });

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

- [ ] **Step 2: Type-check the new file**

Run:
```bash
cd ~/readablehtml && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ~/readablehtml && git add lib/documents/explain_actions.ts && git commit -m "feat(documents): add explainParagraphAction server action with BYOK support"
```

---

## Task 4: Wire AI Settings into DocumentClient

**Files:**
- Modify: `app/documents/[id]/DocumentClient.tsx`

Three sub-edits: (a) imports, (b) session-only state next to existing state, (c) mount the popover in the toolbar, (d) pass config into `restructureWithAI` and downstream into `ReadingView`.

- [ ] **Step 1: Add the import**

Open `app/documents/[id]/DocumentClient.tsx`. Find the existing block of `@/components/...` imports (after `import { ViewToggle, type ViewMode } from "@/components/ViewToggle";`). Add this line immediately after:

```ts
import {
  AiSettingsButton,
  aiSettingsDefault,
  type AiSettingsValue,
} from "@/components/AiSettings";
```

- [ ] **Step 2: Add session-only state**

Inside the `DocumentClient` function component, alongside the other `useState`/`useTransition` declarations (e.g. near `setRestructureError`, `setRestructureInfo`), add:

```ts
// session-only; do not persist (no localStorage, no cookies)
const [aiSettings, setAiSettings] = useState<AiSettingsValue>(() =>
  aiSettingsDefault(),
);
```

The lazy initializer (`() => aiSettingsDefault()`) ensures `makeDisplayLabel` runs once at mount, not on every render.

- [ ] **Step 3: Pass providerConfig into restructureWithAI**

Find the existing call at the original line ~501:

```ts
const res = await restructureWithAI(document.id);
```

Replace with:

```ts
const res = await restructureWithAI(document.id, aiSettings.config);
```

Leave the surrounding `startRestructureAi(async () => { … })` block untouched.

- [ ] **Step 4: Mount the AiSettingsButton in the toolbar**

Locate the JSX that renders the existing "Restructure with AI" button (search the file for `Wand2` — the icon imported at the top — or for the verbatim string `"Restructure with AI"`). The button lives inside a toolbar row. Add the `<AiSettingsButton>` immediately BEFORE that row's existing buttons, so the AI provider chip sits to the left of the action buttons:

```tsx
<AiSettingsButton value={aiSettings} onChange={setAiSettings} />
```

Do not add wrapper divs, gap classes, or whitespace tweaks beyond the existing flexbox container's behavior — the button is already self-styled.

- [ ] **Step 5: Pass aiSettings.config into ReadingView**

Find every `<ReadingView` JSX usage in this file (typically 1–2 sites: standalone reading view + inside SplitView). On each, add the new prop:

```tsx
<ReadingView
  /* ...existing props unchanged... */
  aiProviderConfig={aiSettings.config}
/>
```

If `ReadingView` is also rendered inside `<SplitView>`, pass the same prop through to SplitView and forward it inside SplitView the same way. (Verify by searching for `<SplitView` and `<ReadingView` in the file.)

- [ ] **Step 6: Build to catch type drift**

Run:
```bash
cd ~/readablehtml && rm -rf .next && NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder_anon_key npm run build 2>&1 | tail -40
```
Expected: build will FAIL with a TypeScript error saying `aiProviderConfig` is not a valid prop on `ReadingView`. **This is the correct intermediate state** — Task 5 adds the prop to ReadingView's interface.

- [ ] **Step 7: Commit**

```bash
cd ~/readablehtml && git add app/documents/[id]/DocumentClient.tsx && git commit -m "feat(document-client): wire AI Settings popover + pass providerConfig to AI flows"
```

---

## Task 5: Add per-paragraph Explain pill in ReadingView

**Files:**
- Modify: `components/ReadingView.tsx`

This task touches three regions of the same file: (a) the public `Props` interface, (b) the `<ParagraphView` JSX call site, (c) the `ParagraphView` component body.

- [ ] **Step 1: Add imports for the new action and helper**

At the top of `components/ReadingView.tsx`, alongside the existing `@/lib/*` imports, add:

```ts
import { explainParagraphAction } from "@/lib/documents/explain_actions";
import { llmErrorMessage } from "@/lib/llm/messages";
import { makeDisplayLabel } from "@/components/AiSettings";
import type { LlmErrorCode, LlmProviderConfig } from "@/lib/llm/types";
```

Lucide icons: `Sparkles` is already imported at the top of the file (verify by searching the existing import block for `Sparkles,`). Also ensure these are present in the lucide-react import — add any that are missing:

```ts
import { /* ...existing... */ Sparkles, X as XIcon, Loader2 } from "lucide-react";
```

(Many of these may already be imported. Only add the missing names. Do not import duplicates.)

- [ ] **Step 2: Extend the public Props interface**

Find the `interface Props { … }` declaration near the top of `ReadingView.tsx` (around line 53). Add a new optional field to the bottom of the interface, just before the closing brace:

```ts
interface Props {
  /* ...all existing fields unchanged... */
  /** Active LLM provider config (passed from DocumentClient session state). */
  aiProviderConfig?: LlmProviderConfig;
  /** Document ID — needed for the per-paragraph Explain action. */
  documentId?: string;
}
```

Then in the `ReadingView` function signature destructure, add the new params with their existing siblings:

```ts
export function ReadingView({
  /* ...existing destructured props... */
  aiProviderConfig,
  documentId,
}: Props) {
```

- [ ] **Step 3: Pass new props down to ParagraphView call site**

Find the `<ParagraphView` JSX (originally at line 674). Add two new props to it:

```tsx
<ParagraphView
  /* ...existing props unchanged... */
  aiProviderConfig={aiProviderConfig}
  documentId={documentId}
/>
```

- [ ] **Step 4: Extend ParagraphView's props type**

Find the inline props type on `function ParagraphView({ … }: { … })` (originally at line 150). Add the two new optional fields to the type literal:

```ts
function ParagraphView({
  /* ...existing destructured props... */
  aiProviderConfig,
  documentId,
}: {
  /* ...existing type fields unchanged... */
  aiProviderConfig?: LlmProviderConfig;
  documentId?: string;
}) {
```

- [ ] **Step 5: Add Explain state inside ParagraphView**

Immediately after the existing local declarations in `ParagraphView` (e.g. `const textOnly = …; const fullText = …;`), add:

```ts
const [explainState, setExplainState] = useState<
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ok";
      explanation: string;
      badge: string;
    }
  | { status: "error"; message: string; code?: LlmErrorCode }
>({ status: "idle" });

const canExplain =
  documentId != null &&
  para.blockType !== "table" &&
  para.blockType !== "header_footer" &&
  para.blockType !== "metadata" &&
  !para.hidden;

async function handleExplain() {
  if (!documentId) return;
  setExplainState({ status: "loading" });
  const paragraphText = textOnly
    ? fullText
    : (para.caption ?? "").trim() || "";
  if (paragraphText.length === 0) {
    setExplainState({
      status: "error",
      message: "Nothing to explain in this paragraph.",
    });
    return;
  }
  const res = await explainParagraphAction({
    documentId,
    paragraph: paragraphText,
    providerConfig: aiProviderConfig,
  });
  if ("ok" in res && res.ok) {
    const badge = makeDisplayLabel(
      aiProviderConfig ?? { source: "platform" },
    );
    setExplainState({
      status: "ok",
      explanation: res.data.explanation,
      badge,
    });
  } else if ("error" in res) {
    setExplainState({
      status: "error",
      message: res.code ? llmErrorMessage(res.code, res.error) : res.error,
      code: res.code,
    });
  }
}
```

- [ ] **Step 6: Render the Explain pill and inline result**

Inside the existing `<div className="group relative …" …>` wrapper that `ParagraphView` returns for body paragraphs (the non-table branch), add the pill button just before the closing tag of the paragraph's hover-action row. The hover-action row is the same area that hosts the existing "Hide" / "Restore" controls (search for the `EyeOff` icon usage inside `ParagraphView` to locate it).

Add this fragment alongside the existing per-paragraph buttons (replace `{/* explain button */}` with the actual JSX — do not leave the comment):

```tsx
{canExplain && (
  <button
    type="button"
    onClick={handleExplain}
    disabled={explainState.status === "loading"}
    title="Explain this paragraph"
    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line bg-paper text-[12px] font-medium text-ink-muted hover:text-ink hover:border-accent/50 hover:bg-paper-raised disabled:opacity-60 disabled:cursor-wait no-tap-highlight"
  >
    {explainState.status === "loading" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
    ) : (
      <Sparkles className="h-3.5 w-3.5 text-accent" />
    )}
    <span className="hidden sm:inline">Explain</span>
  </button>
)}
```

Then, AFTER the paragraph's `<p>` element but still inside the wrapper `<div>`, render the inline result block:

```tsx
{explainState.status === "ok" && (
  <div
    role="region"
    aria-label="AI explanation"
    className="mt-2 ml-0 sm:ml-[58px] rounded-lg border border-line bg-paper-raised shadow-soft overflow-hidden"
  >
    <div className="px-3 py-2 border-b border-line bg-paper-sunken/40 flex items-center justify-between gap-2">
      <span className="eyebrow inline-flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-accent" />
        Explanation
        <span className="ml-1 text-ink-faint normal-case tracking-normal">
          · {explainState.badge}
        </span>
      </span>
      <button
        type="button"
        onClick={() => setExplainState({ status: "idle" })}
        className="h-6 w-6 grid place-items-center rounded-md text-ink-faint hover:text-ink hover:bg-paper-raised transition-colors"
        aria-label="Dismiss explanation"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
    <div className="px-3 py-3 text-[13.5px] leading-relaxed text-ink font-serif">
      {explainState.explanation}
    </div>
  </div>
)}
{explainState.status === "error" && (
  <div
    role="alert"
    className="mt-2 ml-0 sm:ml-[58px] rounded-lg border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-[12.5px] text-ink"
  >
    <div className="flex items-start justify-between gap-2">
      <span>{explainState.message}</span>
      <button
        type="button"
        onClick={() => setExplainState({ status: "idle" })}
        className="h-6 w-6 grid place-items-center rounded-md text-ink-faint hover:text-ink hover:bg-paper-raised transition-colors -mr-1 -mt-0.5"
        aria-label="Dismiss error"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 7: Type-check**

Run:
```bash
cd ~/readablehtml && npx tsc --noEmit
```
Expected: no errors. If `useState` isn't already imported at the top, add it to the existing `react` import.

- [ ] **Step 8: Commit**

```bash
cd ~/readablehtml && git add components/ReadingView.tsx && git commit -m "feat(reading-view): add per-paragraph Explain pill driven by BYOK provider config"
```

---

## Task 6: Final build + lint + manual smoke

**Files:** None modified.

- [ ] **Step 1: Lint the whole project**

Run:
```bash
cd ~/readablehtml && npm run lint
```
Expected: no errors. Warnings are acceptable if they predate this PR.

- [ ] **Step 2: Full build (with placeholder env so Supabase initialization doesn't block)**

Run:
```bash
cd ~/readablehtml && rm -rf .next && NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder_anon_key npm run build 2>&1 | tee /tmp/byok-build.log | tail -20
```
Expected: build succeeds. Reference (from project_readablehtml memory): "Last successful build: 8 routes, `/documents/[id]` ~5.92 kB, middleware 82.5 kB." `/documents/[id]` route size may grow by ~1–3 kB.

If the build fails:
- Read `/tmp/byok-build.log` to find the failing file:line:col.
- Cross-reference with the spec.
- Fix the offending file. Do NOT bypass with `// @ts-ignore`.
- Re-run this step.

- [ ] **Step 3: Manual smoke (developer runs locally — record results below)**

These steps require live Supabase + an `.env.local` with real credentials. The plan executor should run them and record pass/fail. (If running in CI/headless, mark this step with the note "verified by build only — manual smoke deferred to user.")

1. `npm run dev`, sign in, open any existing document with `status = "ready"`.
2. Toolbar shows `AI · Platform · gpt-4o-mini`.
3. Click the AI badge → popover opens. Switch to "DeepSeek (bring your own key)" → paste any string (e.g. `sk-test-deliberately-wrong`) → Save. Badge updates to `AI · DeepSeek (BYOK) · deepseek-v4-flash`.
4. Hover over a body paragraph → "Explain" pill appears at the right edge. Click it.
5. Inline amber banner appears with "Your API key was rejected. Update it in AI Settings." Click the X to dismiss.
6. Open AI Settings → switch back to Platform → Save. Click Explain on a paragraph → loading spinner → inline explanation card with badge `Platform · gpt-4o-mini`. Dismiss with X.
7. Open Supabase SQL editor (or use the dashboard's usage chip): note current `user_usage.ai_actions` count. Now switch to BYOK with a real DeepSeek key, run "Restructure with AI", then check the counter again — it must NOT have incremented.
8. Reload the document page. Toolbar shows `AI · Platform · gpt-4o-mini` (session-only state reset confirmed).
9. Open DevTools → Application → Storage. `localStorage` for the document origin contains NO key matching `aiSettings`, `apiKey`, `deepseek`, or `byok`. Search the entire localStorage value strings for "sk-" — no matches.

- [ ] **Step 4: Commit any incidental fixes from build/lint**

If the build or lint step required follow-up edits, group them in a single commit:

```bash
cd ~/readablehtml && git add -A && git diff --cached --stat
# review the diff
git commit -m "chore(byok): build/lint cleanups for BYOK feature"
```

If nothing to commit, skip.

---

## Self-Review Notes (writer to executor)

Spec coverage walkthrough:

| Spec requirement | Implementing task |
|---|---|
| 1. LLM provider abstraction (`summarizeSection`, `explainParagraph`, `translateText later`) | Already in code; Tasks 3–5 add the public `explainParagraphAction` entry point. |
| 2. Keep existing OpenAI support | No code change needed; verified by Task 6 build. |
| 3. Add `DeepSeekProvider` using OpenAI-compatible API | Already in `OpenAiCompatibleProvider`. |
| 4. DeepSeek defaults (baseURL, model, optional model) | Already in `LLM_DEFAULTS`. |
| 5. Do not store user keys in localStorage | Task 4 Step 2 uses `useState` + invariant comment; Task 6 Step 3 verifies via DevTools. |
| 6. Paste DeepSeek key in AI Settings panel, session-memory only | Tasks 4 + 6 wire and verify. |
| 7. Server actions receive provider config securely | Tasks 3, 4, 5 — config flows via `useState` → server-action wire only. |
| 8. Never expose server OpenAI key to client | `lib/llm/provider.ts` is `"server-only"`; Task 3 inherits this. |
| 9. BYOK skips platform quota; no separate tracking | Task 3 Steps 1 (peek skip) + 1 (consume skip). Verified by Task 6 Step 3.7. |
| 10. Fallback to platform when no key | Default `aiSettings` from `aiSettingsDefault()` is `{source:"platform"}`; Task 4 Step 2. |
| 11. UI copy "Use your own DeepSeek API key. Your key is used only for this request and is not stored." | Already in `AiSettings.tsx`; no change. |
| 12. Errors for invalid key, provider unavailable, rate limit, unsupported model | Tasks 1 + 3 + 5. |
| 13. No payments/Chandra/OCR/sharing | Not in any task; out of scope. |
| 14. Run `npm run build` | Task 6 Step 2. |
