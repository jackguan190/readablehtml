"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2, X, KeyRound, AlertCircle, Check } from "lucide-react";
import { LLM_DEFAULTS, type LlmProviderConfig } from "@/lib/llm/types";
import { cn } from "@/lib/utils";

type ProviderChoice = "platform" | "byok_deepseek" | "byok_openai";

export interface AiSettingsValue {
  config: LlmProviderConfig;
  /** Stable string for UI badges ("Platform · gpt-4o-mini" / "DeepSeek (BYOK) · deepseek-v4-flash"). */
  displayLabel: string;
}

interface Props {
  /** Current settings. */
  value: AiSettingsValue;
  /** Save a new value. Caller is responsible for keeping the key in session memory ONLY (no localStorage). */
  onChange: (next: AiSettingsValue) => void;
}

function makeDisplayLabel(config: LlmProviderConfig): string {
  if (config.source === "platform") {
    return `Platform · ${config.model ?? LLM_DEFAULTS.openai.defaultModel}`;
  }
  const providerName = config.provider === "deepseek" ? "DeepSeek" : "OpenAI";
  const model =
    config.model ??
    (config.provider === "deepseek"
      ? LLM_DEFAULTS.deepseek.defaultModel
      : LLM_DEFAULTS.openai.defaultModel);
  return `${providerName} (BYOK) · ${model}`;
}

export function aiSettingsDefault(): AiSettingsValue {
  const config: LlmProviderConfig = { source: "platform" };
  return { config, displayLabel: makeDisplayLabel(config) };
}

export function AiSettingsButton({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ProviderChoice>(() => {
    if (value.config.source === "platform") return "platform";
    return value.config.provider === "deepseek"
      ? "byok_deepseek"
      : "byok_openai";
  });
  const [apiKey, setApiKey] = useState<string>(() =>
    value.config.source === "byok" ? value.config.apiKey : "",
  );
  const [model, setModel] = useState<string>(() => {
    if (value.config.source === "byok") {
      return (
        value.config.model ??
        (value.config.provider === "deepseek"
          ? LLM_DEFAULTS.deepseek.defaultModel
          : LLM_DEFAULTS.openai.defaultModel)
      );
    }
    return value.config.model ?? LLM_DEFAULTS.openai.defaultModel;
  });

  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleSave() {
    let config: LlmProviderConfig;
    if (choice === "platform") {
      config = { source: "platform", model };
    } else {
      const provider = choice === "byok_deepseek" ? "deepseek" : "openai";
      config = {
        source: "byok",
        provider,
        apiKey: apiKey.trim(),
        model: model.trim() || undefined,
      };
    }
    onChange({ config, displayLabel: makeDisplayLabel(config) });
    setOpen(false);
  }

  const modelChoices =
    choice === "byok_deepseek"
      ? LLM_DEFAULTS.deepseek.models
      : LLM_DEFAULTS.openai.models;
  const byokKeyMissing =
    (choice === "byok_deepseek" || choice === "byok_openai") &&
    apiKey.trim().length === 0;

  // When choice changes, snap model to the new provider's default.
  function setChoiceAndModel(next: ProviderChoice) {
    setChoice(next);
    if (next === "byok_deepseek") setModel(LLM_DEFAULTS.deepseek.defaultModel);
    else setModel(LLM_DEFAULTS.openai.defaultModel);
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="AI settings — choose provider and model"
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line bg-paper text-[12px] font-medium text-ink-muted hover:text-ink hover:border-accent/50 hover:bg-paper-raised transition-colors no-tap-highlight"
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">AI</span>
        <span className="text-ink-faint truncate max-w-[18ch]">
          · {value.displayLabel}
        </span>
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="AI provider settings"
          className="absolute right-0 mt-2 w-[340px] z-50 rounded-xl border border-line bg-paper shadow-lift overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-line bg-paper-sunken/40 flex items-center justify-between">
            <span className="eyebrow inline-flex items-center gap-1.5">
              <KeyRound className="h-3 w-3 text-accent" />
              AI Settings
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-6 w-6 grid place-items-center rounded-md text-ink-faint hover:text-ink hover:bg-paper-raised transition-colors"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="px-4 py-3 space-y-3 text-[12.5px]">
            <fieldset className="space-y-1.5">
              <legend className="text-2xs uppercase tracking-eyebrow text-ink-faint mb-1">
                Provider
              </legend>
              <ProviderRadio
                checked={choice === "platform"}
                onChange={() => setChoiceAndModel("platform")}
                label="Platform (OpenAI)"
                hint="Consumes your monthly AI quota."
              />
              <ProviderRadio
                checked={choice === "byok_deepseek"}
                onChange={() => setChoiceAndModel("byok_deepseek")}
                label="DeepSeek (bring your own key)"
                hint="Uses your DeepSeek key. No platform quota consumed."
              />
              <ProviderRadio
                checked={choice === "byok_openai"}
                onChange={() => setChoiceAndModel("byok_openai")}
                label="OpenAI (bring your own key)"
                hint="Uses your OpenAI key. No platform quota consumed."
              />
            </fieldset>

            {(choice === "byok_deepseek" || choice === "byok_openai") && (
              <div className="space-y-2 pt-1">
                <label className="block">
                  <span className="text-2xs uppercase tracking-eyebrow text-ink-faint">
                    API key
                  </span>
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      choice === "byok_deepseek" ? "sk-…" : "sk-…"
                    }
                    className="mt-1 w-full h-9 rounded-md border border-line bg-paper-raised px-2.5 text-[13px] text-ink placeholder:text-ink-subtle outline-none focus:border-accent/60 focus:shadow-soft transition-all font-mono"
                  />
                </label>

                <label className="block">
                  <span className="text-2xs uppercase tracking-eyebrow text-ink-faint">
                    Model
                  </span>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-line bg-paper-raised px-2 text-[13px] text-ink outline-none focus:border-accent/60 focus:shadow-soft transition-all"
                  >
                    {modelChoices.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="flex items-start gap-1.5 text-[11.5px] text-ink-muted leading-snug">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-accent" />
                  <span>
                    Use your own
                    {choice === "byok_deepseek" ? " DeepSeek " : " OpenAI "}
                    API key. Your key is used only for this request and is not
                    stored.
                  </span>
                </p>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-line -mx-4 px-4 mt-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-8 px-3 rounded-md text-[12px] font-medium text-ink-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={byokKeyMissing}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-medium transition-colors no-tap-highlight",
                  byokKeyMissing
                    ? "bg-paper-sunken text-ink-faint cursor-not-allowed"
                    : "bg-ink text-paper hover:bg-ink/90",
                )}
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderRadio({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={cn(
        "block rounded-md border px-2.5 py-2 cursor-pointer transition-colors",
        checked
          ? "border-accent/50 bg-accent/[0.05]"
          : "border-line bg-paper hover:bg-paper-raised",
      )}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name="ai-provider-choice"
          className="accent-accent"
          checked={checked}
          onChange={onChange}
        />
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
      </span>
      <span className="block pl-6 mt-0.5 text-[11.5px] text-ink-muted leading-snug">
        {hint}
      </span>
    </label>
  );
}
