"use client";

import { useMemo } from "react";
import { BookMarked, Clock, ChevronRight } from "lucide-react";
import { cn, readingMinutes, sectionPageRange, sectionWordCount } from "@/lib/utils";
import {
  sections as defaultSections,
  bookTitle as defaultBookTitle,
  bookAuthor as defaultBookAuthor,
  type Section,
} from "@/lib/content";
import type { Note } from "./NotesPanel";

interface Props {
  activeId: string;
  setActiveId: (id: string) => void;
  notes: Note[];
  variant?: "desktop" | "drawer";
  onSelect?: () => void;
  sections?: Section[];
  bookTitle?: string;
  bookAuthor?: string;
}

export function Sidebar({
  activeId,
  setActiveId,
  notes,
  variant = "desktop",
  onSelect,
  sections = defaultSections,
  bookTitle = defaultBookTitle,
  bookAuthor = defaultBookAuthor,
}: Props) {
  const stats = useMemo(
    () =>
      sections.map((s) => {
        const words = sectionWordCount(s);
        return {
          id: s.id,
          words,
          minutes: readingMinutes(words),
          range: sectionPageRange(s),
          noteCount: notes.filter((n) => n.sectionId === s.id).length,
        };
      }),
    [notes, sections],
  );

  const totalMinutes = stats.reduce((s, x) => s + x.minutes, 0);
  const activeIndex = sections.findIndex((s) => s.id === activeId);
  const progress = Math.round(((activeIndex + 1) / sections.length) * 100);

  return (
    <aside
      className={cn(
        "flex flex-col bg-paper",
        variant === "desktop"
          ? "hidden lg:flex w-72 shrink-0 border-r border-line"
          : "h-full w-full",
      )}
    >
      <div className="px-5 pt-5 pb-4 border-b border-line">
        <div className="flex items-center gap-1.5 mb-3">
          <BookMarked className="h-3 w-3 text-accent" />
          <span className="eyebrow">Current Reading</span>
        </div>
        <h2 className="font-serif text-[18px] leading-[1.2] tracking-tightish text-ink">
          {bookTitle}
        </h2>
        <p className="mt-1 text-[12px] text-ink-muted leading-snug">
          {bookAuthor}
        </p>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-subtle">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span className="tabular-nums">{totalMinutes} min total</span>
          </span>
          <span className="h-1 w-1 rounded-full bg-line-strong" />
          <span className="tabular-nums">{sections.length} sections</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scroll-fade py-3">
        <div className="px-3">
          <div className="flex items-center justify-between px-2 py-2">
            <span className="eyebrow">Contents</span>
            <span className="text-2xs text-ink-faint tabular-nums">
              {activeIndex + 1} / {sections.length}
            </span>
          </div>
          <ul className="space-y-0.5">
            {sections.map((s, i) => {
              const active = s.id === activeId;
              const stat = stats[i];
              return (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      setActiveId(s.id);
                      onSelect?.();
                    }}
                    className={cn(
                      "w-full text-left group flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-200 no-tap-highlight relative",
                      active
                        ? "bg-paper-sunken text-ink"
                        : "text-ink-muted hover:bg-paper-sunken/60 hover:text-ink",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" />
                    )}
                    <span
                      className={cn(
                        "mt-[3px] font-sans text-[10px] font-medium tabular-nums w-5 shrink-0",
                        active ? "text-accent" : "text-ink-faint",
                      )}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className={cn(
                          "block text-[13px] leading-snug",
                          active && "font-medium",
                        )}
                      >
                        {s.title}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[10.5px] text-ink-subtle">
                        <span className="tabular-nums">
                          p. {stat.range.start}
                          {stat.range.end !== stat.range.start
                            ? `–${stat.range.end}`
                            : ""}
                        </span>
                        <span className="h-0.5 w-0.5 rounded-full bg-line-strong" />
                        <span className="tabular-nums">{stat.minutes} min</span>
                        {stat.noteCount > 0 && (
                          <>
                            <span className="h-0.5 w-0.5 rounded-full bg-line-strong" />
                            <span className="inline-flex items-center gap-0.5 text-accent">
                              <span className="tabular-nums">{stat.noteCount}</span>
                              <span>note{stat.noteCount === 1 ? "" : "s"}</span>
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 mt-0.5 shrink-0 transition-all",
                        active
                          ? "text-accent opacity-100 translate-x-0"
                          : "text-ink-faint opacity-0 -translate-x-1 group-hover:opacity-60 group-hover:translate-x-0",
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="px-5 py-4 border-t border-line bg-paper-sunken/40">
        <div className="flex items-center justify-between mb-1.5">
          <span className="eyebrow">Progress</span>
          <span className="text-2xs text-ink-muted tabular-nums">
            {progress}%
          </span>
        </div>
        <div className="h-1 rounded-full bg-paper-deep overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </aside>
  );
}
