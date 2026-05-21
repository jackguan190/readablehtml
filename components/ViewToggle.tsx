"use client";

import { FileText, Sparkles, Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "before" | "after" | "split";

interface Props {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  size?: "sm" | "md";
}

const items: { id: ViewMode; label: string; Icon: typeof FileText }[] = [
  { id: "before", label: "Before", Icon: FileText },
  { id: "after", label: "After", Icon: Sparkles },
  { id: "split", label: "Split", Icon: Columns2 },
];

export function ViewToggle({ mode, setMode, size = "md" }: Props) {
  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="inline-flex items-center rounded-lg border border-line bg-paper p-0.5 shadow-soft"
    >
      {items.map(({ id, label, Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => setMode(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition-all duration-200 no-tap-highlight",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              active
                ? "bg-ink text-paper shadow-soft"
                : "text-ink-muted hover:text-ink hover:bg-paper-sunken",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
