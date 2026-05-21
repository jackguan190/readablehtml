"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  title?: string;
  children: React.ReactNode;
}

export function Drawer({ open, onClose, side, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 xl:hidden">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "absolute top-0 bottom-0 w-[88%] max-w-sm bg-paper shadow-lift flex flex-col",
          side === "left"
            ? "left-0 animate-slide-in-left rounded-r-2xl"
            : "right-0 animate-slide-in-right rounded-l-2xl",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-line shrink-0">
          <span className="eyebrow">{title}</span>
          <button
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-paper-sunken text-ink-muted hover:text-ink transition-colors no-tap-highlight"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      </aside>
    </div>
  );
}
