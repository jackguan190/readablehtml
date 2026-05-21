"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Underline, StickyNote, Highlighter } from "lucide-react";
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_COLOR_ORDER,
  type HighlightColor,
  type HighlightStyle,
} from "@/lib/annotations/colors";
import { cn } from "@/lib/utils";

interface BaseProps {
  rect: DOMRect;
  onClose: () => void;
}

interface SingleProps extends BaseProps {
  variant: "single";
  onPickHighlight: (color: HighlightColor, style: HighlightStyle) => void;
  onPickNote: (color: HighlightColor) => void;
}

interface MultiProps extends BaseProps {
  variant: "multi";
}

type Props = SingleProps | MultiProps;

const TOOLBAR_GAP = 8;

function computePosition(rect: DOMRect, height: number) {
  if (typeof window === "undefined") {
    return { top: 0, left: 0 };
  }
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const above = rect.top - height - TOOLBAR_GAP;
  const useAbove = above > 8;
  const top = useAbove
    ? rect.top + scrollY - height - TOOLBAR_GAP
    : rect.bottom + scrollY + TOOLBAR_GAP;
  const left = rect.left + scrollX + rect.width / 2;
  return { top, left };
}

export function AnnotationToolbar(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeColor, setActiveColor] = useState<HighlightColor>("yellow");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        props.onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [props]);

  if (!mounted) return null;

  const { top, left } = computePosition(props.rect, 44);

  if (props.variant === "multi") {
    return createPortal(
      <div
        ref={ref}
        role="status"
        style={{
          position: "absolute",
          top,
          left,
          transform: "translateX(-50%)",
        }}
        className="z-50 rounded-lg border border-line bg-paper shadow-lift px-3 py-1.5 text-[12px] text-ink-muted animate-fade-in"
      >
        Multi-paragraph highlights coming soon.
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={ref}
      role="toolbar"
      aria-label="Annotate selection"
      style={{
        position: "absolute",
        top,
        left,
        transform: "translateX(-50%)",
      }}
      // prevent toolbar mousedown from collapsing the native selection
      onMouseDown={(e) => e.preventDefault()}
      className="z-50 inline-flex items-center gap-0.5 rounded-full border border-line bg-paper shadow-lift px-1.5 py-1 animate-fade-in"
    >
      {HIGHLIGHT_COLOR_ORDER.map((c) => {
        const palette = HIGHLIGHT_COLORS[c];
        const active = c === activeColor;
        return (
          <button
            key={c}
            type="button"
            title={`Highlight · ${c}`}
            aria-label={`Highlight ${c}`}
            onMouseEnter={() => setActiveColor(c)}
            onClick={() => props.onPickHighlight(c, "highlight")}
            className="h-7 w-7 grid place-items-center rounded-full hover:scale-110 transition-transform no-tap-highlight"
          >
            <span
              className={cn(
                "h-4 w-4 rounded-full border transition-shadow",
                active ? "ring-1 ring-offset-1 ring-offset-paper" : "",
              )}
              style={{
                backgroundColor: palette.swatch,
                borderColor: palette.ring,
                boxShadow: active
                  ? `0 0 0 1px ${palette.ring}`
                  : "inset 0 0 0 1px rgba(0,0,0,0.05)",
              }}
            />
          </button>
        );
      })}
      <span className="mx-1 h-5 w-px bg-line" />
      <ToolButton
        title={`Underline · ${activeColor}`}
        onClick={() => props.onPickHighlight(activeColor, "underline")}
      >
        <Underline className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title={`Add note to selection (color: ${activeColor})`}
        onClick={() => props.onPickNote(activeColor)}
      >
        <StickyNote className="h-3.5 w-3.5" />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-line" />
      <span className="inline-flex items-center gap-1 pr-1.5 text-[10px] uppercase tracking-eyebrow text-ink-faint">
        <Highlighter className="h-2.5 w-2.5 text-accent" />
        <span>Annotate</span>
      </span>
    </div>,
    document.body,
  );
}

function ToolButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="h-7 w-7 grid place-items-center rounded-full hover:bg-paper-sunken text-ink-muted hover:text-ink transition-colors no-tap-highlight"
    >
      {children}
    </button>
  );
}
